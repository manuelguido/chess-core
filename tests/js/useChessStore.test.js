import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, disposePinia } from 'pinia';
import { nextTick } from 'vue';
import { Chess } from 'chess.js';
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

function setup(t, { base = 60, playerColor = 'w' } = {}) {
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

        reply(move = { from: 'e7', to: 'e5' }, overrides = {}) {
            const request = this.messages.at(-1);
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
        t.mock.timers.tick(1200);
        assert.equal(workers.length, 1);
        assert.equal(workers[0].messages.length, 1);
        assert.equal(store.botThinking, true);
        return workers[0];
    }

    return { store, workers, pinia, select, move, beginSearch };
}

test('board controls and clocks keep working while the worker searches', (t) => {
    const { store, beginSearch } = setup(t);
    const worker = beginSearch();
    const request = worker.messages[0];
    assert.equal(request.fen, store.positionFen);
    assert.deepEqual(request.moves, ['e2e4']);
    assert.ok(request.timeBudgetMs > 0 && request.timeBudgetMs <= 750);
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

test('playing black requests an opening move from the worker', (t) => {
    const { store, beginSearch } = setup(t, { playerColor: 'b' });
    const worker = beginSearch();
    assert.deepEqual(worker.messages[0].moves, []);
    worker.reply({ from: 'e2', to: 'e4' });
    assert.deepEqual(store.moveHistory, ['e4']);
    assert.equal(store.isPlayerTurn, true);
});

test('late results cannot enter a new game even when its position matches', (t) => {
    const { store, workers, move, beginSearch } = setup(t);
    const oldWorker = beginSearch();
    const oldRequest = oldWorker.messages[0];
    const deliverOldMessage = oldWorker.onmessage;
    store.newGame();
    assert.equal(oldWorker.terminated, true);
    store.startGame();
    move('e2', 'e4');
    t.mock.timers.tick(1200);
    assert.equal(workers.length, 2);
    assert.equal(oldRequest.fen, store.positionFen);
    deliverOldMessage({
        data: { ...oldRequest, move: { from: 'e7', to: 'e5' } },
    });
    assert.deepEqual(store.moveHistory, ['e4']);
    assert.equal(store.gamePhase, 'playing');
    assert.equal(store.botThinking, true);
    workers[1].reply();
    assert.deepEqual(store.moveHistory, ['e4', 'e5']);
});

for (const ending of ['resign', 'timeout']) {
    test(`${ending} cancels pending work and ignores a queued reply`, async (t) => {
        const { store, beginSearch, move } = setup(t, {
            base: ending === 'timeout' ? 2 : 60,
        });
        const worker = beginSearch();
        const request = worker.messages[0];
        const deliverMessage = worker.onmessage;
        move('g1', 'f3');
        if (ending === 'resign') store.resign();
        else t.mock.timers.tick(1000);
        await nextTick();
        assert.equal(store.gamePhase, 'over');
        assert.equal(store.botThinking, false);
        assert.equal(worker.terminated, true);
        assert.equal(store.premove, null);
        const fen = store.positionFen;
        deliverMessage({
            data: { ...request, move: { from: 'e7', to: 'e5' } },
        });
        assert.equal(store.positionFen, fen);
        assert.deepEqual(store.moveHistory, ['e4']);
    });
}

for (const failure of ['error', 'illegal move', 'deadline']) {
    test(`worker ${failure} recovers with one legal fallback move`, (t) => {
        const { store, beginSearch } = setup(t);
        const worker = beginSearch();
        const before = new Chess(store.positionFen);
        if (failure === 'error') worker.onerror({ preventDefault() {} });
        else if (failure === 'illegal move') {
            worker.reply({ from: 'e7', to: 'e4' });
        } else t.mock.timers.tick(3000);
        assert.equal(store.moveHistory.length, 2);
        assert.doesNotThrow(() => before.move(store.lastMove));
        assert.equal(store.positionFen, before.fen());
        assert.equal(store.botThinking, false);
        assert.equal(store.isPlayerTurn, true);
        if (failure !== 'illegal move') assert.equal(worker.terminated, true);
    });
}

test('queued premove applies after the reply and the next request includes both moves', (t) => {
    const { store, workers, beginSearch, move } = setup(t);
    const worker = beginSearch();
    move('g1', 'f3');
    assert.deepEqual(store.premove, { from: 'g1', to: 'f3' });
    assert.deepEqual(store.moveHistory, ['e4']);
    worker.reply();
    assert.deepEqual(store.moveHistory, ['e4', 'e5', 'Nf3']);
    assert.equal(store.premove, null);
    assert.equal(store.botThinking, true);
    t.mock.timers.tick(1200);
    assert.equal(workers.length, 1);
    assert.equal(worker.messages.length, 2);
    assert.deepEqual(worker.messages[1].moves, ['e2e4', 'e7e5', 'g1f3']);
    assert.notEqual(worker.messages[1].id, worker.messages[0].id);
});

test('a bot check clears tentative premove targets before the next board click', (t) => {
    const { store, workers, select, move } = setup(t);
    store.startGame();
    move('d2', 'd4');
    t.mock.timers.tick(1200);
    const worker = workers[0];
    worker.reply({ from: 'c7', to: 'c6' });
    move('g1', 'f3');
    t.mock.timers.tick(1200);
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
