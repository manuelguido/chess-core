<script setup>
/**
 * Chess Core — main game page.
 *
 * UI/UX layer only — game logic (chess.js + minimax) is unchanged.
 *
 * Layout:
 *   ┌──────────────── header (brand, status pill) ────────────────┐
 *   │ ┌───────────┐  ┌────────────────────┐  ┌───────────────────┐│
 *   │ │ Bot       │  │  status row        │  │ Current game card ││
 *   │ │ strength  │  │  ┌──────────────┐  │  │ Move history      ││
 *   │ │           │  │  │   board      │  │  │ Position FEN      ││
 *   │ │ Captured  │  │  │              │  │  │                   ││
 *   │ │           │  │  └──────────────┘  │  │                   ││
 *   │ │           │  │  controls          │  │                   ││
 *   │ └───────────┘  └────────────────────┘  └───────────────────┘│
 *   └──────────────────────────────────────────────────────────────┘
 */
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
} from "vue";
import { Head } from "@inertiajs/vue3";
import {
    BrainCircuit,
    Crown,
    Flag,
    Gauge,
    History,
    RotateCcw,
    Shield,
    Sparkles,
    Swords,
    TimerReset,
} from "lucide-vue-next";
import { Chess } from "chess.js";
import ChessPiece from "../../components/ChessPiece.vue";
import { useChessSound } from "../../composables/useChessSound.js";

const props = defineProps({
    botProfiles: Array,
});

const { playForMove } = useChessSound();

/* ============================================================
   Game state — unchanged logic
   ============================================================ */
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

/* ============================================================
   Move animation state
   ------------------------------------------------------------
   `animations` maps a destination square → { dx, dy, id } where
   dx/dy are the pixel offsets the piece should appear to start at
   (i.e. its previous square, expressed relative to its new one).
   The destination piece renders with class `.piece--moving` and
   inline `--mv-x` / `--mv-y` vars; a CSS keyframe slides it home.

   `id` is bumped on every animation so Vue's :key forces the
   piece element to remount and the keyframe re-fires — critical
   when the same square animates twice in a row (e.g. recapture).

   Castling pushes a *secondary* entry for the rook so both pieces
   slide simultaneously.
   ============================================================ */
const boardEl = ref(null);
const squarePx = ref(80);
const animations = ref(new Map());
let animSeq = 0;
let animTimer = null;
let boardRO = null;

const ANIM_DURATION = 170;

const measureBoard = () => {
    if (boardEl.value) {
        squarePx.value = boardEl.value.clientWidth / 8;
    }
};

onMounted(() => {
    measureBoard();
    if (typeof ResizeObserver !== "undefined" && boardEl.value) {
        boardRO = new ResizeObserver(measureBoard);
        boardRO.observe(boardEl.value);
    }
});

onBeforeUnmount(() => {
    if (boardRO) boardRO.disconnect();
    if (animTimer) clearTimeout(animTimer);
});

const fileIdx = (sq) => sq.charCodeAt(0) - 97; // a..h → 0..7
const rankRow = (sq) => 8 - parseInt(sq[1], 10); // 1..8 → 7..0 (top-down)

/** Offset (in px) representing where `from` sits relative to `to`. */
const offsetFor = (from, to) => {
    const dx = (fileIdx(from) - fileIdx(to)) * squarePx.value;
    const dy = (rankRow(from) - rankRow(to)) * squarePx.value;
    return { dx, dy };
};

/**
 * Schedule slide animations for a chess.js move.
 * Handles the rook leg of castling automatically.
 */
const scheduleAnimation = (move) => {
    const next = new Map();
    const { dx, dy } = offsetFor(move.from, move.to);
    next.set(move.to, { dx, dy, id: ++animSeq });

    // Castling: chess.js sets flags 'k' (kingside) or 'q' (queenside).
    if (move.flags && (move.flags.includes("k") || move.flags.includes("q"))) {
        const rank = move.color === "w" ? "1" : "8";
        const isKingside = move.flags.includes("k");
        const rookFrom = (isKingside ? "h" : "a") + rank;
        const rookTo = (isKingside ? "f" : "d") + rank;
        const r = offsetFor(rookFrom, rookTo);
        next.set(rookTo, { dx: r.dx, dy: r.dy, id: ++animSeq });
    }

    animations.value = next;

    if (animTimer) clearTimeout(animTimer);
    animTimer = setTimeout(() => {
        animations.value = new Map();
        animTimer = null;
    }, ANIM_DURATION + 30);
};

/* ============================================================
   Computed
   ============================================================ */
const activeProfile = computed(() => {
    return (
        [...props.botProfiles].reverse().find((p) => elo.value >= p.elo) ??
        props.botProfiles[0]
    );
});

