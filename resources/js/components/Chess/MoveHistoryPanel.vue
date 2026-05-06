<script setup>
import { computed, ref } from "vue";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, History } from "lucide-vue-next";
import { useChessStore } from "../../stores/useChessStore.js";

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
    <section class="panel p-5 fade-in flex flex-col">
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
                @click="chess.goToStart()"
                title="Go to start"
            >
                <ChevronsLeft class="h-3.5 w-3.5" :stroke-width="2" />
            </button>
            <button
                type="button"
                class="btn btn--ghost !px-2 !py-1"
                :disabled="activeCursor <= -1"
                @click="chess.goBack()"
                title="Previous move"
            >
                <ChevronLeft class="h-3.5 w-3.5" :stroke-width="2" />
            </button>
            <button
                type="button"
                class="btn btn--ghost !px-2 !py-1"
                :disabled="activeCursor >= chess.fullHistory.length - 1"
                @click="chess.goForward()"
                title="Next move"
            >
                <ChevronRight class="h-3.5 w-3.5" :stroke-width="2" />
            </button>
            <button
                type="button"
                class="btn btn--ghost !px-2 !py-1"
                :disabled="activeCursor >= chess.fullHistory.length - 1"
                @click="chess.returnToLive()"
                title="Return to live"
            >
                <ChevronsRight class="h-3.5 w-3.5" :stroke-width="2" />
            </button>

            <span
                v-if="chess.isReviewing"
                class="ml-auto label text-[10px] text-accent"
            >
                Viewing {{ activeCursor + 1 }} / {{ chess.fullHistory.length }}
            </span>
        </div>

        <!-- Move list — full, scrollable, newest first -->
        <div ref="historyEl" class="flex-1 overflow-y-auto space-y-0.5 max-h-72 pr-1">
            <div v-if="chess.movePairs.length === 0" class="meta py-2">
                <span v-if="chess.gamePhase === 'lobby'">Start a game to see moves.</span>
                <span v-else>Play any move to begin.</span>
            </div>
            <div
                v-for="pair in [...chess.movePairs].reverse()"
                :key="pair.number"
                class="grid grid-cols-[28px_1fr_1fr] items-center gap-1"
            >
                <span class="num text-[11px] text-ink-faint px-1">{{ pair.number }}.</span>

                <!-- White half-move -->
                <button
                    type="button"
                    class="num text-left rounded px-2 py-1 text-sm transition-colors duration-100"
                    :class="
                        isCursorAt(pair.whiteIdx)
                            ? 'bg-accent text-bg-base font-semibold'
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
                    class="num text-left rounded px-2 py-1 text-sm transition-colors duration-100"
                    :class="
                        isCursorAt(pair.blackIdx)
                            ? 'bg-accent text-bg-base font-semibold'
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
        <div v-if="chess.isReviewing" class="mt-3 panel-divider pt-3">
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

