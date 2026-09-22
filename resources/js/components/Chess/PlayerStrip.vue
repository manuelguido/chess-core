<script setup>
/**
 * PlayerStrip — the name / captured-material row that sits above and below
 * the board. Purely presentational: BoardStage decides which side is on
 * top and hands over already-resolved values.
 *
 * Clocks live in the analysis rail's PlayerClockCard, not here.
 */
import ChessPiece from '../ChessPiece.vue';

defineProps({
    name: { type: String, required: true },
    /** Small caps label to the right of the rating, e.g. 'ENGINE · Sharp'. */
    role: { type: String, default: '' },
    rating: { type: [Number, String], default: null },
    /** Renders a knight avatar instead of initials. */
    isEngine: { type: Boolean, default: false },
    /** This side is to move — lights the avatar. */
    active: { type: Boolean, default: false },
    /** Pieces this player has captured: { color, type } entries. */
    captured: { type: Array, default: () => [] },
    /** Material lead in pawns, or null when not ahead. */
    advantage: { type: Number, default: null },
});
</script>

<template>
    <div class="flex items-center gap-3 px-0.5">
        <div
            class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border transition-[border-color,box-shadow] duration-250"
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
                YO
            </span>
        </div>

        <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-[13.5px] font-semibold">
                {{ name }}
            </span>
            <span v-if="rating !== null" class="num text-[11.5px] text-ink-dim">
                {{ rating }}
            </span>
            <span
                v-if="role"
                class="hidden border-l border-line-strong pl-2 text-[10px] tracking-[0.09em] whitespace-nowrap text-ink-fainter sm:inline"
            >
                {{ role }}
            </span>
        </div>

        <div class="ml-auto flex h-4 items-center gap-2">
            <span class="flex items-center gap-1">
                <span
                    v-for="(piece, index) in captured"
                    :key="`${piece.color}-${piece.type}-${index}`"
                    class="block h-4 w-4 opacity-70"
                >
                    <ChessPiece :color="piece.color" :type="piece.type" />
                </span>
            </span>
            <span v-if="advantage" class="num text-[11px] text-ink-soft">
                +{{ advantage }}
            </span>
        </div>
    </div>
</template>
