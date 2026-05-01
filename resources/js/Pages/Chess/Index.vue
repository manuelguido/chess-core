<script setup>
import { computed, nextTick, ref, shallowRef } from 'vue';
import { Head } from '@inertiajs/vue3';
import { BrainCircuit, Crown, Flag, Gauge, History, RotateCcw, Shield, Sparkles, Swords, TimerReset } from 'lucide-vue-next';
import { Chess } from 'chess.js';

const props = defineProps({
    botProfiles: Array,
});

const pieceGlyphs = {
    wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
    bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const centerSquares = new Set(['d4', 'e4', 'd5', 'e5']);
const extendedCenterSquares = new Set(['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6']);

const game = shallowRef(new Chess());
const board = ref(game.value.board());
const selectedSquare = ref(null);
const legalTargets = ref([]);
const botThinking = ref(false);
const elo = ref(1600);
const playerColor = ref('w');
const capturedWhite = ref([]);
const capturedBlack = ref([]);
const lastMove = ref(null);
const moveFeedback = ref('Book-ready');
const moveHistory = ref(game.value.history());
const positionFen = ref(game.value.fen());
const currentMoveNumber = ref(game.value.moveNumber());

const activeProfile = computed(() => {
    return [...props.botProfiles].reverse().find((profile) => elo.value >= profile.elo) ?? props.botProfiles[0];
});

const status = computed(() => {
    positionFen.value;

    if (game.value.isCheckmate()) {
        return game.value.turn() === playerColor.value ? 'Checkmate' : 'Bot checkmated';
    }

    if (game.value.isDraw()) {
        return 'Draw';
    }

    if (game.value.isCheck()) {
        return game.value.turn() === playerColor.value ? 'You are in check' : 'Bot in check';
    }

    if (botThinking.value) {
        return `${activeProfile.value.name} thinking`;
    }

    return game.value.turn() === playerColor.value ? 'Your move' : 'Bot to move';
});

const gameTurnLabel = computed(() => {
    positionFen.value;

    if (game.value.isCheckmate()) {
        return game.value.turn() === playerColor.value ? 'Bot wins by checkmate' : 'You win by checkmate';
    }

    if (game.value.isDraw()) {
        return 'Game drawn';
    }

    return game.value.turn() === 'w' ? 'White to move' : 'Black to move';
});

const materialBalance = computed(() => {
    const whiteLost = capturedWhite.value.reduce((total, piece) => total + pieceValues[piece], 0);
    const blackLost = capturedBlack.value.reduce((total, piece) => total + pieceValues[piece], 0);

    return Math.round((blackLost - whiteLost) / 100 * 10) / 10;
});

const movePairs = computed(() => {
    const history = moveHistory.value;
    const pairs = [];

    for (let index = 0; index < history.length; index += 2) {
        pairs.push({
            number: index / 2 + 1,
            white: history[index],
            black: history[index + 1] ?? '',
        });
    }

    return pairs.slice(-8).reverse();
});

const flattenedBoard = computed(() => {
    return board.value.flatMap((rank, rowIndex) => rank.map((piece, fileIndex) => {
        const square = `${String.fromCharCode(97 + fileIndex)}${8 - rowIndex}`;

        return {
            square,
            piece,
            rowIndex,
            fileIndex,
            dark: (rowIndex + fileIndex) % 2 === 1,
        };
    }));
});

const legalTargetSet = computed(() => new Set(legalTargets.value));

const syncBoard = () => {
    board.value = game.value.board();
    moveHistory.value = game.value.history();
    positionFen.value = game.value.fen();
    currentMoveNumber.value = game.value.moveNumber();
};

const squareClasses = (tile) => {
    const selected = selectedSquare.value === tile.square;
    const legal = legalTargetSet.value.has(tile.square);
    const last = lastMove.value && (lastMove.value.from === tile.square || lastMove.value.to === tile.square);

    return [
        tile.dark ? 'bg-zinc-700' : 'bg-zinc-200',
        selected ? 'ring-4 ring-yellow-300 ring-inset' : '',
        legal ? 'after:absolute after:left-1/2 after:top-1/2 after:h-4 after:w-4 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-yellow-300/70' : '',
        last ? 'outline outline-2 -outline-offset-2 outline-yellow-400/70' : '',
    ];
};

const pieceClasses = (piece) => {
    if (!piece) {
        return '';
    }

    return piece.color === 'w'
        ? 'text-zinc-50 drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]'
        : 'text-zinc-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.35)]';
};

const selectSquare = (tile) => {
    if (botThinking.value || game.value.isGameOver() || game.value.turn() !== playerColor.value) {
        return;
    }

    if (tile.piece?.color === playerColor.value) {
        selectedSquare.value = tile.square;
        legalTargets.value = game.value.moves({ square: tile.square, verbose: true }).map((move) => move.to);
        return;
    }

    if (!selectedSquare.value) {
        return;
    }

    makePlayerMove(tile.square);
};

const makePlayerMove = (targetSquare) => {
    const move = game.value.move({
        from: selectedSquare.value,
        to: targetSquare,
        promotion: 'q',
    });

    if (!move) {
        selectedSquare.value = null;
        legalTargets.value = [];
        return;
    }

    registerMove(move, 'player');
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
        const playedMove = game.value.move(move);
        registerMove(playedMove, 'bot');
        syncBoard();
    }

    botThinking.value = false;
};

