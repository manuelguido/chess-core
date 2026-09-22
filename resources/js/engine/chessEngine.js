import { Chess } from 'chess.js';

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);
const EXTENDED_CENTER = new Set([
    'c3',
    'd3',
    'e3',
    'f3',
    'c4',
    'f4',
    'c5',
    'f5',
    'c6',
    'd6',
    'e6',
    'f6',
]);
const MATE_SCORE = 100000;
const SEARCH_LIMIT = Symbol('search limit');
const now = () => globalThis.performance?.now() ?? Date.now();

// Keep the existing personalities while placing an independent cap on work.
const engineParams = (elo) => {
    if (elo <= 800)
        return { depth: 1, temperature: 320, simplicity: 0.9, laziness: 0.6 };
    if (elo <= 900)
        return { depth: 1, temperature: 240, simplicity: 0.8, laziness: 0.5 };
    if (elo <= 1000)
        return { depth: 2, temperature: 180, simplicity: 0.7, laziness: 0.4 };
    if (elo <= 1100)
        return { depth: 2, temperature: 130, simplicity: 0.6, laziness: 0.3 };
    if (elo <= 1200)
        return { depth: 2, temperature: 100, simplicity: 0.45, laziness: 0.2 };
    if (elo <= 1300)
        return { depth: 3, temperature: 75, simplicity: 0.35, laziness: 0.15 };
    if (elo <= 1400)
        return { depth: 3, temperature: 55, simplicity: 0.25, laziness: 0.08 };
    if (elo <= 1500)
        return { depth: 3, temperature: 38, simplicity: 0.15, laziness: 0.04 };
    if (elo <= 1600)
        return { depth: 4, temperature: 22, simplicity: 0.07, laziness: 0.02 };
    if (elo <= 1800)
        return { depth: 4, temperature: 10, simplicity: 0.02, laziness: 0 };
    if (elo <= 2000)
        return { depth: 4, temperature: 4, simplicity: 0, laziness: 0 };
    if (elo <= 2200)
        return { depth: 5, temperature: 2, simplicity: 0, laziness: 0 };
    return { depth: 5, temperature: 0, simplicity: 0, laziness: 0 };
};

const boundedNumber = (value, fallback, maximum) => {
    const number = Number(value ?? fallback);
    return Math.max(
        0,
        Math.min(maximum, Number.isFinite(number) ? number : fallback),
    );
};

const moveCoordinates = (move) => ({
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion } : {}),
});

const restorePosition = ({ initialFen, moves, fen }) => {
    // A FEN alone omits repetition counts. Replay real history when supplied.
    const replay = initialFen !== undefined || (moves?.length ?? 0) > 0;
    const position = new Chess(replay ? initialFen : fen);
    if (replay) {
        for (const uci of moves ?? []) {
            if (
                typeof uci !== 'string' ||
                !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
            ) {
                throw new Error('Invalid move history');
            }
            position.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                ...(uci.length === 5 ? { promotion: uci[4] } : {}),
            });
        }
    }
    if (fen && position.fen() !== fen) {
        throw new Error('Move history does not match the requested position');
    }
    return position;
};

const isRuleDraw = (position) =>
    position.isDrawByFiftyMoves() ||
    position.isInsufficientMaterial() ||
    position.isThreefoldRepetition();

// Positive always means good for the side to move; negamax then works for
// either bot colour. Legal mobility is reused instead of generated twice.
const evaluate = (position, mobility) => {
    let whiteScore = 0;
    for (const rank of position.board()) {
        for (const piece of rank) {
            if (!piece) continue;
            const centerBonus = CENTER.has(piece.square)
                ? 18
                : EXTENDED_CENTER.has(piece.square)
                  ? 8
                  : 0;
            whiteScore +=
                (PIECE_VALUES[piece.type] + centerBonus) *
                (piece.color === 'w' ? 1 : -1);
        }
    }
    return whiteScore * (position.turn() === 'w' ? 1 : -1) + mobility * 1.5;
};

const orderingScore = (san) =>
    (san.includes('#') ? MATE_SCORE : 0) +
    (san.includes('=') ? 800 : 0) +
    (san.includes('x') ? 300 : 0) +
    (san.includes('+') ? 100 : 0);

const selectMove = (scored, temperature) => {
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    if (temperature === 0) return best.move;
    const weights = scored.map(({ score }) =>
        Math.exp((score - best.score) / temperature),
    );
    let remaining =
        Math.random() * weights.reduce((total, weight) => total + weight, 0);
    for (let i = 0; i < scored.length; i++) {
        remaining -= weights[i];
        if (weights[i] > 0 && remaining <= 0) return scored[i].move;
    }
    return best.move;
};

