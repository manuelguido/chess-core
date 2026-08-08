<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ChessPiece from '../ChessPiece.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

/* ============================================================
   Animation state — lives here, not in the store, because
   it depends on DOM measurements (squarePx).
   ============================================================ */
const boardEl = ref(null);
const squarePx = ref(80);
const animations = ref(new Map());
/** Square that just lost a piece — drives the capture ring flash. */
const captureFlash = ref(null);
let animSeq = 0;
let animTimer = null;
let flashTimer = null;
let boardRO = null;

const ANIM_DURATION = 200;
const FLASH_DURATION = 420;

const measureBoard = () => {
    if (boardEl.value) squarePx.value = boardEl.value.clientWidth / 8;
};

onMounted(() => {
    measureBoard();
    if (typeof ResizeObserver !== 'undefined' && boardEl.value) {
        boardRO = new ResizeObserver(measureBoard);
        boardRO.observe(boardEl.value);
    }
});

onBeforeUnmount(() => {
    if (boardRO) boardRO.disconnect();
    if (animTimer) clearTimeout(animTimer);
    if (flashTimer) clearTimeout(flashTimer);
});

const fileIdx = (sq) => sq.charCodeAt(0) - 97;
const rankRow = (sq) => 8 - parseInt(sq[1], 10);

const offsetFor = (from, to) => {
    const sign = chess.boardFlipped ? -1 : 1;
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
    if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) {
        const rank = move.color === 'w' ? '1' : '8';
        const isKingside = move.flags.includes('k');
        const rookFrom = (isKingside ? 'h' : 'a') + rank;
        const rookTo = (isKingside ? 'f' : 'd') + rank;
        const r = offsetFor(rookFrom, rookTo);
        next.set(rookTo, { dx: r.dx, dy: r.dy, id: ++animSeq });
    }

    animations.value = next;

    if (animTimer) clearTimeout(animTimer);
    animTimer = setTimeout(() => {
        animations.value = new Map();
        animTimer = null;
    }, ANIM_DURATION + 30);

    // A capture (or en passant) pops a ring on the square being taken.
    if (move.flags && /[ce]/.test(move.flags)) {
        captureFlash.value = move.to;
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => {
            captureFlash.value = null;
            flashTimer = null;
        }, FLASH_DURATION);
    }
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

/**
 * Reversing the 64 display tiles puts rank 1 at the top and file h
 * on the left — i.e. black's perspective. The underlying square
 * names ("e4", etc.) are unchanged, so all game logic still works.
 */
const displayTiles = computed(() =>
    chess.boardFlipped
        ? [...chess.flattenedBoard].reverse()
        : chess.flattenedBoard,
);

/* ============================================================
   Tile state
   ============================================================ */
const isSelected = (tile) =>
    !chess.isReviewing && chess.selectedSquare === tile.square;

const isTarget = (tile) =>
    !chess.isReviewing && chess.legalTargetSet.has(tile.square);

const isLastMove = (tile) =>
    !!chess.viewLastMove &&
    (chess.viewLastMove.from === tile.square ||
        chess.viewLastMove.to === tile.square);

const isCheckSquare = (tile) => chess.kingInCheckSquare === tile.square;

/** Only your own pieces and legal destinations invite a click. */
const isPlayable = (tile) =>
    chess.gamePhase === 'playing' &&
    !chess.isReviewing &&
    chess.isPlayerTurn &&
    !chess.botThinking &&
    (tile.piece?.color === chess.playerColor || isTarget(tile));

const showRank = (tile) =>
    chess.showCoords &&
    (chess.boardFlipped ? tile.fileIndex === 7 : tile.fileIndex === 0);

const showFile = (tile) =>
    chess.showCoords &&
    (chess.boardFlipped ? tile.rowIndex === 0 : tile.rowIndex === 7);

const motionStyle = (tile) => {
    const anim = animations.value.get(tile.square);
    if (!anim) return null;
    return { '--mv-x': `${anim.dx}px`, '--mv-y': `${anim.dy}px` };
};
</script>

<template>
    <div
        ref="boardEl"
        class="board w-full xl:h-full xl:w-auto"
        role="grid"
        aria-label="Chess board"
    >
        <button
            v-for="tile in displayTiles"
            :key="tile.square"
            type="button"
            role="gridcell"
            :aria-label="`${tile.square} ${tile.piece ? (tile.piece.color === 'w' ? 'white' : 'black') + ' ' + tile.piece.type : 'empty'}`"
            :class="[
                'square',
                tile.dark ? 'square--dark' : 'square--light',
                isPlayable(tile) && 'square--playable',
            ]"
            @click="chess.selectSquare(tile)"
        >
            <span
                v-if="isCheckSquare(tile)"
                :class="[
                    'square__wash square__wash--check',
                    chess.isCheckmate && 'square__wash--mate',
                ]"
            />
            <span
                v-else-if="isSelected(tile)"
                class="square__wash square__wash--selected"
            />
            <span
                v-else-if="isLastMove(tile)"
                class="square__wash square__wash--last"
            />

            <span v-if="captureFlash === tile.square" class="square__flash" />

            <ChessPiece
                v-if="tile.piece"
                :key="animations.get(tile.square)?.id ?? 0"
                :class="[
                    'piece',
                    animations.has(tile.square) && 'piece--moving',
                ]"
                :style="motionStyle(tile)"
                :color="tile.piece.color"
                :type="tile.piece.type"
            />

            <span
                v-if="isTarget(tile)"
                :class="tile.piece ? 'square__ring' : 'square__dot'"
            />

            <span v-if="showRank(tile)" class="coord coord--rank">
                {{ tile.square[1] }}
            </span>
            <span v-if="showFile(tile)" class="coord coord--file">
                {{ tile.square[0] }}
            </span>
        </button>
    </div>
</template>
