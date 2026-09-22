import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { chooseBotMove } from '../../resources/js/engine/chessEngine.js';

function assertLegalMove(position, result) {
    assert.ok(result.move, 'a playable position must produce a move');
    assert.doesNotThrow(() => position.move(result.move));
    assert.ok(Number.isFinite(result.elapsedMs));
    assert.ok(result.nodes >= 0);
}

test('chooses legal moves for either side without changing the caller position', () => {
    for (const opening of [[], ['e4']]) {
        const position = new Chess();
        opening.forEach((move) => position.move(move));
        const fen = position.fen();
        const result = chooseBotMove({ fen, elo: 1600, timeBudgetMs: 50 });
        assert.equal(position.fen(), fen);
        assertLegalMove(position, result);
    }
});

test('highest strength respects a short search deadline and returns a legal move', () => {
    const position = new Chess();
    for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']) {
        position.move(move);
    }
    const started = performance.now();
    const result = chooseBotMove({
        fen: position.fen(),
        elo: 2400,
        timeBudgetMs: 25,
    });
    const elapsed = performance.now() - started;
    assertLegalMove(position, result);
    // Allow for slow CI scheduling and one uninterruptible chess.js operation.
    assert.ok(elapsed < 500, `25 ms search took ${elapsed.toFixed(1)} ms`);
});

test('node limit bounds search independently of strength and time allowance', () => {
    const position = new Chess();
    const result = chooseBotMove({
        fen: position.fen(),
        elo: 2400,
        timeBudgetMs: 1000,
        maxNodes: 25,
    });
    assertLegalMove(position, result);
    assert.ok(result.nodes <= 25, `visited ${result.nodes} nodes`);
});

test('exhausted search budgets still return a legal fallback', () => {
    for (const limits of [{ timeBudgetMs: 0 }, { maxNodes: 0 }]) {
        const position = new Chess();
        const result = chooseBotMove({
            fen: position.fen(),
            elo: 2400,
            ...limits,
        });
        assertLegalMove(position, result);
        assert.equal(result.depth, 0);
        assert.equal(result.nodes, 0);
    }
});

test('lowest strength cannot recurse below its shallow search horizon', (t) => {
    // This roll previously selected depth zero and called minimax at -1.
    t.mock.method(Math, 'random', () => 0);
    const position = new Chess();
    const result = chooseBotMove({
        fen: position.fen(),
        elo: 800,
        timeBudgetMs: 500,
        maxNodes: 1000,
    });
    assertLegalMove(position, result);
    assert.ok(result.depth <= 1);
    assert.ok(
        result.nodes <= 20,
        `shallow search visited ${result.nodes} nodes`,
    );
});

test('deterministic strength finds an immediate mate for either color', () => {
    for (const fen of [
        '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
        '8/8/8/8/8/6k1/5q2/7K b - - 0 1',
    ]) {
        const position = new Chess(fen);
        const result = chooseBotMove({ fen, elo: 2400, timeBudgetMs: 300 });
        assertLegalMove(position, result);
        assert.equal(position.isCheckmate(), true);
    }
});

test('checkmate, stalemate, and insufficient material return no move', () => {
    for (const fen of [
        '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',
        '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
        '7k/8/6K1/8/8/8/8/8 w - - 0 1',
    ]) {
        assert.equal(new Chess(fen).isGameOver(), true);
        const result = chooseBotMove({ fen, elo: 2400 });
        assert.equal(result.move, null);
        assert.equal(result.nodes, 0);
    }
});

test('replays move history so threefold repetition remains a draw', () => {
    const position = new Chess();
    const initialFen = position.fen();
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
    for (const move of moves) {
        position.move({ from: move.slice(0, 2), to: move.slice(2, 4) });
    }
    assert.equal(position.isThreefoldRepetition(), true);
    assert.equal(new Chess(position.fen()).isThreefoldRepetition(), false);
    const result = chooseBotMove({
        initialFen,
        moves,
        fen: position.fen(),
        elo: 2400,
    });
    assert.equal(result.move, null);
    assert.equal(result.nodes, 0);
});

test('rejects history that does not match the requested position', () => {
    const position = new Chess();
    assert.throws(() =>
        chooseBotMove({
            initialFen: position.fen(),
            moves: ['e2e4'],
            fen: position.fen(),
            elo: 1600,
        }),
    );
});
