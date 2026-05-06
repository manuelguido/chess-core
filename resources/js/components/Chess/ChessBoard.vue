<script setup>
import {
    computed,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from "vue";
import ChessPiece from "../ChessPiece.vue";
import { useChessStore } from "../../stores/useChessStore.js";

const chess = useChessStore();

/* ============================================================
   Animation state — lives here, not in the store, because
   it depends on DOM measurements (squarePx).
   ============================================================ */
const boardEl = ref(null);
const squarePx = ref(80);
const animations = ref(new Map());
let animSeq = 0;
let animTimer = null;
let boardRO = null;

const ANIM_DURATION = 170;

const measureBoard = () => {
    if (boardEl.value) squarePx.value = boardEl.value.clientWidth / 8;
};

onMounted(() => {
    measureBoard();
    if (typeof ResizeObserver !== "undefined" && boardEl.value) {
        boardRO = new ResizeObserver(measureBoard);
        boardRO.observe(boardEl.value);
    }
});

onBeforeUnmount(() => {
    if (boardRO) boardRO.disconnect();
    if (animTimer) clearTimeout(animTimer);
});

const fileIdx = (sq) => sq.charCodeAt(0) - 97;
const rankRow = (sq) => 8 - parseInt(sq[1], 10);

const offsetFor = (from, to) => {
    const sign = boardFlipped.value ? -1 : 1;
    return {
        dx: sign * (fileIdx(from) - fileIdx(to)) * squarePx.value,
        dy: sign * (rankRow(from) - rankRow(to)) * squarePx.value,
    };
};

const scheduleAnimation = (move) => {
    const next = new Map();
    const { dx, dy } = offsetFor(move.from, move.to);
    next.set(move.to, { dx, dy, id: ++animSeq });

    // Castling: animate the rook leg too
    if (move.flags && (move.flags.includes("k") || move.flags.includes("q"))) {
        const rank = move.color === "w" ? "1" : "8";
        const isKingside = move.flags.includes("k");
        const rookFrom = (isKingside ? "h" : "a") + rank;
        const rookTo = (isKingside ? "f" : "d") + rank;
        const r = offsetFor(rookFrom, rookTo);
        next.set(rookTo, { dx: r.dx, dy: r.dy, id: ++animSeq });
    }

    animations.value = next;

    if (animTimer) clearTimeout(animTimer);
    animTimer = setTimeout(() => {
        animations.value = new Map();
        animTimer = null;
    }, ANIM_DURATION + 30);
};

/** Trigger animation whenever the store registers a new move. */
watch(
    () => chess.lastPlayedMove,
    (move) => {
        if (move) scheduleAnimation(move);
    },
);

/* ============================================================
   Board perspective
   ============================================================ */
const boardFlipped = computed(() => chess.playerColor === "b");

/**
 * Reversing the 64 display tiles puts rank 1 at the top and file h
 * on the left — i.e. black's perspective. The underlying square
 * names ("e4", etc.) are unchanged, so all game logic still works.
 */
const displayTiles = computed(() =>
    boardFlipped.value
        ? [...chess.flattenedBoard].reverse()
        : chess.flattenedBoard,
);

/* ============================================================
   Tile styling
   ============================================================ */
const tileClasses = (tile) => {
    const isSelected = !chess.isReviewing && chess.selectedSquare === tile.square;
    const isTarget = !chess.isReviewing && chess.legalTargetSet.has(tile.square);
    const isLast =
        chess.viewLastMove &&
        (chess.viewLastMove.from === tile.square ||
            chess.viewLastMove.to === tile.square);

    return [
        "square",
        tile.dark ? "square--dark" : "square--light",
        isSelected && "square--selected",
        isTarget && "square--target",
        isTarget && tile.piece && "square--has-piece",
        isLast && "square--last",
        chess.kingInCheckSquare === tile.square && "square--check",
    ];
};
</script>

<template>
    <div class="board-frame w-full max-w-180">
        <div
            ref="boardEl"
            class="board"
            role="grid"
            aria-label="Chess board"
        >
            <button
                v-for="tile in displayTiles"
                :key="tile.square"
                type="button"
                role="gridcell"
                :aria-label="`${tile.square} ${tile.piece ? (tile.piece.color === 'w' ? 'white' : 'black') + ' ' + tile.piece.type : 'empty'}`"
                :class="tileClasses(tile)"
                @click="chess.selectSquare(tile)"
            >
                <ChessPiece
                    v-if="tile.piece"
                    :key="animations.get(tile.square)?.id ?? 0"
                    :class="[
                        'piece',
                        animations.has(tile.square) && 'piece--moving',
                    ]"
                    :style="
                        animations.get(tile.square)
                            ? {
                                  '--mv-x': animations.get(tile.square).dx + 'px',
                                  '--mv-y': animations.get(tile.square).dy + 'px',
                              }
                            : null
                    "
                    :color="tile.piece.color"
                    :type="tile.piece.type"
                />
                <span
                    v-if="boardFlipped ? tile.fileIndex === 7 : tile.fileIndex === 0"
                    class="coord coord--rank"
                >
                    {{ tile.square[1] }}
                </span>
                <span
                    v-if="boardFlipped ? tile.rowIndex === 0 : tile.rowIndex === 7"
                    class="coord coord--file"
                >
                    {{ tile.square[0] }}
                </span>
            </button>
        </div>
    </div>
</template>
