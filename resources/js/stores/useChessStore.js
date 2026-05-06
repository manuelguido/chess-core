import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { Chess } from "chess.js";
import { useChessSound } from "../composables/useChessSound.js";

const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const centerSquares = new Set(["d4", "e4", "d5", "e5"]);
const extendedCenterSquares = new Set([
    "c3", "d3", "e3", "f3",
    "c4", "f4", "c5", "f5",
    "c6", "d6", "e6", "f6",
]);

/* ------------------------------------------------------------------ */
/* ELO → engine parameters                                             */
/* ------------------------------------------------------------------ */
const engineParams = (elo) => {
    // depth: how many plies to search
    // noise: centipawn noise added per candidate move score (higher = weaker)
    // blunderRate: probability of picking a random move from the bottom half
    if (elo <= 800)  return { depth: 1, noise: 350, blunderRate: 0.45 };
    if (elo <= 900)  return { depth: 1, noise: 280, blunderRate: 0.35 };
    if (elo <= 1000) return { depth: 2, noise: 220, blunderRate: 0.28 };
    if (elo <= 1100) return { depth: 2, noise: 170, blunderRate: 0.20 };
    if (elo <= 1200) return { depth: 2, noise: 130, blunderRate: 0.14 };
    if (elo <= 1300) return { depth: 3, noise: 100, blunderRate: 0.10 };
    if (elo <= 1400) return { depth: 3, noise:  70, blunderRate: 0.07 };
    if (elo <= 1500) return { depth: 3, noise:  45, blunderRate: 0.04 };
    if (elo <= 1600) return { depth: 4, noise:  28, blunderRate: 0.02 };
    if (elo <= 1800) return { depth: 4, noise:  15, blunderRate: 0.01 };
    if (elo <= 2000) return { depth: 4, noise:   6, blunderRate: 0.00 };
    if (elo <= 2200) return { depth: 5, noise:   3, blunderRate: 0.00 };
    return                 { depth: 5, noise:   0, blunderRate: 0.00 };
};