/**
 * Search a private position and return the last fully completed iteration.
 * Budgets include history restoration; a legal root move survives even a zero
 * budget. A single synchronous chess.js operation can slightly exceed the
 * deadline, so browser callers run this function in the module worker.
 */
export const chooseBotMove = ({
    initialFen,
    moves,
    fen,
    elo = 1200,
    timeBudgetMs = 350,
    maxNodes = 25000,
} = {}) => {
    const started = now();
    const deadline = started + boundedNumber(timeBudgetMs, 350, 1000);
    const nodeLimit = Math.floor(boundedNumber(maxNodes, 25000, 100000));
    const position = restorePosition({ initialFen, moves, fen });
    const rootFen = position.fen();
    const legal = position.moves({ verbose: true });
    let nodes = 0;
    let completedDepth = 0;
    const result = (move) => ({
        fen: rootFen,
        move: move ? moveCoordinates(move) : null,
        depth: completedDepth,
        nodes,
        elapsedMs: now() - started,
    });

    if (legal.length === 0 || isRuleDraw(position)) return result(null);

    const params = engineParams(Number(elo));
    const candidates = legal
        .map((move) => ({
            move,
            lazy: params.laziness > 0 && Math.random() < params.laziness,
            bias:
                (move.captured ? params.simplicity * 45 : 0) +
                (/[+#]/.test(move.san) ? params.simplicity * 22 : 0),
            order:
                orderingScore(move.san) +
                (move.captured
                    ? PIECE_VALUES[move.captured] * 10 -
                      PIECE_VALUES[move.piece]
                    : 0),
        }))
        .sort((a, b) => b.order - a.order);
    let chosenMove = candidates[0].move;
    let completedScores = [];

    // Store ordering hints only. Cached scores keyed solely by the board can
    // give wrong draw results for positions reached with different histories.
    const preferredMoves = new Map();
    const checkBudget = () => {
        if (nodes >= nodeLimit || now() >= deadline) throw SEARCH_LIMIT;
    };

    const search = (depth, alpha, beta, ply) => {
        checkBudget();
        nodes++;
        // SAN strings avoid verbose Move objects (and before/after FENs) for
        // every generated candidate. Only public chess.js APIs are used.
        const legalMoves = position.moves();
        if (legalMoves.length === 0) {
            return position.isCheck() ? -MATE_SCORE + ply : 0;
        }
        if (isRuleDraw(position)) return 0;
        // Laziness may reduce a search below zero; all such depths are leaves.
        if (depth <= 0) return evaluate(position, legalMoves.length);

        const key = position.hash();
        const preferred = preferredMoves.get(key);
        legalMoves.sort(
            (a, b) =>
                (b === preferred ? MATE_SCORE * 2 : orderingScore(b)) -
                (a === preferred ? MATE_SCORE * 2 : orderingScore(a)),
        );
        let best = -Infinity;
        let bestMove = legalMoves[0];
        for (const move of legalMoves) {
            checkBudget();
            position.move(move, { strict: true });
            let score;
            try {
                score = -search(depth - 1, -beta, -alpha, ply + 1);
            } finally {
                position.undo();
            }
            if (score > best) {
                best = score;
                bestMove = move;
            }
            alpha = Math.max(alpha, score);
            if (alpha >= beta) break;
        }
        preferredMoves.set(key, bestMove);
        return best;
    };

    for (let depth = 1; depth <= params.depth; depth++) {
        const scored = [];
        try {
            for (const candidate of candidates) {
                checkBudget();
                position.move(candidate.move);
                let score;
                try {
                    score = -search(
                        depth - 1 - (candidate.lazy ? 1 : 0),
                        -Infinity,
                        Infinity,
                        1,
                    );
                } finally {
                    position.undo();
                }
                scored.push({
                    move: candidate.move,
                    score: score + candidate.bias,
                });
            }
        } catch (error) {
            if (error !== SEARCH_LIMIT) throw error;
            break;
        }
        completedScores = scored;
        completedDepth = depth;
        const scores = new Map(
            scored.map(({ move, score }) => [move.san, score]),
        );
        candidates.sort(
            (a, b) => scores.get(b.move.san) - scores.get(a.move.san),
        );
        // A mate in one cannot be improved by a deeper iteration.
        if (scored.some(({ score }) => score >= MATE_SCORE - 1)) break;
    }

    if (completedScores.length)
        chosenMove = selectMove(completedScores, params.temperature);
    return result(chosenMove);
};
