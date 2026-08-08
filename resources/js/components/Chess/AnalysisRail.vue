<script setup>
/**
 * AnalysisRail — the right column: position readouts, the move log with
 * history navigation, captured material, and the FEN of whatever position
 * is currently on the board.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { Copy } from 'lucide-vue-next';
import ChessPiece from '../ChessPiece.vue';
import PlayerClockCard from './PlayerClockCard.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

const TABS = [
    { key: 'moves', label: 'Moves' },
    { key: 'captured', label: 'Captured' },
];

const tab = ref('moves');
const moveListEl = ref(null);
const copied = ref(false);
let copyTimer = null;

/** Where the review cursor effectively sits (live = last ply). */
const activeCursor = computed(() =>
    chess.viewCursor !== null ? chess.viewCursor : chess.fullHistory.length - 1,
);

const atStart = computed(() => activeCursor.value <= -1);
const atLive = computed(
    () => activeCursor.value >= chess.fullHistory.length - 1,
);

const isViewing = (index) => index !== null && chess.viewCursor === index;

const isCurrent = (index) =>
    index !== null &&
    chess.viewCursor === null &&
    index === chess.fullHistory.length - 1;

const evalText = computed(() => {
    if (chess.isCheckmate) return '#';
    const value = chess.positionEval;
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
});

const materialText = computed(() => {
    const balance = chess.materialBalance;
    if (balance === 0) return 'even';
    return balance > 0 ? `+${balance} W` : `+${Math.abs(balance)} B`;
});

const copyFen = async () => {
    try {
        await navigator.clipboard.writeText(chess.viewFen);
        copied.value = true;
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
            copied.value = false;
            copyTimer = null;
        }, 1400);
    } catch {
        // Clipboard is unavailable (insecure origin or denied) — the FEN is
        // selectable in the panel below, so there is nothing to recover from.
    }
};

/** Keep the newest move in view as the game runs on. */
watch(
    () => chess.fullHistory.length,
    async () => {
        if (tab.value !== 'moves') return;
        await nextTick();
        if (moveListEl.value) {
            moveListEl.value.scrollTop = moveListEl.value.scrollHeight;
        }
    },
);
</script>

