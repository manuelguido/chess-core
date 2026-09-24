<script setup>
/** Compact game details, beside the board and shared clock stack. */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Copy,
    ListOrdered,
} from 'lucide-vue-next';
import ChessPiece from '../ChessPiece.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();
const TABS = [
    { key: 'moves', label: 'Moves' },
    { key: 'captured', label: 'Captured' },
    { key: 'position', label: 'Position' },
];
const tab = ref('moves');
const moveListEl = ref(null);
const copied = ref(false);
let copyTimer = null;

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
    if (balance === 0) return 'Even';
    return balance > 0 ? `+${balance} W` : `+${Math.abs(balance)} B`;
});
const capturedGroups = computed(() => [
    { label: 'White lost', color: 'w', list: chess.capturedWhite },
    { label: 'Black lost', color: 'b', list: chess.capturedBlack },
]);
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
        // The position remains selectable if clipboard access is unavailable.
    }
};

/** Keep both the latest move and a selected historical move in view. */
watch(
    [() => chess.fullHistory.length, () => chess.viewCursor, tab],
    async () => {
        if (tab.value !== 'moves') return;
        await nextTick();
        const list = moveListEl.value;
        if (!list) return;
        if (chess.viewCursor === null) {
            list.scrollTop = list.scrollHeight;
            return;
        }
        if (chess.viewCursor < 0) {
            list.scrollTop = 0;
            return;
        }
        const selected = list.querySelector('[data-viewing="true"]');
        if (!selected) return;
        const top = selected.offsetTop;
        const bottom = top + selected.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight)
            list.scrollTop = bottom - list.clientHeight;
    },
);
onUnmounted(() => {
    if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
    <section class="game-details" aria-label="Game details">
        <div class="details-tabs" role="group" aria-label="Show game details">
            <button
                v-for="item in TABS"
                :key="item.key"
                type="button"
                class="details-tab"
                :aria-pressed="tab === item.key"
                :aria-controls="`game-${item.key}`"
                @click="tab = item.key"
            >
                {{ item.label }}
            </button>
        </div>
        <dl class="details-summary">
            <div title="Estimated position advantage, from White's perspective">
                <dt>Evaluation</dt>
                <dd>{{ evalText }}</dd>
            </div>
            <div>
                <dt>Material</dt>
                <dd>{{ materialText }}</dd>
            </div>
            <div>
                <dt>Move</dt>
                <dd>{{ chess.currentMoveNumber }}</dd>
            </div>
        </dl>
        <div
            v-show="tab === 'moves'"
            id="game-moves"
            class="details-content"
            role="region"
            aria-label="Move history"
        >
            <div class="opening-line">
                <span class="opening-code">{{ chess.opening.eco }}</span>
                <span class="opening-name" :title="chess.opening.name">{{
                    chess.opening.name
                }}</span>
            </div>
            <div ref="moveListEl" class="move-list">
                <div v-if="chess.movePairs.length === 0" class="details-empty">
                    <ListOrdered
                        :size="24"
                        :stroke-width="1.5"
                        aria-hidden="true"
                    />
                    <strong>Your game starts here</strong>
                    <p>
                        Choose your settings, then press Start or make your
                        first move.
                    </p>
                </div>
                <div
                    v-for="pair in chess.movePairs"
                    :key="pair.number"
                    class="move-row"
                >
                    <div class="move-row__n">{{ pair.number }}.</div>
                    <button
                        type="button"
                        class="move-cell"
                        :disabled="pair.whiteIdx === null"
                        :aria-label="`Move ${pair.number}, White: ${pair.white || 'no move'}`"
                        :aria-current="
                            isCurrent(pair.whiteIdx) || isViewing(pair.whiteIdx)
                                ? 'step'
                                : undefined
                        "
                        :data-current="isCurrent(pair.whiteIdx)"
                        :data-viewing="isViewing(pair.whiteIdx)"
                        @click="
                            pair.whiteIdx !== null && chess.goTo(pair.whiteIdx)
                        "
                    >
                        {{ pair.white || '—' }}
                    </button>
                    <button
                        type="button"
                        class="move-cell"
                        :disabled="pair.blackIdx === null"
                        :aria-label="`Move ${pair.number}, Black: ${pair.black || 'no move'}`"
                        :aria-current="
                            isCurrent(pair.blackIdx) || isViewing(pair.blackIdx)
                                ? 'step'
                                : undefined
                        "
                        :data-current="isCurrent(pair.blackIdx)"
                        :data-viewing="isViewing(pair.blackIdx)"
                        @click="
                            pair.blackIdx !== null && chess.goTo(pair.blackIdx)
                        "
                    >
                        {{ pair.black || '—' }}
                    </button>
                </div>
            </div>
            <nav class="move-nav" aria-label="Browse moves">
                <button
                    type="button"
                    :disabled="atStart"
                    aria-label="Go to start"
                    title="Go to start"
                    @click="chess.goToStart()"
                >
                    <ChevronsLeft :size="19" :stroke-width="1.7" />
                </button>
                <button
                    type="button"
                    :disabled="atStart"
                    aria-label="Previous move"
                    title="Previous move"
                    @click="chess.goBack()"
                >
                    <ChevronLeft :size="19" :stroke-width="1.7" />
                </button>
                <button
                    type="button"
                    :disabled="atLive"
                    aria-label="Next move"
                    title="Next move"
                    @click="chess.goForward()"
                >
                    <ChevronRight :size="19" :stroke-width="1.7" />
                </button>
                <button
                    type="button"
                    :disabled="atLive"
                    aria-label="Return to live position"
                    title="Return to live position"
                    @click="chess.returnToLive()"
                >
                    <ChevronsRight :size="19" :stroke-width="1.7" />
                </button>
            </nav>
        </div>
        <div
            v-show="tab === 'captured'"
            id="game-captured"
            class="details-content details-content--padded"
            role="region"
            aria-label="Captured pieces"
        >
            <p class="details-intro">Keep track of the pieces off the board.</p>
            <div
                v-for="group in capturedGroups"
                :key="group.color"
                class="capture-group"
            >
                <div class="capture-heading">
                    <span>{{ group.label }}</span
                    ><span class="capture-count">{{ group.list.length }}</span>
                </div>
                <div class="capture-pieces">
                    <ChessPiece
                        v-for="(type, index) in group.list"
                        :key="`${group.color}-${type}-${index}`"
                        :color="group.color"
                        :type="type"
                    />
                    <span v-if="group.list.length === 0" class="capture-none"
                        >No pieces captured</span
                    >
                </div>
            </div>
        </div>
        <div
            v-show="tab === 'position'"
            id="game-position"
            class="details-content details-content--padded"
            role="region"
            aria-label="Current board position"
        >
            <div class="position-heading">
                <strong>Board position</strong>
                <button type="button" class="copy-position" @click="copyFen">
                    <component
                        :is="copied ? Check : Copy"
                        :size="14"
                        :stroke-width="1.7"
                        aria-hidden="true"
                    />
                    <span aria-live="polite">{{
                        copied ? 'Copied' : 'Copy FEN'
                    }}</span>
                </button>
            </div>
            <p class="details-intro">
                Save or share the position currently on your board.
            </p>
            <p class="position-fen">{{ chess.viewFen }}</p>
            <p v-if="chess.isReviewing" class="position-note">
                Showing the position selected in move history.
            </p>
        </div>
    </section>
</template>

<style scoped>
.game-details {
    flex-shrink: 0;
    overflow: hidden;
    border: 1px solid var(--color-line-strong);
    border-radius: 10px;
    background: var(--color-bg-panel);
}
.details-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 6px;
    border-bottom: 1px solid var(--color-line);
}
.details-tab {
    min-height: 36px;
    border-radius: 6px;
    color: var(--color-ink-soft);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition:
        color 150ms,
        background-color 150ms;
}
.details-tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-ink);
}
.details-tab[aria-pressed='true'] {
    background: var(--color-bg-strong);
    color: var(--color-accent-hover);
}
.details-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 12px 0;
    border-bottom: 1px solid var(--color-line);
}
.details-summary > div {
    padding: 0 15px;
}
.details-summary > div + div {
    border-left: 1px solid var(--color-line-strong);
}
.details-summary dt {
    color: var(--color-ink-soft);
    font-size: 11px;
    line-height: 1.4;
}
.details-summary dd {
    margin-top: 4px;
    color: var(--color-ink);
    font-size: 17px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
}
.details-content {
    height: 292px;
}
.opening-line {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 40px;
    padding: 0 14px;
    border-bottom: 1px solid var(--color-line-soft);
}
.opening-code {
    flex-shrink: 0;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--color-accent-wash);
    color: var(--color-accent);
    font-size: 11px;
    font-weight: 600;
}
.opening-name {
    overflow: hidden;
    color: var(--color-ink-muted);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.move-list {
    position: relative;
    height: 210px;
    overflow-y: auto;
    overscroll-behavior: contain;
}
.details-empty {
    display: flex;
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px 24px;
    text-align: center;
}
.details-empty > svg {
    margin-bottom: 12px;
    color: var(--color-accent);
    opacity: 0.75;
}
.details-empty strong {
    color: var(--color-ink-mild);
    font-size: 15px;
    font-weight: 500;
}
.details-empty p {
    max-width: 245px;
    margin-top: 7px;
    color: var(--color-ink-soft);
    font-size: 13px;
    line-height: 1.6;
}
.move-row {
    grid-template-columns: 46px 1fr 1fr;
}
.move-row__n {
    color: var(--color-ink-dim);
    font-size: 12px;
}
.move-cell {
    min-height: 38px;
    padding: 7px 14px;
    font-size: 16px;
}
.move-cell[data-current='true'] {
    background: var(--color-accent-wash);
    font-weight: 600;
}
.move-cell[data-viewing='true'] {
    box-shadow: inset 0 -2px 0 var(--color-accent);
    color: var(--color-ink-bright);
}
.move-cell:focus-visible {
    outline-offset: -3px;
}
.move-nav {
    height: 42px;
    border-bottom: 0;
}
.move-nav button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}
.move-nav button:focus-visible {
    outline-offset: -4px;
}
.details-content--padded {
    overflow-y: auto;
    padding: 17px 15px;
}
.details-intro {
    margin: 0 0 16px;
    color: var(--color-ink-soft);
    font-size: 13px;
    line-height: 1.6;
}
.capture-group + .capture-group {
    margin-top: 16px;
}
.capture-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-ink-mild);
    font-size: 14px;
}
.capture-count {
    display: inline-flex;
    min-width: 21px;
    height: 21px;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: var(--color-bg-strong);
    color: var(--color-ink-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}
.capture-pieces {
    display: flex;
    min-height: 39px;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    margin-top: 7px;
    padding: 6px 8px;
    border: 1px solid var(--color-line-soft);
    border-radius: 6px;
    background: var(--color-bg-inset);
}
.capture-pieces > svg {
    width: 26px;
    height: 26px;
}
.capture-none {
    color: var(--color-ink-dim);
    font-size: 12px;
}
.position-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
}
.position-heading strong {
    font-size: 14px;
    font-weight: 500;
}
.copy-position {
    display: flex;
    min-height: 30px;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid var(--color-line-strong);
    border-radius: 5px;
    color: var(--color-ink-mild);
    font-size: 12px;
    cursor: pointer;
}
.copy-position:hover {
    background: var(--color-bg-hover);
    color: var(--color-ink-bright);
}
.position-fen {
    border: 1px solid var(--color-line-strong);
    border-radius: 6px;
    background: var(--color-bg-inset);
    padding: 12px;
    color: var(--color-ink-muted);
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.7;
    overflow-wrap: anywhere;
    user-select: text;
}
.position-note {
    margin-top: 10px;
    color: var(--color-accent);
    font-size: 12px;
    line-height: 1.6;
}

@media (min-width: 1280px) and (max-height: 820px) {
    .details-content {
        height: 224px;
    }
    .move-list {
        height: 142px;
    }
    .details-empty {
        padding: 12px 20px;
    }
    .details-empty > svg {
        display: none;
    }
}
</style>
