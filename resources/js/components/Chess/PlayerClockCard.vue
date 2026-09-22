<script setup>
/**
 * PlayerClockCard — a compact clock placed beside its player at the board.
 */
import { computed } from 'vue';

const props = defineProps({
    name: { type: String, required: true },
    /** This side is on the clock. */
    active: { type: Boolean, default: false },
    low: { type: Boolean, default: false },
    seconds: { type: Number, default: null },
    /** Fraction of the starting time remaining, 0-1. */
    fraction: { type: Number, default: 1 },
    thinking: { type: Boolean, default: false },
    prompt: { type: Boolean, default: false },
});

const clockText = computed(() => {
    if (props.seconds == null) return '∞';
    const m = Math.floor(props.seconds / 60);
    const s = String(props.seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
});

const barWidth = computed(
    () => `${Math.max(0, Math.min(100, props.fraction * 100))}%`,
);
</script>

<template>
    <div
        class="player-card"
        role="timer"
        aria-live="off"
        :aria-label="`${name} time remaining`"
        :title="thinking ? 'Thinking' : prompt ? 'Your move' : undefined"
        :data-active="active"
        :data-low="low"
    >
        <div class="player-card__clock">
            {{ clockText }}
        </div>

        <div
            class="player-card__bar"
            :style="{ width: barWidth }"
            aria-hidden="true"
        />
    </div>
</template>
