import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { StockfishController } from '../../resources/js/engine/stockfishController.js';

const startFen = new Chess().fen();

function harness({ random = () => 0, minElo = 1320, maxElo = 3190 } = {}) {
    const commands = [];
    const messages = [];
    const controller = new StockfishController({
        send: (command) => commands.push(command),
        onMessage: (message) => messages.push(message),
        random,
    });

    function advertise() {
        for (const line of [
            'id name Stockfish 18 Lite WASM',
            'option name Threads type spin default 1 min 1 max 1',
            'option name Hash type spin default 16 min 1 max 33554432',
            'option name Ponder type check default false',
            'option name MultiPV type spin default 1 min 1 max 256',
            'option name Skill Level type spin default 20 min 0 max 20',
            'option name UCI_LimitStrength type check default false',
            `option name UCI_Elo type spin default ${minElo} min ${minElo} max ${maxElo}`,
            'uciok',
        ])
            controller.handleLine(line);
    }

    function ready() {
        controller.handleMessage({ type: 'warmup' });
        advertise();
        controller.handleLine('readyok');
    }

    function search(overrides = {}) {
        const request = {
            id: 1,
            fen: startFen,
            moves: [],
            elo: 1600,
            timeBudgetMs: 650,
            gameId: 1,
            ...overrides,
        };
        controller.handleMessage(request);
        return request;
    }

    return { controller, commands, messages, advertise, ready, search };
}

test('UCI readiness applies a bounded configuration and warms only once', () => {
    const { controller, commands, messages, advertise } = harness();
    controller.handleMessage({ type: 'warmup' });
    assert.deepEqual(commands, ['uci']);
    assert.equal(messages.length, 0);
    advertise();
    assert.ok(commands.includes('setoption name Threads value 1'));
    assert.ok(commands.includes('setoption name Hash value 16'));
    assert.ok(commands.includes('setoption name Ponder value false'));
    assert.equal(commands.at(-1), 'isready');
    assert.equal(messages.length, 0);
    controller.handleLine('readyok');
    assert.equal(messages.at(-1).type, 'ready');
    controller.handleMessage({ type: 'warmup' });
    assert.equal(commands.filter((command) => command === 'uci').length, 1);
});

test('a request queued during initialization waits for both readiness barriers', () => {
    const { controller, commands, messages, advertise, search } = harness();
    const request = search();
    assert.deepEqual(commands, ['uci']);
    advertise();
    controller.handleLine('readyok');
    assert.equal(
        messages.some((message) => message.type === 'searching'),
        false,
    );
    assert.equal(
        commands.some((command) => command.startsWith('go ')),
        false,
    );
    controller.handleLine('readyok');
    assert.equal(commands.at(-1), 'go movetime 650');
    assert.deepEqual(messages.at(-1), {
        type: 'searching',
        id: request.id,
        fen: request.fen,
    });
    controller.handleLine('bestmove e2e4 ponder e7e5');
    assert.equal(messages.at(-1).id, request.id);
    assert.equal(messages.at(-1).fen, request.fen);
    assert.deepEqual(messages.at(-1).move, { from: 'e2', to: 'e4' });
});

test('native ratings use advertised bounds and maximum strength removes the limit', () => {
    const { controller, commands, ready, search } = harness({
        minElo: 1400,
        maxElo: 2900,
    });
    ready();
    search({ elo: 1600 });
    assert.ok(commands.includes('setoption name UCI_LimitStrength value true'));
    assert.ok(commands.includes('setoption name UCI_Elo value 1600'));
    assert.ok(commands.includes('setoption name MultiPV value 1'));
    controller.handleLine('readyok');
    controller.handleLine('bestmove e2e4');
    search({ id: 2, elo: 3100 });
    assert.ok(commands.includes('setoption name UCI_Elo value 2900'));
    controller.handleLine('readyok');
    controller.handleLine('bestmove e2e4');
    const before = commands.length;
    search({ id: 3, elo: 3200 });
    assert.ok(
        commands
            .slice(before)
            .includes('setoption name UCI_LimitStrength value false'),
    );
    assert.ok(commands.includes('setoption name Skill Level value 20'));
});

test('beginner profiles choose among analyzed candidates and restore native settings afterward', () => {
    const { controller, commands, messages, ready, search } = harness({
        random: () => 0.9999,
    });
    ready();
    search({ elo: 800 });
    assert.ok(commands.includes('setoption name MultiPV value 8'));
    controller.handleLine('readyok');
    controller.handleLine('info depth 6 multipv 1 score cp 80 pv e2e4 e7e5');
    controller.handleLine('info depth 6 multipv 2 score cp 40 pv d2d4 d7d5');
    controller.handleLine('bestmove e2e4');
    assert.deepEqual(messages.at(-1).move, { from: 'd2', to: 'd4' });
    const before = commands.length;
    search({ id: 2, elo: 1600 });
    assert.ok(
        commands.slice(before).includes('setoption name MultiPV value 1'),
    );
    assert.ok(
        commands
            .slice(before)
            .includes('setoption name UCI_LimitStrength value true'),
    );
});

