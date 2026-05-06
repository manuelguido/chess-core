import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { Chess } from "chess.js";
import { useChessSound } from "../composables/useChessSound.js";

const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const centerSquares = new Set(["d4", "e4", "d5", "e5"]);
const extendedCenterSquares = new Set([
    "c3",
    "d3",
    "e3",
    "f3",
    "c4",
    "f4",
    "c5",
    "f5",
    "c6",
    "d6",
    "e6",
    "f6",
]);

/* ------------------------------------------------------------------ */
/* ELO → engine parameters                                             */
/* ------------------------------------------------------------------ */
const engineParams = (elo) => {
    // depth     — plies to search
    // temperature — Boltzmann selection temperature in centipawns.
    //               High = roughly uniform pick (weak), low = near-deterministic (strong).
    //               Replaces the old noise+blunderRate combo with a single, smooth knob.
    // simplicity — 0-1 bonus weight applied to human-instinct moves (captures, checks).
    //               Simulates pattern recognition over deep calculation at low ELO.
    // laziness   — 0-1 probability of searching at depth-1 instead of full depth per candidate.
    //               Simulates inconsistent calculation: bot occasionally misses 2-move tactics.
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
        return { depth: 4, temperature: 10, simplicity: 0.02, laziness: 0.0 };
    if (elo <= 2000)
        return { depth: 4, temperature: 4, simplicity: 0.0, laziness: 0.0 };
    if (elo <= 2200)
        return { depth: 5, temperature: 2, simplicity: 0.0, laziness: 0.0 };
    return { depth: 5, temperature: 0, simplicity: 0.0, laziness: 0.0 };
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
        moveFeedback.value =
            color === playerColor.value ? "Time — you lost" : "Time — you win!";
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
        () =>
            viewCursor.value !== null &&
            viewCursor.value < fullHistory.value.length - 1,
    );

    /**
     * Board tiles rendered by ChessBoard — either the live board or
     * the position reconstructed at viewCursor.
     */
    const viewBoard = computed(() => {
        if (
            viewCursor.value === null ||
            viewCursor.value === fullHistory.value.length - 1
        ) {
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
        const clamped = Math.max(
            -1,
            Math.min(fullHistory.value.length - 1, index),
        );
        viewCursor.value =
            clamped === fullHistory.value.length - 1 ? null : clamped;
    };

    const returnToLive = () => {
        viewCursor.value = null;
    };
    const goToStart = () => {
        goTo(-1);
    };
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
            return game.value.turn() === playerColor.value
                ? "Checkmate — you lost"
                : "Checkmate — you win!";
        }
        if (game.value.isDraw()) return "Draw";
        if (game.value.isCheck()) {
            return game.value.turn() === playerColor.value
                ? "You are in check"
                : "Bot in check";
        }
        if (botThinking.value) return "Bot thinking…";
        return game.value.turn() === playerColor.value
            ? "Your move"
            : "Bot to move";
    });

    const gameTurnLabel = computed(() => {
        positionFen.value;
        if (gamePhase.value === "lobby") return "Configure & start";
        if (game.value.isCheckmate()) {
            return game.value.turn() === playerColor.value
                ? "Bot wins by checkmate"
                : "You win by checkmate";
        }
        if (game.value.isDraw()) return "Game drawn";
        return game.value.turn() === "w" ? "White to move" : "Black to move";
    });

    const materialBalance = computed(() => {
        const whiteLost = capturedWhite.value.reduce(
            (t, p) => t + pieceValues[p],
            0,
        );
        const blackLost = capturedBlack.value.reduce(
            (t, p) => t + pieceValues[p],
            0,
        );
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
                return {
                    square,
                    piece,
                    rowIndex,
                    fileIndex,
                    dark: (rowIndex + fileIndex) % 2 === 1,
                };
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
            if (
                tile.piece &&
                tile.piece.type === "k" &&
                tile.piece.color === turn
            )
                return tile.square;
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
        if (move.san.includes("#"))
            return side === "player"
                ? "Checkmate landed"
                : "Engine delivers mate";
        if (move.san.includes("+"))
            return side === "player" ? "Forcing check" : "Bot creates pressure";
        if (move.captured)
            return side === "player"
                ? "Material captured"
                : "Bot wins material";
        if (centerSquares.has(move.to))
            return side === "player" ? "Center control" : "Bot contests center";
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
        lastPlayedMove.value = {
            from: move.from,
            to: move.to,
            flags: move.flags,
            color: move.color,
        };
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
        )
            return;

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
        const move = game.value.move({
            from: selectedSquare.value,
            to: target,
            promotion: "q",
        });
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
     * Human-like delay with four contributing factors:
     *  1. Base think time  — weaker bots are more hesitant / slower
     *  2. Complexity bonus — more legal moves in position → longer think (choice paralysis)
     *  3. Recapture speed  — if the player just captured, bot often replies fast (~65% of time)
     *  4. Long-think spike — ~8% chance of a longer pause (re-evaluating the position)
     *  5. Clock pressure   — timed game with < 30 s left → bot hurries
     */
    const botDelay = () => {
        const moveCount = game.value.moves().length;

        // Base: weaker bots think longer (more confused), stronger bots are quicker
        const base = Math.max(250, 850 - Math.floor(elo.value / 4));

        // Position complexity: paralysis of choice
        const complexityBonus = Math.min(350, moveCount * 7);

        // Recapture instinct: respond quickly after the player takes a piece
        const justCaptured =
            lastPlayedMove.value?.flags?.includes("c") ||
            lastPlayedMove.value?.flags?.includes("e");
        const recaptureRatio =
            justCaptured && Math.random() < 0.65 ? 0.35 : 1.0;

        // Rare long think: re-evaluating a critical position
        const spike = Math.random() < 0.08 ? 1400 + Math.random() * 2200 : 0;

        // Natural variance
        const variance = Math.random() * 450;

        // Clock pressure: hurry when low on time
        const botColor = playerColor.value === "w" ? "b" : "w";
        const clockRatio =
            timeControl.value && clocks.value[botColor] < 30 ? 0.4 : 1.0;

        const total =
            (base + complexityBonus + variance + spike) *
            recaptureRatio *
            clockRatio;
        return Math.max(180, Math.min(5500, total));
    };

    const chooseBotMove = () => {
        const moves = game.value.moves({ verbose: true });
        if (moves.length === 0) return null;

        const { depth, temperature, simplicity, laziness } = engineParams(
            elo.value,
        );
        // bot = side opposite the player
        const botIsBlack = playerColor.value === "w";

        // Score each candidate move
        const scored = moves.map((move) => {
            // Laziness: occasionally search one ply shallower → misses some 2-move tactics
            const searchDepth =
                laziness > 0 && Math.random() < laziness
                    ? Math.max(0, depth - 1)
                    : depth;

            game.value.move(move);
            const rawScore = minimax(
                searchDepth - 1,
                -Infinity,
                Infinity,
                !botIsBlack,
            );
            game.value.undo();

            // Simplicity bias: bonus for human-instinct moves so mid-ELO bots
            // prefer captures and checks the way real players do.
            // Sign is from bot's perspective (positive = good for bot).
            const sign = botIsBlack ? -1 : 1;
            const captureBonus = move.captured ? simplicity * 45 * sign : 0;
            const checkBonus =
                move.san.includes("+") || move.san.includes("#")
                    ? simplicity * 22 * sign
                    : 0;

            return { move, score: rawScore + captureBonus + checkBonus };
        });

        // --- Boltzmann (softmax) selection ---
        // temperature = 0  → deterministic best move (engine-like)
        // temperature > 0  → probabilistic; higher T = more varied, human-like selection
        if (temperature === 0) {
            return scored.reduce((best, s) =>
                (botIsBlack ? s.score < best.score : s.score > best.score)
                    ? s
                    : best,
            ).move;
        }

        // Convert raw eval to "bot advantage" (higher = better for bot)
        const botAdvantage = scored.map((s) =>
            botIsBlack ? -s.score : s.score,
        );
        // Shift by max to keep exp() numerically stable
        const maxAdv = Math.max(...botAdvantage);
        const weights = botAdvantage.map((adv) =>
            Math.exp((adv - maxAdv) / temperature),
        );

        const total = weights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * total;
        for (let i = 0; i < scored.length; i++) {
            rand -= weights[i];
            if (rand <= 0) return scored[i].move;
        }
        return scored[scored.length - 1].move; // numerical fallback
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
        if (game.value.isCheckmate())
            return game.value.turn() === "w" ? -100000 : 100000;
        if (game.value.isDraw()) return 0;
        let score = 0;
        for (const tile of game.value.board().flat()) {
            if (!tile) continue;
            const bonus = centerSquares.has(tile.square)
                ? 18
                : extendedCenterSquares.has(tile.square)
                  ? 8
                  : 0;
            score +=
                (pieceValues[tile.type] + bonus) *
                (tile.color === "w" ? 1 : -1);
        }
        score +=
            game.value.moves({ verbose: true }).length *
            (game.value.turn() === "w" ? 1.5 : -1.5);
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
        if (botTimer) {
            clearTimeout(botTimer);
            botTimer = null;
        }
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
            clocks.value = {
                w: timeControl.value.base,
                b: timeControl.value.base,
            };
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