<template>
    <aside class="rail">
        <!--
            The engine always takes the top card and you the bottom one,
            independent of board orientation — your clock should not move
            when you flip the board.
        -->
        <PlayerClockCard
            edge="top"
            is-engine
            :name="chess.activeProfile?.name ?? 'Engine'"
            :rating="chess.elo"
            :thinking="chess.botThinking"
            v-bind="chess.opponentClock"
        />

        <!-- Scrolls between the two cards so both clocks stay pinned. -->
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div class="flex shrink-0 gap-px border-b border-line px-3.5">
                <button
                    v-for="item in TABS"
                    :key="item.key"
                    type="button"
                    class="tab"
                    :data-active="tab === item.key"
                    @click="tab = item.key"
                >
                    {{ item.label }}
                </button>
            </div>

            <!-- Readouts --------------------------------------------------- -->
            <div
                class="grid shrink-0 grid-cols-3 gap-px border-b border-line-soft bg-line-soft px-3.5 py-3"
            >
                <div class="bg-bg-panel py-0.5">
                    <div class="micro">Eval</div>
                    <div class="num mt-1 text-[15px] font-medium">
                        {{ evalText }}
                    </div>
                </div>
                <div class="bg-bg-panel py-0.5 pl-3">
                    <div class="micro">Material</div>
                    <div class="num mt-1 text-[15px] font-medium">
                        {{ materialText }}
                    </div>
                </div>
                <div class="bg-bg-panel py-0.5 pl-3">
                    <div class="micro">Move</div>
                    <div class="num mt-1 text-[15px] font-medium">
                        {{ chess.currentMoveNumber }}
                    </div>
                </div>
            </div>

            <!-- Moves ------------------------------------------------------ -->
            <div
                v-if="tab === 'moves'"
                class="flex min-h-[250px] flex-[1_0_auto] flex-col"
            >
                <div
                    class="flex shrink-0 items-center gap-2.5 border-b border-line-soft px-3.5 py-2.5"
                >
                    <span
                        class="shrink-0 rounded border border-accent-edge px-1.5 py-1 text-[9.5px] font-semibold tracking-[0.08em] text-accent"
                    >
                        {{ chess.opening.eco }}
                    </span>
                    <span class="text-xs leading-snug text-ink-mild">
                        {{ chess.opening.name }}
                    </span>
                </div>

                <div
                    ref="moveListEl"
                    class="max-h-72 min-h-[140px] flex-1 overflow-y-auto py-1.5 xl:max-h-none"
                >
                    <p
                        v-if="chess.movePairs.length === 0"
                        class="px-4 py-5 text-xs text-ink-ghost"
                    >
                        No moves yet — make the first move on the board.
                    </p>

                    <div
                        v-for="pair in chess.movePairs"
                        :key="pair.number"
                        class="move-row"
                    >
                        <div class="move-row__n">{{ pair.number }}</div>
                        <button
                            type="button"
                            class="move-cell"
                            :data-current="isCurrent(pair.whiteIdx)"
                            :data-viewing="isViewing(pair.whiteIdx)"
                            @click="chess.goTo(pair.whiteIdx)"
                        >
                            {{ pair.white }}
                        </button>
                        <button
                            type="button"
                            class="move-cell"
                            :disabled="pair.blackIdx === null"
                            :data-current="isCurrent(pair.blackIdx)"
                            :data-viewing="isViewing(pair.blackIdx)"
                            @click="
                                pair.blackIdx !== null &&
                                chess.goTo(pair.blackIdx)
                            "
                        >
                            {{ pair.black || '—' }}
                        </button>
                    </div>
                </div>

                <div class="move-nav shrink-0">
                    <button
                        type="button"
                        :disabled="atStart"
                        aria-label="Go to start"
                        @click="chess.goToStart()"
                    >
                        «
                    </button>
                    <button
                        type="button"
                        :disabled="atStart"
                        aria-label="Previous move"
                        @click="chess.goBack()"
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        :disabled="atLive"
                        aria-label="Next move"
                        @click="chess.goForward()"
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        :disabled="atLive"
                        aria-label="Return to live position"
                        @click="chess.returnToLive()"
                    >
                        »
                    </button>
                </div>
            </div>

            <!-- Captured --------------------------------------------------- -->
            <div v-else class="min-h-[250px] flex-[1_0_auto] p-3.5">
                <div class="eyebrow mb-2.5">Captured</div>
                <div class="flex flex-col gap-2">
                    <div
                        v-for="group in [
                            {
                                label: 'White lost',
                                color: 'w',
                                list: chess.capturedWhite,
                            },
                            {
                                label: 'Black lost',
                                color: 'b',
                                list: chess.capturedBlack,
                            },
                        ]"
                        :key="group.color"
                        class="tile flex items-center justify-between gap-3 px-2.5 py-2.5"
                    >
                        <span class="text-[11.5px] text-ink-soft">
                            {{ group.label }}
                        </span>
                        <span
                            class="flex flex-wrap items-center justify-end gap-1"
                        >
                            <span
                                v-for="(type, index) in group.list"
                                :key="`${group.color}-${type}-${index}`"
                                class="block h-4 w-4"
                            >
                                <ChessPiece :color="group.color" :type="type" />
                            </span>
                            <span
                                v-if="group.list.length === 0"
                                class="text-sm text-ink-ghost"
                            >
                                —
                            </span>
                        </span>
                    </div>
                </div>
            </div>

            <!-- Position --------------------------------------------------- -->
            <div class="shrink-0 border-t border-line-soft px-3.5 pt-3 pb-3.5">
                <div class="mb-1.5 flex items-center justify-between">
                    <span class="eyebrow">Position</span>
                    <button
                        type="button"
                        class="btn btn--tiny"
                        @click="copyFen"
                    >
                        <Copy class="h-2.5 w-2.5" :stroke-width="1.6" />
                        {{ copied ? 'COPIED' : 'COPY' }}
                    </button>
                </div>
                <p
                    class="num rounded-md border border-[#171D25] bg-bg-inset px-2.5 py-2.5 text-[10.5px] leading-relaxed break-all text-[#7C8593]"
                >
                    {{ chess.viewFen }}
                </p>
            </div>
        </div>

        <PlayerClockCard
            edge="bottom"
            name="You"
            :prompt="
                chess.gamePhase === 'playing' &&
                chess.isPlayerTurn &&
                !chess.botThinking &&
                !chess.isReviewing
            "
            v-bind="chess.playerClock"
        />
    </aside>
</template>