const status = computed(() => {
    positionFen.value;
    if (game.value.isCheckmate()) {
        return game.value.turn() === playerColor.value
            ? "Checkmate"
            : "Bot checkmated";
    }
    if (game.value.isDraw()) return "Draw";
    if (game.value.isCheck())
        return game.value.turn() === playerColor.value
            ? "You are in check"
            : "Bot in check";
    if (botThinking.value) return `${activeProfile.value.name} thinking`;
    return game.value.turn() === playerColor.value
        ? "Your move"
        : "Bot to move";
});

const gameTurnLabel = computed(() => {
    positionFen.value;
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

/**
 * Square holding the king of the side to move while in check —
 * used to render the red halo. Null when no check.
 */
const kingInCheckSquare = computed(() => {
    positionFen.value;
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

/* ============================================================
   Helpers
   ============================================================ */
const syncBoard = () => {
    board.value = game.value.board();
    moveHistory.value = game.value.history();
    positionFen.value = game.value.fen();
    currentMoveNumber.value = game.value.moveNumber();
};

const tileClasses = (tile) => {
    const isSelected = selectedSquare.value === tile.square;
    const isTarget = legalTargetSet.value.has(tile.square);
    const isLast =
        lastMove.value &&
        (lastMove.value.from === tile.square ||
            lastMove.value.to === tile.square);

    return [
        "square",
        tile.dark ? "square--dark" : "square--light",
        isSelected && "square--selected",
        isTarget && "square--target",
        isTarget && tile.piece && "square--has-piece",
        isLast && "square--last",
        kingInCheckSquare.value === tile.square && "square--check",
    ];
};

/* ============================================================
   User actions
   ============================================================ */
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
        window.setTimeout(makeBotMove, botDelay());
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

const registerMove = (move, side) => {
    if (move.captured) {
        if (move.color === "w") capturedBlack.value.push(move.captured);
        else capturedWhite.value.push(move.captured);
    }
    lastMove.value = { from: move.from, to: move.to };
    moveFeedback.value = classifyMove(move, side);
    scheduleAnimation(move);
    playForMove(move, game.value.isGameOver());
};

/* ============================================================
   Bot AI — unchanged
   ============================================================ */
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
        return scored[Math.floor(Math.random() * Math.min(scored.length, 6))]
            .move;
    if (elo.value < 1500 && Math.random() < 0.28) {
        return scored[Math.floor(Math.random() * Math.min(scored.length, 4))]
            .move;
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

const botDelay = () => Math.max(220, 820 - Math.floor(elo.value / 5));

const newGame = async () => {
    game.value = new Chess();
    selectedSquare.value = null;
    legalTargets.value = [];
    capturedWhite.value = [];
    capturedBlack.value = [];
    lastMove.value = null;
    moveFeedback.value = "Book-ready";
    botThinking.value = false;
    animations.value = new Map();
    if (animTimer) {
        clearTimeout(animTimer);
        animTimer = null;
    }
    syncBoard();
    await nextTick();
};

const resign = () => {
    moveFeedback.value = "Training line reset";
    newGame();
};
</script>

<template>
    <Head title="Chess Core" />

    <main class="min-h-screen bg-bg-base text-ink">
        <div
            class="mx-auto flex min-h-screen max-w-350 flex-col px-6 py-6 lg:px-10 lg:py-8"
        >
            <!-- =====================================================
                 Header — quiet, identity-led
                 ===================================================== -->
            <header
                class="flex flex-wrap items-center justify-between gap-4 pb-6"
            >
                <div class="flex items-center gap-3">
                    <span
                        class="flex h-9 w-9 items-center justify-center rounded-md border border-line-soft bg-bg-surface"
                    >
                        <Crown
                            class="h-4 w-4 text-accent"
                            :stroke-width="1.75"
                        />
                    </span>
                    <div class="flex flex-col leading-tight">
                        <h1>Chess Core</h1>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <span class="pill">
                        <BrainCircuit
                            class="h-3.5 w-3.5"
                            :stroke-width="1.75"
                        />
                        {{ activeProfile.name }}
                    </span>
                    <span class="pill pill--accent num">{{ elo }} ELO</span>
                </div>
            </header>

            <!-- =====================================================
                 Main 3-column grid — board takes more visual weight,
                 side panels trimmed for prominence.
                 ===================================================== -->
            <div
                class="grid flex-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)_280px]"
            >
                <!-- =================================================
                     LEFT — Bot config + Captured
                     ================================================= -->
                <aside class="order-2 flex flex-col gap-4 xl:order-1">
                    <section class="panel p-5 fade-in">
                        <div class="mb-4 flex items-center justify-between">
                            <h2>Bot strength</h2>
                            <Gauge
                                class="h-4 w-4 text-ink-faint"
                                :stroke-width="1.5"
                            />
                        </div>

                        <div class="mb-4 flex items-end justify-between">
                            <span
                                class="num text-3xl font-semibold text-ink tracking-tight"
                                >{{ elo }}</span
                            >
                            <span class="label">ELO</span>
                        </div>

                        <input
                            v-model="elo"
                            type="range"
                            min="800"
                            max="3000"
                            step="100"
                            class="slider"
                            aria-label="Bot ELO"
                        />

                        <div
                            class="mt-3 flex justify-between num text-[10px] text-ink-faint"
                        >
                            <span>800</span>
                            <span>3000</span>
                        </div>

                        <div class="mt-5 grid gap-2">
                            <button
                                v-for="profile in botProfiles"
                                :key="profile.elo"
                                type="button"
                                class="row-btn"
                                :data-active="activeProfile.elo === profile.elo"
                                @click="elo = profile.elo"
                            >
                                <span>{{ profile.name }}</span>
                                <span class="num text-[11px] text-ink-faint">{{
                                    profile.elo
                                }}</span>
                            </button>
                        </div>

                        <div
                            class="mt-5 panel-divider grid grid-cols-2 gap-4 pt-4"
                        >
                            <div>
                                <p class="label">Style</p>
                                <p class="mt-1 text-sm font-medium text-ink">
                                    {{ activeProfile.style }}
                                </p>
                            </div>
                            <div>
                                <p class="label">Depth</p>
                                <p
                                    class="mt-1 text-sm font-medium text-ink num"
                                >
                                    {{ activeProfile.depth }}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section class="panel p-5 fade-in">
                        <div class="mb-4 flex items-center justify-between">
                            <h2>Captured</h2>
                            <Swords
                                class="h-4 w-4 text-ink-faint"
                                :stroke-width="1.5"
                            />
                        </div>

                        <div class="space-y-3">
                            <div class="panel-inner p-3">
                                <p class="label">White lost</p>
                                <div
                                    class="mt-2 flex min-h-9 flex-wrap items-center gap-1"
                                >
                                    <span
                                        v-for="(piece, index) in capturedWhite"
                                        :key="`w-${piece}-${index}`"
                                        class="block h-7 w-7"
                                    >
                                        <ChessPiece color="w" :type="piece" />
                                    </span>
                                </div>
                            </div>
                            <div class="panel-inner p-3">
                                <p class="label">Black lost</p>
                                <div
                                    class="mt-2 flex min-h-9 flex-wrap items-center gap-1"
                                >
                                    <span
                                        v-for="(piece, index) in capturedBlack"
                                        :key="`b-${piece}-${index}`"
                                        class="block h-7 w-7"
                                    >
                                        <ChessPiece color="b" :type="piece" />
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>
                </aside>

                <!-- =================================================
                     CENTER — board
                     ================================================= -->
                <section class="order-1 flex flex-col items-center xl:order-2">
                    <!-- Status strip — single inline row, restrained -->
                    <div
                        class="mb-4 grid w-full max-w-180 grid-cols-4 gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft"
                    >
                        <div class="bg-bg-surface px-4 py-3">
                            <p class="label">Status</p>
                            <p
                                class="mt-1.5 truncate text-sm font-medium text-ink"
                            >
                                {{ status }}
                            </p>
                        </div>
                        <div class="bg-bg-surface px-4 py-3">
                            <p class="label">Material</p>
                            <p
                                class="mt-1.5 num text-sm font-medium"
                                :class="
                                    materialBalance > 0
                                        ? 'text-positive'
                                        : materialBalance < 0
                                          ? 'text-negative'
                                          : 'text-ink'
                                "
                            >
                                {{ materialBalance > 0 ? "+" : ""
                                }}{{ materialBalance }}
                            </p>
                        </div>
                        <div class="bg-bg-surface px-4 py-3">
                            <p class="label">Move</p>
                            <p class="mt-1.5 num text-sm font-medium text-ink">
                                {{ currentMoveNumber }}
                            </p>
                        </div>
                        <div class="bg-bg-surface px-4 py-3">
                            <p class="label">Analysis</p>
                            <p
                                class="mt-1.5 truncate text-sm font-medium text-accent"
                            >
                                {{ moveFeedback }}
                            </p>
                        </div>
                    </div>

                    <!-- Board frame -->
                    <div class="board-frame w-full max-w-180">
                        <div
                            ref="boardEl"
                            class="board"
                            role="grid"
                            aria-label="Chess board"
                        >
                            <button
                                v-for="tile in flattenedBoard"
                                :key="tile.square"
                                type="button"
                                role="gridcell"
                                :aria-label="`${tile.square} ${tile.piece ? (tile.piece.color === 'w' ? 'white' : 'black') + ' ' + tile.piece.type : 'empty'}`"
                                :class="tileClasses(tile)"
                                @click="selectSquare(tile)"
                            >
                                <ChessPiece
                                    v-if="tile.piece"
                                    :key="animations.get(tile.square)?.id ?? 0"
                                    :class="[
                                        'piece',
                                        animations.has(tile.square) &&
                                            'piece--moving',
                                    ]"
                                    :style="
                                        animations.get(tile.square)
                                            ? {
                                                  '--mv-x':
                                                      animations.get(
                                                          tile.square,
                                                      ).dx + 'px',
                                                  '--mv-y':
                                                      animations.get(
                                                          tile.square,
                                                      ).dy + 'px',
                                              }
                                            : null
                                    "
                                    :color="tile.piece.color"
                                    :type="tile.piece.type"
                                />
                                <span
                                    v-if="tile.fileIndex === 0"
                                    class="coord coord--rank"
                                >
                                    {{ tile.square[1] }}
                                </span>
                                <span
                                    v-if="tile.rowIndex === 7"
                                    class="coord coord--file"
                                >
                                    {{ tile.square[0] }}
                                </span>
                            </button>
                        </div>
                    </div>

                    <!-- Controls -->
                    <div
                        class="mt-5 flex w-full max-w-180 items-center justify-between gap-3"
                    >
                        <p class="meta">
                            <span class="text-ink">{{ gameTurnLabel }}</span>
                            <span class="mx-2 text-ink-faint">·</span>
                            <span>You play white</span>
                        </p>

                        <div class="flex gap-2">
                            <button
                                class="btn btn--ghost"
                                type="button"
                                @click="resign"
                            >
                                <Flag
                                    class="h-3.5 w-3.5"
                                    :stroke-width="1.75"
                                />
                                Reset line
                            </button>
                            <button
                                class="btn btn--primary"
                                type="button"
                                @click="newGame"
                            >
                                <RotateCcw
                                    class="h-3.5 w-3.5"
                                    :stroke-width="2"
                                />
                                New game
                            </button>
                        </div>
                    </div>
                </section>

                <!-- =================================================
                     RIGHT — Game card + history + FEN
                     ================================================= -->
                <aside class="order-3 flex flex-col gap-4">
                    <section class="panel p-5 fade-in">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="eyebrow">Current game</p>
                                <h2 class="mt-2 text-base text-ink">
                                    {{ gameTurnLabel }}
                                </h2>
                                <p class="meta mt-1">
                                    vs. {{ activeProfile.name }}
                                </p>
                            </div>
                            <Shield
                                class="h-4 w-4 text-ink-faint"
                                :stroke-width="1.5"
                            />
                        </div>

                        <div class="mt-5 grid grid-cols-2 gap-3">
                            <div class="panel-inner p-3">
                                <TimerReset
                                    class="h-3.5 w-3.5 text-ink-faint"
                                    :stroke-width="1.5"
                                />
                                <p class="label mt-2">Bot delay</p>
                                <p
                                    class="mt-1 num text-sm font-medium text-ink"
                                >
                                    {{ botDelay()
                                    }}<span
                                        class="text-ink-faint text-[10px] ml-0.5"
                                        >ms</span
                                    >
                                </p>
                            </div>
                            <div class="panel-inner p-3">
                                <Sparkles
                                    class="h-3.5 w-3.5 text-ink-faint"
                                    :stroke-width="1.5"
                                />
                                <p class="label mt-2">Search depth</p>
                                <p
                                    class="mt-1 num text-sm font-medium text-ink"
                                >
                                    {{ activeProfile.depth }}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section class="panel p-5 fade-in">
                        <div class="mb-4 flex items-center justify-between">
                            <h2>Move history</h2>
                            <History
                                class="h-4 w-4 text-ink-faint"
                                :stroke-width="1.5"
                            />
                        </div>

                        <div class="space-y-1">
                            <div
                                v-if="movePairs.length === 0"
                                class="meta py-2"
                            >
                                Play any legal white move to begin.
                            </div>
                            <div
                                v-for="pair in movePairs"
                                :key="pair.number"
                                class="grid grid-cols-[28px_1fr_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg-elevated transition-colors duration-150"
                            >
                                <span class="num text-[11px] text-ink-faint"
                                    >{{ pair.number }}.</span
                                >
                                <span class="num font-medium text-ink">{{
                                    pair.white
                                }}</span>
                                <span class="num text-ink-muted">{{
                                    pair.black
                                }}</span>
                            </div>
                        </div>
                    </section>

                    <section class="panel p-5 fade-in">
                        <h2>Position</h2>
                        <p
                            class="mt-3 panel-inner num break-all p-3 text-[11px] leading-relaxed text-ink-muted"
                        >
                            {{ positionFen }}
                        </p>
                    </section>
                </aside>
            </div>
        </div>
    </main>
</template>
