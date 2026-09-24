import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, disposePinia } from 'pinia';
import { nextTick } from 'vue';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { useChessStore } from '../../resources/js/stores/useChessStore.js';
import { TIME_PRESETS } from '../../resources/js/config/timeControls.js';

class SilentAudioContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 1;

    createBuffer() {
        return { getChannelData: () => new Float32Array(1) };
    }

    createBufferSource() {
        return this.createGain();
    }

    createBiquadFilter() {
        return this.createGain();
    }

    createOscillator() {
        return this.createGain();
    }

    createGain() {
        return {
            connect() {},
            start() {},
            stop() {},
            frequency: {},
            Q: {},
            gain: {
                setValueAtTime() {},
                exponentialRampToValueAtTime() {},
            },
        };
    }
}

function replaceGlobal(t, name, value) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value,
    });
    t.after(() => {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    });
}

function setup(t, { base = 60, playerColor = 'w', ready = true } = {}) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    t.mock.method(Math, 'random', () => 0.5);
    const workers = [];

    class MockWorker {
        messages = [];
        terminated = false;

        constructor(url, options) {
            assert.ok(url.pathname.endsWith('/workers/chessEngine.worker.js'));
            assert.equal(options.type, 'module');
            workers.push(this);
        }

        postMessage(message) {
            this.messages.push(structuredClone(message));
        }

        terminate() {
            this.terminated = true;
        }

        get requests() {
            return this.messages.filter((message) => message.id !== undefined);
        }

        ready() {
            this.onmessage?.({
                data: { type: 'ready', engine: 'Stockfish 18' },
            });
        }

        searching(request = this.requests.at(-1)) {
            this.onmessage?.({ data: { type: 'searching', ...request } });
        }

        reply(move = { from: 'e7', to: 'e5' }, overrides = {}) {
            const request = this.requests.at(-1);
            this.onmessage?.({
                data: { id: request.id, fen: request.fen, move, ...overrides },
            });
        }
    }

    replaceGlobal(t, 'window', globalThis);
    replaceGlobal(t, 'Worker', MockWorker);
    replaceGlobal(t, 'AudioContext', SilentAudioContext);
    const pinia = createPinia();
    const store = useChessStore(pinia);
    store.elo = 2400;
    store.setTimeControl(base === null ? null : { base, increment: 0 });
    store.setColorPreference(playerColor);
    t.after(() => disposePinia(pinia));
    if (ready) {
        store.prepareEngine();
        workers[0].ready();
    }

    function select(square) {
        const tile = store.flattenedBoard.find(
            (entry) => entry.square === square,
        );
        store.selectSquare(tile);
    }

    function move(from, to) {
        select(from);
        select(to);
    }

    function beginSearch() {
        store.startGame();
        if (playerColor === 'w') move('e2', 'e4');
        assert.equal(workers.length, 1);
        assert.equal(workers[0].requests.length, 1);
        workers[0].searching();
        assert.equal(store.botThinking, true);
        return workers[0];
    }

    return { store, workers, pinia, select, move, beginSearch };
}

function playLine(context, moves) {
    const { store, workers, move } = context;
    for (const uci of moves) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        if (store.turn === store.playerColor) move(from, to);
        else workers[0].reply({ from, to });
    }
}

test('new sessions default to five minutes with no increment', (t) => {
    const pinia = createPinia();
    t.after(() => disposePinia(pinia));
    const store = useChessStore(pinia);
    assert.deepEqual(store.timeControl, { base: 300, increment: 0 });
    assert.equal(store.playerClock.seconds, 300);
    assert.equal(store.opponentClock.seconds, 300);
});

test('all time presets initialize both clocks and stay locked during play', (t) => {
    const { store } = setup(t);
    for (const preset of TIME_PRESETS) {
        store.newGame();
        store.setTimeControl({
            base: preset.base,
            increment: preset.increment,
        });
        store.startGame();
        assert.deepEqual(store.clocks, { w: preset.base, b: preset.base });
        store.setTimeControl({ base: 420, increment: 7 });
        assert.deepEqual(store.timeControl, {
            base: preset.base,
            increment: preset.increment,
        });
    }
});