test('cancel drains bestmove before starting a replacement search on the same engine', () => {
    const { controller, commands, messages, ready, search } = harness();
    ready();
    search();
    controller.handleLine('readyok');
    controller.handleMessage({ type: 'cancel' });
    assert.equal(commands.at(-1), 'stop');
    const next = search({ id: 2, gameId: 2 });
    assert.equal(
        commands.filter((command) => command.startsWith('go ')).length,
        1,
    );
    controller.handleLine('bestmove e2e4');
    assert.equal(
        messages.some((message) => message.move),
        false,
    );
    assert.equal(commands.at(-1), 'isready');
    controller.handleLine('readyok');
    assert.equal(
        commands.filter((command) => command.startsWith('go ')).length,
        2,
    );
    controller.handleLine('bestmove d2d4');
    assert.equal(messages.at(-1).id, next.id);
    assert.deepEqual(messages.at(-1).move, { from: 'd2', to: 'd4' });
    assert.equal(commands.filter((command) => command === 'uci').length, 1);
});

test('cancel before the search barrier never starts the obsolete position', () => {
    const { controller, commands, messages, ready, search } = harness();
    ready();
    search();
    controller.handleMessage({ type: 'cancel' });
    controller.handleLine('readyok');
    assert.equal(
        commands.some((command) => command.startsWith('go ')),
        false,
    );
    assert.equal(
        messages.some((message) => message.type === 'searching'),
        false,
    );
    search({ id: 2 });
    controller.handleLine('readyok');
    assert.equal(
        commands.filter((command) => command.startsWith('go ')).length,
        1,
    );
});

test('position commands preserve full history and do not reset the engine between moves', () => {
    const { controller, commands, ready, search } = harness();
    ready();
    const game = new Chess();
    game.move('e4');
    search({ fen: game.fen(), moves: ['e2e4'] });
    controller.handleLine('readyok');
    assert.match(commands.at(-2), /^position .* moves e2e4$/);
    controller.handleLine('bestmove e7e5');
    game.move('e5');
    game.move('Nf3');
    search({ id: 2, fen: game.fen(), moves: ['e2e4', 'e7e5', 'g1f3'] });
    controller.handleLine('readyok');
    assert.match(commands.at(-2), /^position .* moves e2e4 e7e5 g1f3$/);
    assert.equal(
        commands.filter((command) => command === 'ucinewgame').length,
        1,
    );
});

test('illegal history fails rather than inventing moves', () => {
    const { controller, messages, ready, search } = harness();
    ready();
    search({ moves: ['e2e5'] });
    assert.equal(messages.at(-1).type, 'error');
    assert.ok(messages.at(-1).error);
    assert.equal(
        messages.some((message) => message.move),
        false,
    );
});

test('a promotion suffix survives the UCI reply', () => {
    const { controller, messages, ready, search } = harness();
    ready();
    const fen = '7k/P7/8/8/8/8/8/4K3 w - - 0 1';
    search({ fen, initialFen: fen, moves: [], elo: 3200 });
    controller.handleLine('readyok');
    controller.handleLine('bestmove a7a8n');
    assert.deepEqual(messages.at(-1).move, {
        from: 'a7',
        to: 'a8',
        promotion: 'n',
    });
});

test('budgets cap long requests but preserve urgency near the clock deadline', () => {
    for (const [requested, expected] of [
        [15000, 1000],
        [500, 500],
        [50, 50],
        [-10, 50],
    ]) {
        const { controller, commands, ready, search } = harness();
        ready();
        search({ elo: 3200, timeBudgetMs: requested });
        controller.handleLine('readyok');
        assert.equal(commands.at(-1), `go movetime ${expected}`);
    }
});

test('malformed engine replies surface a failure without a replacement move', () => {
    const { controller, messages, ready, search } = harness();
    ready();
    search();
    controller.handleLine('readyok');
    controller.handleLine('bestmove malformed');
    assert.equal(messages.at(-1).type, 'error');
    assert.ok(messages.at(-1).error);
    assert.equal(
        messages.some((message) => message.move),
        false,
    );
});

test('history mismatch is rejected before searching', () => {
    const { commands, messages, ready, search } = harness();
    ready();
    search({ fen: startFen, moves: ['e2e4'] });
    assert.equal(messages.at(-1).type, 'error');
    assert.equal(
        commands.some((command) => command.startsWith('go ')),
        false,
    );
});

test('repetition history is sent intact rather than reconstructed from a FEN', () => {
    const { controller, commands, ready, search } = harness();
    ready();
    const moves = [
        'g1f3',
        'g8f6',
        'f3g1',
        'f6g8',
        'g1f3',
        'g8f6',
        'f3g1',
        'f6g8',
    ];
    const game = new Chess();
    for (const move of moves)
        game.move({ from: move.slice(0, 2), to: move.slice(2, 4) });
    assert.equal(game.isThreefoldRepetition(), true);
    search({ fen: game.fen(), moves });
    controller.handleLine('readyok');
    assert.equal(commands.at(-2), `position startpos moves ${moves.join(' ')}`);
});
