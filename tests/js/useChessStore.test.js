import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, disposePinia } from 'pinia';
import { nextTick } from 'vue';
import { useChessStore } from '../../resources/js/stores/useChessStore.js';

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