test('invalid clock settings leave the selected control unchanged', (t) => {
    const { store } = setup(t);
    const control = { base: 420, increment: 7 };
    store.setTimeControl(control);
    control.base = 0;
    assert.deepEqual(store.timeControl, { base: 420, increment: 7 });
    for (const invalid of [
        undefined,
        {},
        { base: 0, increment: 0 },
        { base: -60, increment: 0 },
        { base: Infinity, increment: 0 },
        { base: 60.5, increment: 0 },
        { base: '300', increment: 0 },
        { base: 10801, increment: 0 },
        { base: 60, increment: -1 },
        { base: 60, increment: NaN },
        { base: 60, increment: 1.5 },
        { base: 60, increment: 181 },
    ]) {
        store.setTimeControl(invalid);
        assert.deepEqual(store.timeControl, { base: 420, increment: 7 });
    }
});

test('custom time increments are added to the player and engine after each move', (t) => {
    const { store, move, workers } = setup(t);
    store.setTimeControl({ base: 420, increment: 7 });
    store.startGame();
    t.mock.timers.tick(1000);
    move('e2', 'e4');
    assert.deepEqual(store.clocks, { w: 426, b: 420 });
    t.mock.timers.tick(1000);
    workers[0].reply();
    assert.deepEqual(store.clocks, { w: 426, b: 426 });
});

function prepareCastling(t, playerColor = 'w') {
    const context = setup(t, { playerColor });
    context.store.startGame();
    playLine(context, [
        'd2d4',
        'd7d5',
        'b1c3',
        'b8c6',
        'c1f4',
        'c8f5',
        'd1d2',
        'd8d7',
        'e2e3',
        'e7e6',
        'f1d3',
        'f8d6',
        'g1f3',
        'g8f6',
    ]);
    if (playerColor === 'b') playLine(context, ['a2a3']);
    assert.equal(context.store.isPlayerTurn, true);
    return context;
}

for (const color of ['w', 'b']) {
    for (const side of ['kingside', 'queenside']) {
        for (const targetType of ['rook', 'destination']) {
            test(`${color} can castle ${side} by clicking the ${targetType}`, (t) => {
                const { store, workers, select } = prepareCastling(t, color);
                const rank = color === 'w' ? '1' : '8';
                const kingTarget = `${side === 'kingside' ? 'g' : 'c'}${rank}`;
                const rookFrom = `${side === 'kingside' ? 'h' : 'a'}${rank}`;
                const rookTarget = `${side === 'kingside' ? 'f' : 'd'}${rank}`;
                const requestsBefore = workers[0].requests.length;
                store.showHints = false;
                select(`e${rank}`);
                assert.ok(store.legalTargets.includes(kingTarget));
                select(targetType === 'rook' ? rookFrom : kingTarget);
                assert.equal(
                    store.moveHistory.at(-1),
                    side === 'kingside' ? 'O-O' : 'O-O-O',
                );
                assert.equal(
                    store.flattenedBoard.find(
                        (tile) => tile.square === kingTarget,
                    ).piece?.type,
                    'k',
                );
                assert.equal(
                    store.flattenedBoard.find(
                        (tile) => tile.square === rookTarget,
                    ).piece?.type,
                    'r',
                );
                assert.equal(
                    store.flattenedBoard.find(
                        (tile) => tile.square === rookFrom,
                    ).piece,
                    null,
                );
                assert.equal(store.selectedSquare, null);
                assert.equal(workers[0].requests.length, requestsBefore + 1);
                assert.equal(
                    store.lastPlayedMove.flags,
                    side === 'kingside' ? 'k' : 'q',
                );
            });
        }
    }
}

for (const scenario of [
    { name: 'pieces block the path', moves: [] },
    {
        name: 'the king is in check',
        moves: ['d2d4', 'c7c6', 'e2e3', 'd7d6', 'g1f3', 'b8d7', 'f1d3', 'd8a5'],
    },
    {
        name: 'the king would cross an attacked square',
        moves: ['e2e4', 'd7d5', 'g1f3', 'c8f5', 'f1c4', 'f5h3', 'g2g3', 'd5d4'],
    },
]) {
    test(`clicking the rook does not castle when ${scenario.name}`, (t) => {
        const context = setup(t);
        const { store, select } = context;
        store.startGame();
        playLine(context, scenario.moves);
        const position = store.positionFen;
        select('e1');
        assert.equal(store.legalTargets.includes('g1'), false);
        select('h1');
        assert.equal(store.positionFen, position);
        assert.equal(store.selectedSquare, 'h1');
    });
}

for (const movedPiece of ['king', 'rook']) {
    test(`clicking the rook cannot restore castling rights after the ${movedPiece} moved`, (t) => {
        const context = prepareCastling(t);
        const { store, select } = context;
        playLine(
            context,
            movedPiece === 'king'
                ? ['e1f1', 'a7a6', 'f1e1', 'a6a5']
                : ['h1g1', 'a7a6', 'g1h1', 'a6a5'],
        );
        const position = store.positionFen;
        select('e1');
        assert.equal(store.legalTargets.includes('g1'), false);
        select('h1');
        assert.equal(store.positionFen, position);
        assert.equal(store.selectedSquare, 'h1');
    });
}