const registerMove = (move, side) => {
    if (move.captured) {
        if (move.color === 'w') {
            capturedBlack.value.push(move.captured);
        } else {
            capturedWhite.value.push(move.captured);
        }
    }

    lastMove.value = { from: move.from, to: move.to };
    moveFeedback.value = classifyMove(move, side);
};

const chooseBotMove = () => {
    const moves = game.value.moves({ verbose: true });

    if (moves.length === 0) {
        return null;
    }

    const profile = activeProfile.value;
    const depth = profile.depth;
    const noise = Math.max(0, (3000 - elo.value) / 3000) * 180;

    const scoredMoves = moves.map((move) => {
        game.value.move(move);
        const score = minimax(depth - 1, -Infinity, Infinity, true);
        game.value.undo();

        return {
            move,
            score: score + (Math.random() * noise - noise / 2),
        };
    });

    scoredMoves.sort((first, second) => first.score - second.score);

    if (elo.value < 1000) {
        return scoredMoves[Math.floor(Math.random() * Math.min(scoredMoves.length, 6))].move;
    }

    if (elo.value < 1500 && Math.random() < 0.28) {
        return scoredMoves[Math.floor(Math.random() * Math.min(scoredMoves.length, 4))].move;
    }

    return scoredMoves[0].move;
};

const minimax = (depth, alpha, beta, maximizingWhite) => {
    if (depth === 0 || game.value.isGameOver()) {
        return evaluatePosition();
    }

    const moves = game.value.moves({ verbose: true });

    if (maximizingWhite) {
        let bestScore = -Infinity;

        for (const move of moves) {
            game.value.move(move);
            bestScore = Math.max(bestScore, minimax(depth - 1, alpha, beta, false));
            game.value.undo();
            alpha = Math.max(alpha, bestScore);

            if (beta <= alpha) {
                break;
            }
        }

        return bestScore;
    }

    let bestScore = Infinity;

    for (const move of moves) {
        game.value.move(move);
        bestScore = Math.min(bestScore, minimax(depth - 1, alpha, beta, true));
        game.value.undo();
        beta = Math.min(beta, bestScore);

        if (beta <= alpha) {
            break;
        }
    }

    return bestScore;
};

const evaluatePosition = () => {
    if (game.value.isCheckmate()) {
        return game.value.turn() === 'w' ? -100000 : 100000;
    }

    if (game.value.isDraw()) {
        return 0;
    }

    let score = 0;

    for (const tile of game.value.board().flat()) {
        if (!tile) {
            continue;
        }

        const squareBonus = centerSquares.has(tile.square) ? 18 : extendedCenterSquares.has(tile.square) ? 8 : 0;
        const pieceScore = pieceValues[tile.type] + squareBonus;
        score += tile.color === 'w' ? pieceScore : -pieceScore;
    }

    score += game.value.moves({ verbose: true }).length * (game.value.turn() === 'w' ? 1.5 : -1.5);

    return score;
};

const classifyMove = (move, side) => {
    if (move.san.includes('#')) {
        return side === 'player' ? 'Checkmate landed' : 'Engine mate threat';
    }

    if (move.san.includes('+')) {
        return side === 'player' ? 'Forcing check' : 'Bot creates pressure';
    }

    if (move.captured) {
        return side === 'player' ? 'Material captured' : 'Bot wins material';
    }

    if (centerSquares.has(move.to)) {
        return side === 'player' ? 'Center control' : 'Bot contests center';
    }

    return side === 'player' ? 'Position improved' : 'Bot develops';
};

const botDelay = () => Math.max(220, 820 - Math.floor(elo.value / 5));

const newGame = async () => {
    game.value = new Chess();
    selectedSquare.value = null;
    legalTargets.value = [];
    capturedWhite.value = [];
    capturedBlack.value = [];
    lastMove.value = null;
    moveFeedback.value = 'Book-ready';
    botThinking.value = false;
    syncBoard();

    await nextTick();
};

const resign = () => {
    moveFeedback.value = 'Training line reset';
    newGame();
};
</script>

