<script setup>
import { computed } from 'vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

const format = (seconds) => {
    if (seconds == null) return '∞';
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
};

/**
 * Which color is "on top" (opponent) vs "on bottom" (player).
 * When player is white, opponent is black → top.
 * When player is black (board flipped), opponent is white → top.
 */
const topColor = computed(() => (chess.playerColor === 'w' ? 'b' : 'w'));
const botColor = computed(() => chess.playerColor);

const topLabel = computed(() => (topColor.value === 'w' ? 'White' : 'Black'));
const botLabel = computed(() => (botColor.value === 'w' ? 'White' : 'Black'));

const topSecs = computed(() => chess.clocks[topColor.value]);
const botSecs = computed(() => chess.clocks[botColor.value]);

const isTopTurn = computed(
    () =>
        chess.gamePhase === 'playing' &&
        chess.game?.turn?.() === topColor.value,
);
const isBotTurn = computed(
    () =>
        chess.gamePhase === 'playing' &&
        chess.game?.turn?.() === botColor.value,
);

const isLow = (secs) => secs != null && secs <= 30;
</script>

<template>
    <div
        v-if="chess.timeControl && chess.gamePhase !== 'lobby'"
        class="board-size flex flex-col gap-2"
    >
        <div
            class="flex items-center justify-between rounded-full border px-4 py-2 transition-colors duration-300"
            :class="[
                isTopTurn
                    ? 'border-navy-950 bg-navy-950 text-white'
                    : 'border-line-soft bg-bg-surface',
                isLow(topSecs) && isTopTurn && 'border-negative',
            ]"
        >
            <span
                class="text-xs font-bold uppercase"
                :class="isTopTurn ? 'text-white/70' : 'text-ink-muted'"
            >
                {{ topLabel }}
            </span>
            <span
                class="num text-lg font-semibold tabular-nums"
                :class="
                    isLow(topSecs) && isTopTurn
                        ? 'text-negative'
                        : isTopTurn
                          ? 'text-white'
                          : 'text-navy-950'
                "
            >
                {{ format(topSecs) }}
            </span>
        </div>

        <div
            class="flex items-center justify-between rounded-full border px-4 py-2 transition-colors duration-300"
            :class="[
                isBotTurn
                    ? 'border-navy-950 bg-navy-950 text-white'
                    : 'border-line-soft bg-bg-surface',
                isLow(botSecs) && isBotTurn && 'border-negative',
            ]"
        >
            <span
                class="text-xs font-bold uppercase"
                :class="isBotTurn ? 'text-white/70' : 'text-ink-muted'"
            >
                {{ botLabel }} (You)
            </span>
            <span
                class="num text-lg font-semibold tabular-nums"
                :class="
                    isLow(botSecs) && isBotTurn
                        ? 'text-negative'
                        : isBotTurn
                          ? 'text-white'
                          : 'text-navy-950'
                "
            >
                {{ format(botSecs) }}
            </span>
        </div>
    </div>
</template>