export const useChessStore = defineStore("chess", () => {
    const { playForMove } = useChessSound();

    /* ================================================================== */
    /* SECTION A — Configuration (editable only in lobby)                 */
    /* ================================================================== */
    const botProfiles = ref([]); // server props, display only

    /** 'lobby' | 'playing' | 'over' */
    const gamePhase = ref("lobby");

    const elo = ref(1200);
    const playerColor = ref("w");

    /**
     * Time control: base in seconds, increment in seconds.
     * null = untimed.
     */
    const timeControl = ref({ base: 180, increment: 0 }); // 3+0

    const configLocked = computed(() => gamePhase.value !== "lobby");

    /* ================================================================== */
    /* SECTION B — Active game state                                       */
    /* ================================================================== */
    const game = shallowRef(new Chess());
    const board = ref(game.value.board());
    const selectedSquare = ref(null);
    const legalTargets = ref([]);
    const botThinking = ref(false);
    const capturedWhite = ref([]);
    const capturedBlack = ref([]);
    const lastMove = ref(null);
    const moveFeedback = ref("Ready");
    const positionFen = ref(game.value.fen());
    const currentMoveNumber = ref(game.value.moveNumber());

    // Full verbose history — needed for history navigation
    const fullHistory = ref([]); // array of { san, from, to, flags, color, fen }
    // Derived SAN list (kept for backward compat with existing UI)
    const moveHistory = computed(() => fullHistory.value.map((e) => e.san));

    /**
     * Written by `registerMove` every time a move is committed.
     * ChessBoard watches this to trigger its pixel-level slide animations.
     */
    const lastPlayedMove = ref(null);

    /* ================================================================== */
    /* SECTION C — Clock state                                             */
    /* ================================================================== */
    const clocks = ref({ w: 0, b: 0 }); // seconds remaining
    let clockInterval = null;

    const _startClock = () => {
        if (!timeControl.value) return;
        if (clockInterval) return;
        clockInterval = setInterval(() => {
            if (gamePhase.value !== "playing") return _stopClock();
            const turn = game.value.turn();
            clocks.value[turn] = Math.max(0, clocks.value[turn] - 1);
            if (clocks.value[turn] === 0) _timeOut(turn);
        }, 1000);
    };

    const _stopClock = () => {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
    };

    const _applyIncrement = (color) => {
        if (!timeControl.value) return;
        clocks.value[color] += timeControl.value.increment;
    };

    const _timeOut = (color) => {
        _stopClock();
        gamePhase.value = "over";
        moveFeedback.value = color === playerColor.value ? "Time — you lost" : "Time — you win!";
    };

    /* ================================================================== */
    /* SECTION D — History navigation                                      */
    /* ================================================================== */

    /**
     * Index of the move the user is currently *viewing*.
     * -1 = start position, fullHistory.length - 1 = live position.
     * null = tracking live (default).
     */
    const viewCursor = ref(null);

    const isReviewing = computed(
        () => viewCursor.value !== null && viewCursor.value < fullHistory.value.length - 1,
    );

    /**
     * Board tiles rendered by ChessBoard — either the live board or
     * the position reconstructed at viewCursor.
     */
    const viewBoard = computed(() => {
        if (viewCursor.value === null || viewCursor.value === fullHistory.value.length - 1) {
            return board.value;
        }
        // Replay up to cursor from initial position
        const tmp = new Chess();
        const moves = fullHistory.value.slice(0, viewCursor.value + 1);
        for (const m of moves) tmp.move(m.san);
        return tmp.board();
    });

    const viewFen = computed(() => {
        if (viewCursor.value === null || fullHistory.value.length === 0) {
            return positionFen.value;
        }
        return fullHistory.value[viewCursor.value]?.fen ?? positionFen.value;
    });

    /** Last move highlighted in the currently viewed position. */
    const viewLastMove = computed(() => {
        if (viewCursor.value === null) return lastMove.value;
        if (viewCursor.value < 0) return null;
        const entry = fullHistory.value[viewCursor.value];
        return entry ? { from: entry.from, to: entry.to } : null;
    });

    const goTo = (index) => {
        const clamped = Math.max(-1, Math.min(fullHistory.value.length - 1, index));
        viewCursor.value = clamped === fullHistory.value.length - 1 ? null : clamped;
    };

    const returnToLive = () => { viewCursor.value = null; };
    const goToStart = () => { goTo(-1); };
    const goBack = () => {
        const cur = viewCursor.value ?? fullHistory.value.length - 1;
        goTo(cur - 1);
    };
    const goForward = () => {
        const cur = viewCursor.value ?? fullHistory.value.length - 1;
        goTo(cur + 1);
    };

    /* ================================================================== */
    /* SECTION E — Computed (game state)                                   */
    /* ================================================================== */
    const activeProfile = computed(() => {
        return (
            [...botProfiles.value].reverse().find((p) => elo.value >= p.elo) ??
            botProfiles.value[0]
        );
    });

    const status = computed(() => {
        positionFen.value;
        if (gamePhase.value === "lobby") return "Not started";
        if (game.value.isCheckmate()) {
            return game.value.turn() === playerColor.value ? "Checkmate — you lost" : "Checkmate — you win!";
        }
        if (game.value.isDraw()) return "Draw";
        if (game.value.isCheck()) {
            return game.value.turn() === playerColor.value ? "You are in check" : "Bot in check";
        }
        if (botThinking.value) return "Bot thinking…";
        return game.value.turn() === playerColor.value ? "Your move" : "Bot to move";
    });

    const gameTurnLabel = computed(() => {
        positionFen.value;
        if (gamePhase.value === "lobby") return "Configure & start";
        if (game.value.isCheckmate()) {
            return game.value.turn() === playerColor.value ? "Bot wins by checkmate" : "You win by checkmate";
        }
        if (game.value.isDraw()) return "Game drawn";
        return game.value.turn() === "w" ? "White to move" : "Black to move";
    });

    const materialBalance = computed(() => {
        const whiteLost = capturedWhite.value.reduce((t, p) => t + pieceValues[p], 0);
        const blackLost = capturedBlack.value.reduce((t, p) => t + pieceValues[p], 0);
        return Math.round(((blackLost - whiteLost) / 100) * 10) / 10;
    });

    const movePairs = computed(() => {
        const history = moveHistory.value;
        const pairs = [];
        for (let i = 0; i < history.length; i += 2) {
            // whiteIdx / blackIdx: the index in fullHistory for cursor comparison
            pairs.push({
                number: i / 2 + 1,
                white: history[i],
                whiteIdx: i,
                black: history[i + 1] ?? "",
                blackIdx: i + 1 < history.length ? i + 1 : null,
            });
        }
        return pairs;
    });

    const flattenedBoard = computed(() => {
        const src = viewBoard.value;
        return src.flatMap((rank, rowIndex) =>
            rank.map((piece, fileIndex) => {
                const square = `${String.fromCharCode(97 + fileIndex)}${8 - rowIndex}`;
                return { square, piece, rowIndex, fileIndex, dark: (rowIndex + fileIndex) % 2 === 1 };
            }),
        );
    });

    const legalTargetSet = computed(() => new Set(legalTargets.value));

    const kingInCheckSquare = computed(() => {
        positionFen.value;
        // Only show check ring on live position
        if (isReviewing.value) return null;
        if (!game.value.isCheck()) return null;
        const turn = game.value.turn();
        for (const tile of flattenedBoard.value) {
            if (tile.piece && tile.piece.type === "k" && tile.piece.color === turn) return tile.square;
        }
        return null;
    });

    const canSwitchColor = computed(() => gamePhase.value === "lobby");

    /* ================================================================== */
    /* SECTION F — Internal helpers                                        */
    /* ================================================================== */
    const syncBoard = () => {
        board.value = game.value.board();
        positionFen.value = game.value.fen();
        currentMoveNumber.value = game.value.moveNumber();
    };

    const classifyMove = (move, side) => {
        if (move.san.includes("#")) return side === "player" ? "Checkmate landed" : "Engine delivers mate";
        if (move.san.includes("+")) return side === "player" ? "Forcing check" : "Bot creates pressure";
        if (move.captured)          return side === "player" ? "Material captured" : "Bot wins material";
        if (centerSquares.has(move.to)) return side === "player" ? "Center control" : "Bot contests center";
        return side === "player" ? "Position improved" : "Bot develops";
    };

    const registerMove = (move, side) => {
        if (move.captured) {
            if (move.color === "w") capturedBlack.value.push(move.captured);
            else capturedWhite.value.push(move.captured);
        }
        lastMove.value = { from: move.from, to: move.to };
        moveFeedback.value = classifyMove(move, side);
        fullHistory.value.push({
            san: move.san,
            from: move.from,
            to: move.to,
            flags: move.flags,
            color: move.color,
            fen: game.value.fen(),
        });
        // Keep view cursor tracking live
        viewCursor.value = null;
        lastPlayedMove.value = { from: move.from, to: move.to, flags: move.flags, color: move.color };
        _applyIncrement(move.color);
        playForMove(move, game.value.isGameOver());
    };

    /* ================================================================== */
    /* SECTION G — Player / bot actions                                    */
    /* ================================================================== */
    let botTimer = null;

    const selectSquare = (tile) => {
        // Ignore clicks while reviewing history, not playing, bot thinking, or game over
        if (
            isReviewing.value ||
            gamePhase.value !== "playing" ||
            botThinking.value ||
            game.value.isGameOver() ||
            game.value.turn() !== playerColor.value
        ) return;

        if (tile.piece?.color === playerColor.value) {
            selectedSquare.value = tile.square;
            legalTargets.value = game.value
                .moves({ square: tile.square, verbose: true })
                .map((m) => m.to);
            return;
        }

        if (!selectedSquare.value) return;
        makePlayerMove(tile.square);
    };

    const makePlayerMove = (target) => {
        const move = game.value.move({ from: selectedSquare.value, to: target, promotion: "q" });
        if (!move) {
            selectedSquare.value = null;
            legalTargets.value = [];
            return;
        }
        registerMove(move, "player");
        selectedSquare.value = null;
        legalTargets.value = [];
        syncBoard();

        if (game.value.isGameOver()) {
            gamePhase.value = "over";
            _stopClock();
            return;
        }
        botThinking.value = true;
        botTimer = window.setTimeout(makeBotMove, botDelay());
    };

    const makeBotMove = () => {
        const move = chooseBotMove();
        if (move) {
            const played = game.value.move(move);
            registerMove(played, "bot");
            syncBoard();
        }
        botThinking.value = false;
        botTimer = null;
        if (game.value.isGameOver()) {
            gamePhase.value = "over";
            _stopClock();
        }
    };

    /* ================================================================== */
    /* SECTION H — Bot AI                                                  */
    /* ================================================================== */

    /**
     * Human-like delay: scales inversely with ELO so weaker bots "think"
     * longer (hesitant) and stronger bots respond faster but not instantly.
     */
    const botDelay = () => {
        const base = 600 - Math.floor(elo.value / 5);      // 440ms @ 1200, 200ms @ 2000
        const jitter = Math.random() * 300;                 // ±0..300ms randomness
        return Math.max(200, Math.min(1200, base + jitter));
    };

    const chooseBotMove = () => {
        const moves = game.value.moves({ verbose: true });
        if (moves.length === 0) return null;

        const { depth, noise, blunderRate } = engineParams(elo.value);

        // Occasional blunder: pick randomly from worst half of moves
        if (blunderRate > 0 && Math.random() < blunderRate) {
            const n = Math.max(1, Math.ceil(moves.length / 2));
            // We still score to get the ordering, then pick from bottom
            const scored = moves.map((move) => {
                game.value.move(move);
                const score = minimax(Math.max(1, depth - 1), -Infinity, Infinity, true);
                game.value.undo();
                return { move, score };
            });
            scored.sort((a, b) => a.score - b.score);
            return scored[Math.floor(Math.random() * n)].move;
        }

        const scored = moves.map((move) => {
            game.value.move(move);
            const score = minimax(depth - 1, -Infinity, Infinity, true);
            game.value.undo();
            // Add symmetric noise to evaluation
            return { move, score: score + (Math.random() * noise * 2 - noise) };
        });

        // Bot plays as the side opposite the player
        // If player = white, bot = black → minimize; if player = black, bot = white → maximize
        const botIsBlack = playerColor.value === "w";
        scored.sort((a, b) => botIsBlack ? a.score - b.score : b.score - a.score);
        return scored[0].move;
    };

    const minimax = (depth, alpha, beta, maxWhite) => {
        if (depth === 0 || game.value.isGameOver()) return evaluatePosition();
        const moves = game.value.moves({ verbose: true });
        if (maxWhite) {
            let best = -Infinity;
            for (const m of moves) {
                game.value.move(m);
                best = Math.max(best, minimax(depth - 1, alpha, beta, false));
                game.value.undo();
                alpha = Math.max(alpha, best);
                if (beta <= alpha) break;
            }
            return best;
        }
        let best = Infinity;
        for (const m of moves) {
            game.value.move(m);
            best = Math.min(best, minimax(depth - 1, alpha, beta, true));
            game.value.undo();
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    };

    const evaluatePosition = () => {
        if (game.value.isCheckmate()) return game.value.turn() === "w" ? -100000 : 100000;
        if (game.value.isDraw()) return 0;
        let score = 0;
        for (const tile of game.value.board().flat()) {
            if (!tile) continue;
            const bonus = centerSquares.has(tile.square) ? 18
                : extendedCenterSquares.has(tile.square) ? 8 : 0;
            score += (pieceValues[tile.type] + bonus) * (tile.color === "w" ? 1 : -1);
        }
        score += game.value.moves({ verbose: true }).length * (game.value.turn() === "w" ? 1.5 : -1.5);
        return score;
    };

    /* ================================================================== */
    /* SECTION I — Game lifecycle                                          */
    /* ================================================================== */

    const _triggerBotFirst = () => {
        botThinking.value = true;
        botTimer = window.setTimeout(() => {
            makeBotMove();
        }, botDelay());
    };

    const _resetBoard = () => {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        _stopClock();
        game.value = new Chess();
        board.value = game.value.board();
        selectedSquare.value = null;
        legalTargets.value = [];
        capturedWhite.value = [];
        capturedBlack.value = [];
        lastMove.value = null;
        moveFeedback.value = "Ready";
        botThinking.value = false;
        lastPlayedMove.value = null;
        fullHistory.value = [];
        viewCursor.value = null;
        syncBoard();
    };

    /** Go back to lobby — config becomes editable again. */
    const newGame = () => {
        _resetBoard();
        gamePhase.value = "lobby";
    };

    /**
     * Start the game from lobby. Locks config, starts clocks,
     * and triggers bot opening move if player chose black.
     */
    const startGame = () => {
        if (gamePhase.value !== "lobby") return;
        // Reset board in case a previous game finished without newGame()
        _resetBoard();
        // Init clocks
        if (timeControl.value) {
            clocks.value = { w: timeControl.value.base, b: timeControl.value.base };
        }
        gamePhase.value = "playing";
        moveFeedback.value = "Game started";
        _startClock();
        if (playerColor.value === "b") _triggerBotFirst();
    };

    /** Resign ends the current game, puts into 'over' state. */
    const resign = () => {
        if (gamePhase.value !== "playing") return;
        _stopClock();
        gamePhase.value = "over";
        moveFeedback.value = "Resigned";
    };

    /** Switch color — only in lobby. */
    const switchColor = () => {
        if (gamePhase.value !== "lobby") return;
        playerColor.value = playerColor.value === "w" ? "b" : "w";
    };

    /* ================================================================== */
    /* SECTION J — Public API                                              */
    /* ================================================================== */
    return {
        // Config
        botProfiles,
        elo,
        playerColor,
        timeControl,
        configLocked,
        // Phase
        gamePhase,
        // Active game
        board,
        selectedSquare,
        legalTargets,
        botThinking,
        capturedWhite,
        capturedBlack,
        lastMove,
        moveFeedback,
        moveHistory,
        fullHistory,
        positionFen,
        currentMoveNumber,
        lastPlayedMove,
        // Clocks
        clocks,
        // History navigation
        viewCursor,
        isReviewing,
        viewLastMove,
        viewFen,
        goTo,
        returnToLive,
        goToStart,
        goBack,
        goForward,
        // Computed
        activeProfile,
        status,
        gameTurnLabel,
        materialBalance,
        movePairs,
        flattenedBoard,
        legalTargetSet,
        kingInCheckSquare,
        canSwitchColor,
        // Actions
        selectSquare,
        botDelay,
        newGame,
        startGame,
        resign,
        switchColor,
    };
});
