<script setup>
/**
 * PlayerClockCard — the large clock card that bookends the analysis rail.
 *
 * Unlike the board strips, these do not follow board orientation: the
 * engine is always the top card and you are always the bottom one, so
 * flipping the board never moves your own clock.
 */
import { computed } from 'vue';
import ChessPiece from '../ChessPiece.vue';

const props = defineProps({
    name: { type: String, required: true },
    rating: { type: [Number, String], default: null },
    /** Renders a knight avatar instead of initials. */
    isEngine: { type: Boolean, default: false },
    /** This side is on the clock. */
    active: { type: Boolean, default: false },
    low: { type: Boolean, default: false },
    seconds: { type: Number, default: null },
    /** Fraction of the starting time remaining, 0-1. */
    fraction: { type: Number, default: 1 },
    thinking: { type: Boolean, default: false },
    prompt: { type: Boolean, default: false },
    /** 'top' draws its hairline below, 'bottom' above. */
    edge: { type: String, default: 'top' },
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
        :class="
            edge === 'top' ? 'border-b border-line' : 'border-t border-line'
        "
        :data-active="active"
        :data-low="low"
    >
        <div
            class="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border transition-[border-color,box-shadow] duration-250"
            :class="[
                isEngine ? 'bg-bg-raised' : 'bg-bg-strong',
                active
                    ? 'border-accent-edge shadow-[0_0_0_3px_var(--color-accent-wash)]'
                    : 'border-line-strong',
            ]"
        >
            <ChessPiece
                v-if="isEngine"
                class="h-5 w-5 opacity-70"
                color="b"
                type="n"
            />
            <span v-else class="text-xs font-semibold text-ink-muted">YO</span>
        </div>

        <div class="flex min-w-0 flex-col gap-[3px]">
            <span class="truncate text-[13px] leading-none font-semibold">
                {{ name }}
            </span>
            <span
                v-if="rating !== null"
                class="num text-[11px] leading-none text-ink-dim"
            >
                {{ rating }} ELO
            </span>
            <span
                v-if="thinking"
                class="animate-tick text-[9.5px] leading-none tracking-[0.12em] text-accent"
            >
                THINKING
            </span>
            <span
                v-else-if="prompt"
                class="animate-rise mt-0.5 self-start rounded-md border border-accent-edge bg-accent-wash px-1.5 py-1 text-[10px] leading-none font-semibold tracking-[0.12em] text-accent"
            >
                YOUR MOVE
            </span>
        </div>

        <div class="player-card__clock ml-auto text-right">
            {{ clockText }}
        </div>

        <div class="player-card__bar" :style="{ width: barWidth }" />
    </div>
</template>