test('clicking a rook still selects and moves it when the king is not selected', (t) => {
    const { store, select } = prepareCastling(t);
    select('d2');
    select('h1');
    assert.equal(store.selectedSquare, 'h1');
    select('f1');
    assert.equal(store.moveHistory.at(-1), 'Rf1');
    assert.equal(
        store.flattenedBoard.find((tile) => tile.square === 'e1').piece?.type,
        'k',
    );
});

for (const reply of ['a7a6', 'f5d3']) {
    test(`rook-click castling premove ${reply === 'a7a6' ? 'executes if still legal' : 'is discarded if the reply makes it illegal'}`, (t) => {
        const context = prepareCastling(t);
        const { store, workers, select } = context;
        playLine(context, ['h2h3']);
        select('e1');
        select('h1');
        assert.deepEqual(store.premove, { from: 'e1', to: 'g1' });
        const movesBefore = store.moveHistory.length;
        playLine(context, [reply]);
        assert.equal(store.premove, null);
        if (reply === 'a7a6') {
            assert.equal(store.moveHistory.at(-1), 'O-O');
            assert.equal(store.moveHistory.length, movesBefore + 2);
            assert.equal(workers[0].requests.at(-1).moves.at(-1), 'e1g1');
        } else {
            assert.equal(store.moveHistory.at(-1), 'Bxd3');
            assert.equal(store.moveHistory.length, movesBefore + 1);
            assert.equal(store.isPlayerTurn, true);
        }
    });
}

test('engine warms once in the lobby and starting waits for readiness', (t) => {
    const { store, workers } = setup(t, { ready: false });
    store.startGame();
    assert.equal(store.gamePhase, 'lobby');
    assert.equal(workers.length, 1);
    assert.deepEqual(workers[0].messages, [{ type: 'warmup' }]);
    store.prepareEngine();
    assert.equal(workers.length, 1);
    t.mock.timers.tick(2000);
    assert.equal(store.gamePhase, 'lobby');
    workers[0].ready();
    store.startGame();
    assert.equal(store.gamePhase, 'playing');
});

test('board controls and clocks keep working while the worker searches', (t) => {
    const { store, beginSearch } = setup(t);
    const worker = beginSearch();
    const request = worker.requests[0];
    assert.equal(request.fen, store.positionFen);
    assert.deepEqual(request.moves, ['e2e4']);
    assert.ok(request.timeBudgetMs >= 500 && request.timeBudgetMs <= 1000);
    assert.deepEqual(store.moveHistory, ['e4']);
    store.flipBoard();
    assert.equal(store.boardFlipped, true);
    store.goToStart();
    assert.equal(store.isReviewing, true);
    store.returnToLive();
    const remaining = store.clocks.b;
    t.mock.timers.tick(1000);
    assert.equal(store.clocks.b, remaining - 1);
    assert.equal(store.clocks.w, 60);
    assert.deepEqual(store.moveHistory, ['e4']);
});

test('the position FEN follows the board through start, history, and live views', (t) => {
    const { store, beginSearch } = setup(t);
    const worker = beginSearch();
    const firstMoveFen = store.viewFen;
    worker.reply();
    const liveFen = store.viewFen;

    store.goToStart();
    assert.equal(store.viewFen, DEFAULT_POSITION);
    assert.deepEqual(
        store.flattenedBoard.map((tile) => tile.piece),
        new Chess(store.viewFen).board().flat(),
    );

    store.goForward();
    assert.equal(store.viewFen, firstMoveFen);
    assert.deepEqual(
        store.flattenedBoard.map((tile) => tile.piece),
        new Chess(store.viewFen).board().flat(),
    );

    store.returnToLive();
    assert.equal(store.viewFen, liveFen);
    assert.deepEqual(
        store.flattenedBoard.map((tile) => tile.piece),
        new Chess(store.viewFen).board().flat(),
    );
});

test('a valid reply commits exactly one move and returns control to the player', (t) => {
    const { store, beginSearch } = setup(t);
    const worker = beginSearch();
    worker.reply();
    assert.deepEqual(store.moveHistory, ['e4', 'e5']);
    assert.equal(store.botThinking, false);
    assert.equal(store.isPlayerTurn, true);
    const fen = store.positionFen;
    worker.reply();
    assert.equal(store.positionFen, fen);
    t.mock.timers.tick(1000);
    assert.equal(store.clocks.w, 59);
});