<template>
    <Head title="Chess AI" />

    <main class="min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div class="pointer-events-none fixed inset-0 -z-10">
            <div class="absolute left-1/2 top-0 h-[540px] w-[720px] -translate-x-1/2 rounded-full bg-yellow-400/10 blur-3xl" />
            <div class="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-3xl" />
            <div class="absolute inset-0 bg-[linear-gradient(rgba(250,250,250,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(250,250,250,0.025)_1px,transparent_1px)] bg-[size:34px_34px]" />
        </div>

        <section class="mx-auto flex min-h-screen max-w-[1500px] flex-col px-5 py-5 sm:px-8 lg:px-10">
            <header class="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
                <div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 items-center justify-center rounded-lg border border-yellow-300/30 bg-yellow-300/10 text-yellow-200 shadow-lg shadow-yellow-500/10">
                        <Crown class="h-5 w-5" />
                    </div>
                    <div>
                        <p class="text-xs font-medium uppercase tracking-[0.2em] text-yellow-200">Checkmate Lab</p>
                        <h1 class="text-lg font-semibold tracking-tight text-white">Chess AI</h1>
                    </div>
                </div>

                <div class="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs font-medium text-zinc-300">
                    <BrainCircuit class="h-4 w-4 text-yellow-200" />
                    {{ activeProfile.name }} · {{ elo }} ELO
                </div>
            </header>

            <div class="grid flex-1 gap-5 py-5 xl:grid-cols-[330px_minmax(520px,1fr)_360px]">
                <aside class="space-y-5 order-2 xl:order-1">
                    <section class="rounded-lg border border-zinc-800 bg-zinc-900/75 p-5 shadow-2xl shadow-black/30">
                        <div class="mb-4 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">Bot strength</h2>
                            <Gauge class="h-4 w-4 text-yellow-200" />
                        </div>

                        <input
                            v-model="elo"
                            type="range"
                            min="800"
                            max="3000"
                            step="100"
                            class="w-full accent-yellow-300"
                        >

                        <div class="mt-4 grid grid-cols-2 gap-3">
                            <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                                <p class="text-xs text-zinc-500">Profile</p>
                                <p class="mt-2 text-sm font-semibold text-white">{{ activeProfile.name }}</p>
                            </div>
                            <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                                <p class="text-xs text-zinc-500">Style</p>
                                <p class="mt-2 text-sm font-semibold text-white">{{ activeProfile.style }}</p>
                            </div>
                        </div>

                        <div class="mt-4 grid gap-2">
                            <button
                                v-for="profile in botProfiles"
                                :key="profile.elo"
                                class="flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition"
                                :class="activeProfile.elo === profile.elo ? 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100' : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100'"
                                @click="elo = profile.elo"
                            >
                                <span>{{ profile.name }}</span>
                                <span class="font-mono text-xs">{{ profile.elo }}</span>
                            </button>
                        </div>
                    </section>

                    <section class="rounded-lg border border-zinc-800 bg-zinc-900/75 p-5 shadow-xl shadow-black/20">
                        <div class="mb-4 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">Captured</h2>
                            <Swords class="h-4 w-4 text-yellow-200" />
                        </div>
                        <div class="space-y-3">
                            <div class="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                                <p class="text-xs text-zinc-500">White pieces lost</p>
                                <p class="mt-2 min-h-7 text-2xl text-zinc-100">
                                    <span v-for="(piece, index) in capturedWhite" :key="`${piece}-${index}`">{{ pieceGlyphs[`w${piece}`] }}</span>
                                </p>
                            </div>
                            <div class="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                                <p class="text-xs text-zinc-500">Black pieces lost</p>
                                <p class="mt-2 min-h-7 text-2xl text-zinc-100">
                                    <span v-for="(piece, index) in capturedBlack" :key="`${piece}-${index}`">{{ pieceGlyphs[`b${piece}`] }}</span>
                                </p>
                            </div>
                        </div>
                    </section>
                </aside>

                <section class="order-1 flex flex-col items-center justify-center xl:order-2">
                    <div class="mb-4 grid w-full max-w-[720px] grid-cols-2 gap-3 sm:grid-cols-4">
                        <div class="rounded-lg border border-zinc-800 bg-zinc-900/75 p-4">
                            <p class="text-xs text-zinc-500">Status</p>
                            <p class="mt-2 truncate text-sm font-semibold text-white">{{ status }}</p>
                        </div>
                        <div class="rounded-lg border border-zinc-800 bg-zinc-900/75 p-4">
                            <p class="text-xs text-zinc-500">Material</p>
                            <p class="mt-2 text-sm font-semibold" :class="materialBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'">
                                {{ materialBalance > 0 ? '+' : '' }}{{ materialBalance }}
                            </p>
                        </div>
                        <div class="rounded-lg border border-zinc-800 bg-zinc-900/75 p-4">
                            <p class="text-xs text-zinc-500">Move</p>
                            <p class="mt-2 text-sm font-semibold text-white">{{ currentMoveNumber }}</p>
                        </div>
                        <div class="rounded-lg border border-zinc-800 bg-zinc-900/75 p-4">
                            <p class="text-xs text-zinc-500">Analysis</p>
                            <p class="mt-2 truncate text-sm font-semibold text-yellow-200">{{ moveFeedback }}</p>
                        </div>
                    </div>

                    <div class="relative aspect-square w-full max-w-[720px] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 p-2 shadow-2xl shadow-black/50">
                        <div class="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-md border border-zinc-950/70">
                            <button
                                v-for="tile in flattenedBoard"
                                :key="tile.square"
                                class="relative flex items-center justify-center text-[clamp(2rem,7vw,4.6rem)] transition hover:brightness-110"
                                :class="squareClasses(tile)"
                                @click="selectSquare(tile)"
                            >
                                <span v-if="tile.piece" class="relative z-10 leading-none" :class="pieceClasses(tile.piece)">
                                    {{ pieceGlyphs[`${tile.piece.color}${tile.piece.type}`] }}
                                </span>
                                <span class="pointer-events-none absolute bottom-1 left-1 font-mono text-[10px] font-semibold" :class="tile.dark ? 'text-zinc-300/45' : 'text-zinc-700/50'">
                                    {{ tile.fileIndex === 0 ? tile.square[1] : '' }}
                                </span>
                                <span class="pointer-events-none absolute bottom-1 right-1 font-mono text-[10px] font-semibold" :class="tile.dark ? 'text-zinc-300/45' : 'text-zinc-700/50'">
                                    {{ tile.rowIndex === 7 ? tile.square[0] : '' }}
                                </span>
                            </button>
                        </div>
                    </div>

                    <div class="mt-4 flex w-full max-w-[720px] flex-wrap gap-3">
                        <button class="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-yellow-200" @click="newGame">
                            <RotateCcw class="h-4 w-4" />
                            New game
                        </button>
                        <button class="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900" @click="resign">
                            <Flag class="h-4 w-4" />
                            Reset line
                        </button>
                    </div>
                </section>

                <aside class="order-3 space-y-5">
                    <section class="rounded-lg border border-yellow-300/20 bg-yellow-300/[0.045] p-5 shadow-2xl shadow-yellow-950/20">
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <p class="text-xs font-medium uppercase tracking-[0.18em] text-yellow-200">Current game</p>
                                <h2 class="mt-2 text-2xl font-semibold text-white">{{ gameTurnLabel }}</h2>
                                <p class="mt-1 text-sm text-zinc-400">You play white against {{ activeProfile.name }}</p>
                            </div>
                            <Shield class="h-5 w-5 text-yellow-200" />
                        </div>

                        <div class="mt-5 grid grid-cols-2 gap-3">
                            <div class="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                                <TimerReset class="h-4 w-4 text-yellow-200" />
                                <p class="mt-3 text-xs text-zinc-500">Bot delay</p>
                                <p class="mt-1 text-lg font-semibold text-white">{{ botDelay() }}ms</p>
                            </div>
                            <div class="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                                <Sparkles class="h-4 w-4 text-yellow-200" />
                                <p class="mt-3 text-xs text-zinc-500">Depth</p>
                                <p class="mt-1 text-lg font-semibold text-white">{{ activeProfile.depth }}</p>
                            </div>
                        </div>
                    </section>

                    <section class="rounded-lg border border-zinc-800 bg-zinc-900/75 p-5 shadow-xl shadow-black/20">
                        <div class="mb-4 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">Move history</h2>
                            <History class="h-4 w-4 text-yellow-200" />
                        </div>

                        <div class="space-y-2">
                            <div v-if="movePairs.length === 0" class="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-3 text-sm text-zinc-500">
                                Start with any legal white move.
                            </div>
                            <div v-for="pair in movePairs" :key="pair.number" class="grid grid-cols-[42px_1fr_1fr] gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2.5 text-sm">
                                <span class="font-mono text-xs text-zinc-500">{{ pair.number }}.</span>
                                <span class="font-medium text-zinc-100">{{ pair.white }}</span>
                                <span class="font-medium text-zinc-400">{{ pair.black }}</span>
                            </div>
                        </div>
                    </section>

                    <section class="rounded-lg border border-zinc-800 bg-zinc-900/75 p-5 shadow-xl shadow-black/20">
                        <h2 class="text-sm font-semibold text-white">Position FEN</h2>
                        <p class="mt-3 break-all rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-xs leading-relaxed text-zinc-400">
                            {{ positionFen }}
                        </p>
                    </section>
                </aside>
            </div>
        </section>
    </main>
</template>