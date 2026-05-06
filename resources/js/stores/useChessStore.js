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

export const useChessStore = defineStore("chess", () => {
    const { playForMove } = useChessSound();

    /* ------------------------------------------------------------------ */
    /* Bot profiles (hydrated by the page component from server props)     */
    /* ------------------------------------------------------------------ */
    const botProfiles = ref([]);

    /* ------------------------------------------------------------------ */
    /* Core game state                                                      */
    /* ------------------------------------------------------------------ */
    const game = shallowRef(new Chess());
    const board = ref(game.value.board());
    const selectedSquare = ref(null);
    const legalTargets = ref([]);
    const botThinking = ref(false);
    const elo = ref(1600);
    const playerColor = ref("w");
    const capturedWhite = ref([]);
    const capturedBlack = ref([]);
    const lastMove = ref(null);
    const moveFeedback = ref("Book-ready");
    const moveHistory = ref(game.value.history());
    const positionFen = ref(game.value.fen());
    const currentMoveNumber = ref(game.value.moveNumber());

    /**
     * Written by `registerMove` every time a move is committed.
     * ChessBoard watches this to trigger its pixel-level slide animations
     * without the store needing to know about DOM metrics.
     *
     * Shape: { from, to, flags, color } | null
     */
    const lastPlayedMove = ref(null);

    /** Holds the pending setTimeout ID for the bot's next move. */
    let botTimer = null;

    /* ------------------------------------------------------------------ */
    /* Computed                                                             */
    /* ------------------------------------------------------------------ */
    const activeProfile = computed(() => {
        return (
            [...botProfiles.value].reverse().find((p) => elo.value >= p.elo) ??
            botProfiles.value[0]
        );
    });

    const status = computed(() => {
        positionFen.value; // reactive dependency
        if (game.value.isCheckmate()) {
            return game.value.turn() === playerColor.value
                ? "Checkmate"
                : "Bot checkmated";
        }
        if (game.value.isDraw()) return "Draw";
        if (game.value.isCheck()) {
            return game.value.turn() === playerColor.value
                ? "You are in check"
                : "Bot in check";
        }
        if (botThinking.value)
            return `${activeProfile.value?.name} thinking`;
        return game.value.turn() === playerColor.value
            ? "Your move"
            : "Bot to move";
    });

    const gameTurnLabel = computed(() => {
        positionFen.value; // reactive dependency
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
            pairs.push({
                number: i / 2 + 1,
                white: history[i],
                black: history[i + 1] ?? "",
            });
        }
        return pairs.slice(-8).reverse();
    });

    const flattenedBoard = computed(() => {
        return board.value.flatMap((rank, rowIndex) =>
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
        positionFen.value; // reactive dependency
        if (!game.value.isCheck()) return null;
        const turn = game.value.turn();
        for (const tile of flattenedBoard.value) {
            if (
                tile.piece &&
                tile.piece.type === "k" &&
                tile.piece.color === turn
            ) {
                return tile.square;
            }
        }
        return null;
    });

    /**
     * True when no moves have been played yet — the player is free to
     * flip sides. Becomes false the moment any piece moves.
     */
    const canSwitchColor = computed(() => moveHistory.value.length === 0);

    /* ------------------------------------------------------------------ */
    /* Internal helpers                                                     */
    /* ------------------------------------------------------------------ */
    const syncBoard = () => {
        board.value = game.value.board();
        moveHistory.value = game.value.history();
        positionFen.value = game.value.fen();
        currentMoveNumber.value = game.value.moveNumber();
    };

    const classifyMove = (move, side) => {
        if (move.san.includes("#"))
            return side === "player" ? "Checkmate landed" : "Engine mate threat";
        if (move.san.includes("+"))
            return side === "player" ? "Forcing check" : "Bot creates pressure";
        if (move.captured)
            return side === "player" ? "Material captured" : "Bot wins material";
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
        // Signal ChessBoard to animate — it owns the pixel maths
        lastPlayedMove.value = {
            from: move.from,
            to: move.to,
            flags: move.flags,
            color: move.color,
        };
        playForMove(move, game.value.isGameOver());
    };

    /* ------------------------------------------------------------------ */
    /* Player / bot actions                                                 */
    /* ------------------------------------------------------------------ */
    const selectSquare = (tile) => {
        if (
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

        if (!game.value.isGameOver()) {
            botThinking.value = true;
            botTimer = window.setTimeout(makeBotMove, botDelay());
        }
    };

    const makeBotMove = () => {
        const move = chooseBotMove();
        if (move) {
            const played = game.value.move(move);
            registerMove(played, "bot");
            syncBoard();
        }
        botThinking.value = false;
    };

    /* ------------------------------------------------------------------ */
    /* Bot AI                                                               */
    /* ------------------------------------------------------------------ */
    const botDelay = () => Math.max(220, 820 - Math.floor(elo.value / 5));

    const chooseBotMove = () => {
        const moves = game.value.moves({ verbose: true });
        if (moves.length === 0) return null;

        const profile = activeProfile.value;
        const depth = profile.depth;
        const noise = Math.max(0, (3000 - elo.value) / 3000) * 180;

        const scored = moves.map((move) => {
            game.value.move(move);
            const score = minimax(depth - 1, -Infinity, Infinity, true);
            game.value.undo();
            return { move, score: score + (Math.random() * noise - noise / 2) };
        });

        scored.sort((a, b) => a.score - b.score);

        if (elo.value < 1000)
            return scored[Math.floor(Math.random() * Math.min(scored.length, 6))].move;
        if (elo.value < 1500 && Math.random() < 0.28) {
            return scored[Math.floor(Math.random() * Math.min(scored.length, 4))].move;
        }
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
            const ps = pieceValues[tile.type] + bonus;
            score += tile.color === "w" ? ps : -ps;
        }
        score +=
            game.value.moves({ verbose: true }).length *
            (game.value.turn() === "w" ? 1.5 : -1.5);
        return score;
    };

    /* ------------------------------------------------------------------ */
    /* Game lifecycle                                                       */
    /* ------------------------------------------------------------------ */
    const _triggerBotFirst = () => {
        botThinking.value = true;
        botTimer = window.setTimeout(() => {
            makeBotMove();
            botTimer = null;
        }, botDelay());
    };

    const newGame = () => {
        if (botTimer) {
            clearTimeout(botTimer);
            botTimer = null;
        }
        game.value = new Chess();
        selectedSquare.value = null;
        legalTargets.value = [];
        capturedWhite.value = [];
        capturedBlack.value = [];
        lastMove.value = null;
        moveFeedback.value = "Book-ready";
        botThinking.value = false;
        lastPlayedMove.value = null;
        syncBoard();
        if (playerColor.value === "b") _triggerBotFirst();
    };

    const resign = () => {
        moveFeedback.value = "Training line reset";
        newGame();
    };

    /**
     * Toggle the side the human plays. Only works while no moves have been
     * made (canSwitchColor). Cancels any pending bot-opening move so the
     * player can flip back to white after choosing black.
     */
    const switchColor = () => {
        if (!canSwitchColor.value) return;
        // Cancel any bot-opening move queued by a previous black selection.
        if (botTimer) {
            clearTimeout(botTimer);
            botTimer = null;
            botThinking.value = false;
        }
        playerColor.value = playerColor.value === "w" ? "b" : "w";
        if (playerColor.value === "b") _triggerBotFirst();
    };

    /* ------------------------------------------------------------------ */
    /* Public API                                                           */
    /* ------------------------------------------------------------------ */
    return {
        // State
        botProfiles,
        board,
        selectedSquare,
        legalTargets,
        botThinking,
        elo,
        playerColor,
        capturedWhite,
        capturedBlack,
        lastMove,
        moveFeedback,
        moveHistory,
        positionFen,
        currentMoveNumber,
        lastPlayedMove,
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
        resign,
        switchColor,
    };
});