test('playing black immediately requests an opening move without an artificial pause', (t) => {
    const { store, beginSearch } = setup(t, { playerColor: 'b' });
    const worker = beginSearch();
    assert.deepEqual(worker.requests[0].moves, []);
    worker.reply({ from: 'e2', to: 'e4' });
    assert.deepEqual(store.moveHistory, ['e4']);
    assert.equal(store.isPlayerTurn, true);
});

test('late results cannot enter a new game even when its position matches', (t) => {
    const { store, workers, move, beginSearch } = setup(t);
    const worker = beginSearch();
    const oldRequest = worker.requests[0];
    store.newGame();
    assert.equal(worker.terminated, false);
    assert.deepEqual(worker.messages.at(-1), { type: 'cancel' });
    store.startGame();
    move('e2', 'e4');
    assert.equal(workers.length, 1, 'new games reuse the warm engine');
    const currentRequest = worker.requests.at(-1);
    assert.equal(oldRequest.fen, store.positionFen);
    assert.notEqual(currentRequest.id, oldRequest.id);
    assert.notEqual(currentRequest.gameId, oldRequest.gameId);
    worker.reply(undefined, oldRequest);
    assert.deepEqual(store.moveHistory, ['e4']);
    assert.equal(store.gamePhase, 'playing');
    assert.equal(store.botThinking, true);
    worker.reply();
    assert.deepEqual(store.moveHistory, ['e4', 'e5']);
});

test('a reply with the wrong position cannot apply to the current request', (t) => {
    const { store, beginSearch } = setup(t);
    const worker = beginSearch();
    worker.reply(undefined, { fen: 'unrelated position' });
    assert.deepEqual(store.moveHistory, ['e4']);
    assert.equal(store.botThinking, true);
    worker.reply();
    assert.deepEqual(store.moveHistory, ['e4', 'e5']);
});

for (const ending of ['resign', 'timeout']) {
    test(`${ending} cancels pending work, reuses the engine and ignores a queued reply`, async (t) => {
        const { store, beginSearch, move } = setup(t, {
            base: ending === 'timeout' ? 1 : 60,
        });
        const worker = beginSearch();
        const request = worker.requests[0];
        move('g1', 'f3');
        if (ending === 'resign') store.resign();
        else t.mock.timers.tick(1000);
        await nextTick();
        assert.equal(store.gamePhase, 'over');
        assert.equal(store.botThinking, false);
        assert.equal(worker.terminated, false);
        assert.deepEqual(worker.messages.at(-1), { type: 'cancel' });
        assert.equal(store.premove, null);
        const fen = store.positionFen;
        worker.reply(undefined, request);
        assert.equal(store.positionFen, fen);
        assert.deepEqual(store.moveHistory, ['e4']);
    });
}

for (const failure of ['error', 'message error', 'illegal move', 'deadline']) {
    test(`worker ${failure} pauses the game without silently playing a fallback`, (t) => {
        const { store, beginSearch } = setup(t);
        const worker = beginSearch();
        if (failure === 'error') worker.onerror({ preventDefault() {} });
        else if (failure === 'message error') {
            worker.reply(undefined, {
                type: 'error',
                error: 'WASM unavailable',
            });
        } else if (failure === 'illegal move') {
            worker.reply({ from: 'e7', to: 'e4' });
        } else {
            t.mock.timers.tick(worker.requests[0].timeBudgetMs + 1001);
        }
        assert.deepEqual(store.moveHistory, ['e4']);
        assert.equal(store.botThinking, false);
        assert.ok(store.engineError);
        assert.equal(worker.terminated, true);
        const clocks = { ...store.clocks };
        t.mock.timers.tick(5000);
        assert.deepEqual(
            store.clocks,
            clocks,
            'load failures must not consume game time',
        );
    });
}

test('retry reloads a failed engine and resumes the same position after readiness', (t) => {
    const { store, workers, beginSearch } = setup(t);
    const worker = beginSearch();
    const oldRequest = worker.requests[0];
    worker.onerror({ preventDefault() {} });
    const frozenClocks = { ...store.clocks };
    store.retryEngine();
    assert.equal(workers.length, 2);
    const replacement = workers[1];
    assert.deepEqual(replacement.messages, [{ type: 'warmup' }]);
    t.mock.timers.tick(1000);
    assert.deepEqual(store.clocks, frozenClocks);
    replacement.ready();
    assert.equal(replacement.requests.length, 1);
    assert.equal(replacement.requests[0].fen, oldRequest.fen);
    assert.notEqual(replacement.requests[0].id, oldRequest.id);
    worker.reply();
    assert.deepEqual(store.moveHistory, ['e4']);
    replacement.searching();
    replacement.reply();
    assert.deepEqual(store.moveHistory, ['e4', 'e5']);
    assert.equal(store.engineError, null);
    t.mock.timers.tick(1000);
    assert.equal(store.clocks.w, frozenClocks.w - 1);
});

