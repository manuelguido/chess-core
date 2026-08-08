<script setup>
/**
 * PlayerStrip — the name / captured-material / clock row that sits above
 * and below the board. Purely presentational: BoardStage decides which
 * side is on top and hands over already-resolved values.
 */
import { computed } from 'vue';
import ChessPiece from '../ChessPiece.vue';

const props = defineProps({
    name: { type: String, required: true },
    /** Small caps label to the right of the rating, e.g. 'ENGINE · LV 3'. */
    role: { type: String, default: '' },
    rating: { type: [Number, String], default: null },
    /** Renders a knight avatar instead of initials. */
    isEngine: { type: Boolean, default: false },
    /** This side is to move — lights the avatar and the clock. */
    active: { type: Boolean, default: false },
    thinking: { type: Boolean, default: false },
    prompt: { type: Boolean, default: false },
    /** Pieces this player has captured: { color, type } entries. */
    captured: { type: Array, default: () => [] },
    /** Material lead in pawns, or null when not ahead. */
    advantage: { type: Number, default: null },
    seconds: { type: Number, default: null },
    low: { type: Boolean, default: false },
    /** Fraction of the starting time remaining, 0-1. */
    clockFraction: { type: Number, default: 1 },
});

const initials = computed(() =>
    props.name.slice(0, 2).toUpperCase().padEnd(2, ' ').trim(),
);

const clockText = computed(() => {
    if (props.seconds == null) return '∞';
    const m = Math.floor(props.seconds / 60);
    const s = String(props.seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
});

const barWidth = computed(
    () => `${Math.max(0, Math.min(100, props.clockFraction * 100))}%`,
);
</script>

<template>
    <div class="flex items-center gap-3 px-0.5">
        <div
            class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border transition-[border-color,box-shadow] duration-250"
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
            <span
                v-else
                class="text-[11px] font-semibold text-ink-muted"
                aria-hidden="true"
            >
                {{ initials }}
            </span>
        </div>

        <div class="min-w-0">
            <div class="flex items-center gap-2">
                <span class="truncate text-[13.5px] font-semibold">
                    {{ name }}
                </span>
                <span
                    v-if="rating !== null"
                    class="num text-[11.5px] text-ink-dim"
                >
                    {{ rating }}
                </span>
                <span
                    v-if="role"
                    class="hidden border-l border-line-strong pl-2 text-[10px] tracking-[0.09em] text-ink-fainter sm:inline"
                >
                    {{ role }}
                </span>
            </div>

            <div class="mt-0.5 flex h-3.5 items-center gap-1">
                <span
                    v-for="(piece, index) in captured"
                    :key="`${piece.color}-${piece.type}-${index}`"
                    class="block h-3.5 w-3.5 opacity-70"
                >
                    <ChessPiece :color="piece.color" :type="piece.type" />
                </span>
                <span
                    v-if="advantage"
                    class="num ml-1 text-[10.5px] text-ink-soft"
                >
                    +{{ advantage }}
                </span>
            </div>
        </div>

        <div class="ml-auto flex items-center gap-2.5">
            <span
                v-if="thinking"
                class="animate-tick text-[10.5px] tracking-[0.12em] text-accent"
            >
                THINKING
            </span>
            <span
                v-else-if="prompt"
                class="animate-rise rounded-md border border-accent-edge bg-accent-wash px-2 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-accent"
            >
                YOUR MOVE
            </span>

            <div class="clock" :data-active="active" :data-low="low">
                <span class="clock__value">{{ clockText }}</span>
                <span class="clock__bar" :style="{ width: barWidth }" />
            </div>
        </div>
    </div>
</template>
