<script setup>
/**
 * ChessPiece — a single, scalable, vector chess piece.
 *
 * Design notes:
 *   • Silhouettes derive from the open-source "cburnett" Staunton set
 *     used by Lichess (GPL-2.0+). They are widely accepted as the
 *     gold-standard modern Staunton representation.
 *   • Each piece reads instantly from across the board:
 *       - white pieces: clean porcelain fill with navy outline
 *       - black pieces: deep marine fill with darker navy stroke
 *     Both give excellent contrast on the steel-blue board squares.
 *   • Stroke widths are tuned for crisp 64–96 px rendering.
 */
import { computed } from 'vue';

const props = defineProps({
    /** 'w' | 'b' */
    color: { type: String, required: true },
    /** 'p' | 'n' | 'b' | 'r' | 'q' | 'k' */
    type: { type: String, required: true },
});

const isWhite = computed(() => props.color === 'w');

const fill = computed(() => (isWhite.value ? '#fbfbf8' : '#123847'));
const stroke = computed(() => (isWhite.value ? '#10242c' : '#071d27'));
/* Subtle inner highlight strokes used for engraved details */
const detail = computed(() => (isWhite.value ? '#10242c' : '#607984'));

const label = computed(() => {
    const names = {
        p: 'pawn',
        n: 'knight',
        b: 'bishop',
        r: 'rook',
        q: 'queen',
        k: 'king',
    };
    return `${isWhite.value ? 'White' : 'Black'} ${names[props.type] ?? props.type}`;
});
</script>

<template>
    <!--
        viewBox 45×45 — the standard chess SVG canvas used by all major
        open-source piece sets. Pieces share consistent baseline & scale.
    -->
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 45 45"
        :aria-label="label"
        role="img"
    >
        <!-- ============ PAWN ============ -->
        <template v-if="type === 'p'">
            <path
                d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
                :fill="fill"
                :stroke="stroke"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </template>

        <!-- ============ KNIGHT ============ -->
        <template v-if="type === 'n'">
            <g
                :fill="fill"
                :stroke="stroke"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
                <path
                    d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"
                />
            </g>
            <!-- eye -->
            <path
                d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z"
                :fill="stroke"
                :stroke="stroke"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
            <!-- mane -->
            <path
                d="M14.933 15.75c.305.382.426.823.69 1.207.265.385.622.71 1.077.92"
                :fill="fill"
                :stroke="stroke"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </template>

        <!-- ============ BISHOP ============ -->
        <template v-if="type === 'b'">
            <g
                :fill="fill"
                :stroke="stroke"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path
                    d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"
                />
                <path
                    d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"
                />
                <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
            </g>
            <path
                d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5"
                :stroke="detail"
                stroke-width="1.5"
                stroke-linejoin="miter"
                fill="none"
            />
        </template>

        <!-- ============ ROOK ============ -->
        <template v-if="type === 'r'">
            <g
                :fill="fill"
                :stroke="stroke"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path
                    d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z"
                />
                <path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" />
                <path d="M14 16.5L11 14h23l-3 2.5H14z" stroke-linecap="butt" />
                <path
                    d="M11 14V9h4v2h5V9h5v2h5V9h4v5H11z"
                    stroke-linecap="butt"
                />
            </g>
            <path
                d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23"
                fill="none"
                :stroke="detail"
                stroke-width="1"
                stroke-linejoin="miter"
            />
        </template>

        <!-- ============ QUEEN ============ -->
        <template v-if="type === 'q'">
            <g
                :fill="fill"
                :stroke="stroke"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <!--
                    Five-point Staunton crown — explicit 5 tips (right→left):
                       (38,14)  (30.7,10.9)  (22.5,10)  (14.3,10.9)  (7,14)
                    with valleys between each. The previous condensed form
                    was missing two segments which dropped the left-outer
                    spike; this version restores full symmetry.
                -->
                <path
                    d="M9 26C17.5 24.5 30 24.5 36 26L38 14L31 25L30.7 10.9L25.5 24.5L22.5 10L19.5 24.5L14.3 10.9L14 25L7 14Z"
                />
                <!-- Crown base + body -->
                <path
                    d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1 2.5-1 2.5-1.5 1.5 0 2.5 0 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"
                />
                <!-- Base bands -->
                <path
                    d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"
                    stroke-linecap="butt"
                    fill="none"
                />
            </g>
            <!-- Crown jewels — five, aligned to the spike tips above -->
            <g :fill="fill" :stroke="stroke" stroke-width="1.5">
                <circle cx="7" cy="14" r="2" />
                <circle cx="14.3" cy="10.9" r="2" />
                <circle cx="22.5" cy="10" r="2" />
                <circle cx="30.7" cy="10.9" r="2" />
                <circle cx="38" cy="14" r="2" />
            </g>
        </template>

        <!-- ============ KING ============ -->
        <template v-if="type === 'k'">
            <g
                :fill="fill"
                :stroke="stroke"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <!-- cross -->
                <path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter" />
                <!-- crown body -->
                <path
                    d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
                    fill="none"
                />
                <!-- robe -->
                <path
                    d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4v5-5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"
                />
            </g>
            <!-- robe creases -->
            <path
                d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"
                fill="none"
                :stroke="detail"
                stroke-width="1"
                stroke-linejoin="round"
            />
        </template>
    </svg>
</template>
