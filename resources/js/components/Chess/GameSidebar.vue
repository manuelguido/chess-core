<script setup>
import { computed } from 'vue';
import {
    Activity,
    ChevronsLeft,
    ChevronsRight,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    History,
    Swords,
} from 'lucide-vue-next';
import ChessPiece from '../ChessPiece.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

const activeCursor = computed(() =>
    chess.viewCursor !== null ? chess.viewCursor : chess.fullHistory.length - 1,
);

const isCursorAt = (idx) => activeCursor.value === idx;

const jumpTo = (idx) => chess.goTo(idx);

const formatTc = (tc) => {
    if (!tc) return 'Untimed';
    const m = Math.floor(tc.base / 60);
    return tc.increment ? `${m}+${tc.increment}` : `${m}+0`;
};

const materialLabel = computed(() => {
    if (chess.materialBalance > 0) return `+${chess.materialBalance}`;
    return `${chess.materialBalance}`;
});
</script>

<template>
    <aside
        class="panel fade-in flex max-h-none min-h-0 flex-col overflow-hidden lg:max-h-[calc(100vh-3rem)]"
    >
        <section class="panel-section">
            <div class="mb-5 flex items-start justify-between gap-4">
                <div>
                    <p class="eyebrow">Current game</p>
                    <h2 class="mt-2 text-xl">{{ chess.gameTurnLabel }}</h2>
                    <p class="meta mt-1">vs. {{ chess.activeProfile?.name }}</p>
                </div>
                <span
                    class="flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated text-navy-800"
                >
                    <Activity class="h-4 w-4" :stroke-width="1.8" />
                </span>
            </div>

            <div
                class="grid gap-px overflow-hidden rounded-3xl border border-line-soft bg-line-soft"
            >
                <div class="bg-bg-surface p-4">
                    <p class="label">Status</p>
                    <p class="mt-1.5 text-sm font-bold text-navy-950">
                        {{ chess.status }}
                    </p>
                </div>
                <div class="grid grid-cols-3 gap-px bg-line-soft">
                    <div class="bg-bg-surface p-3">
                        <p class="label">Move</p>
                        <p class="num mt-1.5 text-sm font-bold text-navy-950">
                            {{ chess.currentMoveNumber }}
                        </p>
                    </div>
                    <div class="bg-bg-surface p-3">
                        <p class="label">Material</p>
                        <p
                            class="num mt-1.5 text-sm font-bold"
                            :class="
                                chess.materialBalance < 0
                                    ? 'text-negative'
                                    : 'text-positive'
                            "
                        >
                            {{ materialLabel }}
                        </p>
                    </div>
                    <div class="bg-bg-surface p-3">
                        <p class="label">Time</p>
                        <p class="num mt-1.5 text-sm font-bold text-navy-950">
                            {{ formatTc(chess.timeControl) }}
                        </p>
                    </div>
                </div>
                <div class="bg-bg-surface p-4">
                    <p class="label">Last note</p>
                    <p class="mt-1.5 text-sm font-bold text-accent">
                        {{ chess.moveFeedback }}
                    </p>
                </div>
            </div>
        </section>

        <section
            class="panel-section panel-divider flex min-h-0 flex-1 flex-col"
        >
            <div class="mb-3 flex items-center justify-between gap-3">
                <h2>Move history</h2>
                <History class="h-4 w-4 text-ink-faint" :stroke-width="1.6" />
            </div>

            <div class="mb-3 flex items-center gap-1.5">
                <button
                    type="button"
                    class="icon-btn h-9 w-9"
                    :disabled="activeCursor <= -1"
                    title="Go to start"
                    @click="chess.goToStart()"
                >
                    <ChevronsLeft class="h-3.5 w-3.5" :stroke-width="2" />
                </button>
                <button
                    type="button"
                    class="icon-btn h-9 w-9"
                    :disabled="activeCursor <= -1"
                    title="Previous move"
                    @click="chess.goBack()"
                >
                    <ChevronLeft class="h-3.5 w-3.5" :stroke-width="2" />
                </button>
                <button
                    type="button"
                    class="icon-btn h-9 w-9"
                    :disabled="activeCursor >= chess.fullHistory.length - 1"
                    title="Next move"
                    @click="chess.goForward()"
                >
                    <ChevronRight class="h-3.5 w-3.5" :stroke-width="2" />
                </button>
                <button
                    type="button"
                    class="icon-btn h-9 w-9"
                    :disabled="activeCursor >= chess.fullHistory.length - 1"
                    title="Return to live"
                    @click="chess.returnToLive()"
                >
                    <ChevronsRight class="h-3.5 w-3.5" :stroke-width="2" />
                </button>

                <span
                    v-if="chess.isReviewing"
                    class="label ml-auto text-[10px] text-accent"
                >
                    {{ activeCursor + 1 }} / {{ chess.fullHistory.length }}
                </span>
            </div>

            <div class="min-h-[8.5rem] flex-1 overflow-y-auto pr-1 lg:max-h-64">
                <div v-if="chess.movePairs.length === 0" class="meta py-5">
                    <span v-if="chess.gamePhase === 'lobby'">
                        Moves will appear here.
                    </span>
                    <span v-else>No moves yet.</span>
                </div>
                <div
                    v-for="pair in [...chess.movePairs].reverse()"
                    :key="pair.number"
                    class="grid grid-cols-[32px_1fr_1fr] items-center gap-1"
                >
                    <span
                        class="num px-1 text-[11px] font-semibold text-ink-faint"
                    >
                        {{ pair.number }}.
                    </span>

                    <button
                        type="button"
                        class="num rounded-full px-2.5 py-1.5 text-left text-sm font-semibold transition-colors duration-100"
                        :class="
                            isCursorAt(pair.whiteIdx)
                                ? 'bg-accent text-white'
                                : 'text-navy-950 hover:bg-bg-elevated'
                        "
                        @click="jumpTo(pair.whiteIdx)"
                    >
                        {{ pair.white }}
                    </button>

                    <button
                        v-if="pair.black"
                        type="button"
                        class="num rounded-full px-2.5 py-1.5 text-left text-sm font-semibold transition-colors duration-100"
                        :class="
                            isCursorAt(pair.blackIdx)
                                ? 'bg-accent text-white'
                                : 'text-ink-muted hover:bg-bg-elevated'
                        "
                        @click="jumpTo(pair.blackIdx)"
                    >
                        {{ pair.black }}
                    </button>
                    <span v-else class="px-2 py-1" />
                </div>
            </div>

            <button
                v-if="chess.isReviewing"
                type="button"
                class="btn btn--primary mt-4 w-full"
                @click="chess.returnToLive()"
            >
                Return to live position
            </button>
        </section>

        <section class="panel-section panel-divider">
            <div class="mb-4 flex items-center justify-between gap-3">
                <h2>Captured pieces</h2>
                <Swords class="h-4 w-4 text-ink-faint" :stroke-width="1.6" />
            </div>

            <div class="space-y-4">
                <div>
                    <p class="label">White lost</p>
                    <div class="mt-2 flex min-h-9 flex-wrap items-center gap-1">
                        <span
                            v-for="(piece, index) in chess.capturedWhite"
                            :key="`w-${piece}-${index}`"
                            class="block h-7 w-7"
                        >
                            <ChessPiece color="w" :type="piece" />
                        </span>
                        <span
                            v-if="chess.capturedWhite.length === 0"
                            class="meta text-xs"
                        >
                            None
                        </span>
                    </div>
                </div>
                <div>
                    <p class="label">Black lost</p>
                    <div class="mt-2 flex min-h-9 flex-wrap items-center gap-1">
                        <span
                            v-for="(piece, index) in chess.capturedBlack"
                            :key="`b-${piece}-${index}`"
                            class="block h-7 w-7"
                        >
                            <ChessPiece color="b" :type="piece" />
                        </span>
                        <span
                            v-if="chess.capturedBlack.length === 0"
                            class="meta text-xs"
                        >
                            None
                        </span>
                    </div>
                </div>
            </div>
        </section>

        <section class="panel-section panel-divider">
            <div class="mb-3 flex items-center justify-between gap-3">
                <h2>Position</h2>
                <ClipboardList
                    class="h-4 w-4 text-ink-faint"
                    :stroke-width="1.6"
                />
            </div>
            <p
                class="num rounded-3xl border border-line-soft bg-bg-sunken p-4 text-[11px] leading-relaxed break-all text-ink-muted"
            >
                {{ chess.viewFen }}
            </p>
        </section>
    </aside>
</template>