test('the search deadline begins when Stockfish starts rather than while its request is queued', (t) => {
    const { store, workers, move } = setup(t, { base: null });
    store.startGame();
    move('e2', 'e4');
    const worker = workers[0];
    t.mock.timers.tick(2000);
    assert.equal(store.engineError, null);
    assert.equal(store.botThinking, true);
    worker.searching();
    t.mock.timers.tick(worker.requests[0].timeBudgetMs + 1001);
    assert.ok(store.engineError);
});

test('search budgets stay bounded at all strengths and shrink when the clock is low', (t) => {
    const { store, workers, move } = setup(t);
    const worker = workers[0];
    for (const elo of [800, 1600, 3200]) {
        store.newGame();
        store.elo = elo;
        store.startGame();
        move('e2', 'e4');
        const request = worker.requests.at(-1);
        assert.equal(request.elo, elo);
        assert.ok(request.timeBudgetMs >= 500 && request.timeBudgetMs <= 1000);
    }
    const usualBudget = worker.requests.at(-1).timeBudgetMs;
    store.newGame();
    store.setTimeControl({ base: 2, increment: 0 });
    store.startGame();
    move('e2', 'e4');
    assert.ok(worker.requests.at(-1).timeBudgetMs < usualBudget);
    assert.ok(worker.requests.at(-1).timeBudgetMs > 0);
});

test('queued premove applies after the reply and immediately requests the next search', (t) => {
    const { store, workers, beginSearch, move } = setup(t);
    const worker = beginSearch();
    move('g1', 'f3');
    assert.deepEqual(store.premove, { from: 'g1', to: 'f3' });
    assert.deepEqual(store.moveHistory, ['e4']);
    worker.reply();
    assert.deepEqual(store.moveHistory, ['e4', 'e5', 'Nf3']);
    assert.equal(store.premove, null);
    assert.equal(store.botThinking, true);
    assert.equal(workers.length, 1);
    assert.equal(worker.requests.length, 2);
    assert.deepEqual(worker.requests[1].moves, ['e2e4', 'e7e5', 'g1f3']);
    assert.notEqual(worker.requests[1].id, worker.requests[0].id);
});

test('a bot check clears tentative premove targets before the next board click', (t) => {
    const { store, workers, select, move } = setup(t);
    store.startGame();
    move('d2', 'd4');
    const worker = workers[0];
    worker.reply({ from: 'c7', to: 'c6' });
    move('g1', 'f3');
    select('g2');
    assert.ok(store.legalTargets.includes('g3'));
    worker.reply({ from: 'd8', to: 'a5' });
    assert.equal(store.status, 'You are in check');
    assert.equal(store.selectedSquare, null);
    assert.deepEqual(store.legalTargets, []);
    assert.doesNotThrow(() => select('g3'));
    assert.deepEqual(store.moveHistory, ['d4', 'c6', 'Nf3', 'Qa5+']);
});

test('disposing the store terminates search and stops the clock', (t) => {
    const { store, pinia, beginSearch } = setup(t);
    const worker = beginSearch();
    const clocks = { ...store.clocks };
    disposePinia(pinia);
    assert.equal(worker.terminated, true);
    t.mock.timers.tick(5000);
    assert.deepEqual(store.clocks, clocks);
    assert.deepEqual(store.moveHistory, ['e4']);
});

test('a stalled engine handshake reports an error before a game can begin', (t) => {
    const { store, workers } = setup(t, { ready: false });
    store.prepareEngine();
    t.mock.timers.tick(15001);
    assert.equal(store.gamePhase, 'lobby');
    assert.ok(store.engineError);
    assert.equal(workers[0].terminated, true);
    assert.deepEqual(store.moveHistory, []);
});

test('a search stuck before starting is also bounded and pauses without a move', (t) => {
    const { store, move } = setup(t, { base: null });
    store.startGame();
    move('e2', 'e4');
    t.mock.timers.tick(2501);
    assert.ok(store.engineError);
    assert.deepEqual(store.moveHistory, ['e4']);
    assert.equal(store.botThinking, false);
});
