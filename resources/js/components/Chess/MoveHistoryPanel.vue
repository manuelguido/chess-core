<script setup>
import { computed, ref } from 'vue';
import {
    ChevronsLeft,
    ChevronsRight,
    ChevronLeft,
    ChevronRight,
    History,
} from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

const historyEl = ref(null);

/** Index of the highlighted half-move (-1 = before first move). */
const activeCursor = computed(() =>
    chess.viewCursor !== null ? chess.viewCursor : chess.fullHistory.length - 1,
);

const isCursorAt = (idx) => activeCursor.value === idx;

const jumpTo = (idx) => chess.goTo(idx);
</script>

<template>
    <section class="panel fade-in flex flex-col p-5">
        <div class="mb-3 flex items-center justify-between">
            <h2>Move history</h2>
            <History class="h-4 w-4 text-ink-faint" :stroke-width="1.5" />
        </div>

        <!-- Navigation controls -->
        <div class="mb-3 flex items-center gap-1">
            <button
                type="button"
                class="btn btn--ghost !px-2 !py-1"
                :disabled="activeCursor <= -1"
                title="Go to start"
                @click="chess.goToStart()"
            >
                <ChevronsLeft class="h-3.5 w-3.5" :stroke-width="2" />
            </button>
            <button
                type="button"
                class="btn btn--ghost !px-2 !py-1"
                :disabled="activeCursor <= -1"
                title="Previous move"
                @click="chess.goBack()"
            >
                <ChevronLeft class="h-3.5 w-3.5" :stroke-width="2" />
            </button>
            <button
                type="button"
                class="btn btn--ghost !px-2 !py-1"
                :disabled="activeCursor >= chess.fullHistory.length - 1"
                title="Next move"
                @click="chess.goForward()"
            >
                <ChevronRight class="h-3.5 w-3.5" :stroke-width="2" />
            </button>
            <button
                type="button"
                class="btn btn--ghost !px-2 !py-1"
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
                Viewing {{ activeCursor + 1 }} / {{ chess.fullHistory.length }}
            </span>
        </div>

        <!-- Move list — full, scrollable, newest first -->
        <div
            ref="historyEl"
            class="max-h-72 flex-1 space-y-0.5 overflow-y-auto pr-1"
        >
            <div v-if="chess.movePairs.length === 0" class="meta py-2">
                <span v-if="chess.gamePhase === 'lobby'"
                    >Start a game to see moves.</span
                >
                <span v-else>Play any move to begin.</span>
            </div>
            <div
                v-for="pair in [...chess.movePairs].reverse()"
                :key="pair.number"
                class="grid grid-cols-[28px_1fr_1fr] items-center gap-1"
            >
                <span class="num px-1 text-[11px] text-ink-faint"
                    >{{ pair.number }}.</span
                >

                <!-- White half-move -->
                <button
                    type="button"
                    class="num rounded px-2 py-1 text-left text-sm transition-colors duration-100"
                    :class="
                        isCursorAt(pair.whiteIdx)
                            ? 'bg-accent font-semibold text-bg-base'
                            : 'text-ink hover:bg-bg-elevated'
                    "
                    @click="jumpTo(pair.whiteIdx)"
                >
                    {{ pair.white }}
                </button>

                <!-- Black half-move -->
                <button
                    v-if="pair.black"
                    type="button"
                    class="num rounded px-2 py-1 text-left text-sm transition-colors duration-100"
                    :class="
                        isCursorAt(pair.blackIdx)
                            ? 'bg-accent font-semibold text-bg-base'
                            : 'text-ink-muted hover:bg-bg-elevated'
                    "
                    @click="jumpTo(pair.blackIdx)"
                >
                    {{ pair.black }}
                </button>
                <span v-else class="px-2 py-1" />
            </div>
        </div>

        <!-- Return to live banner -->
        <div v-if="chess.isReviewing" class="panel-divider mt-3 pt-3">
            <button
                type="button"
                class="btn btn--primary w-full justify-center text-xs"
                @click="chess.returnToLive()"
            >
                Return to live position
            </button>
        </div>
    </section>
</template>
