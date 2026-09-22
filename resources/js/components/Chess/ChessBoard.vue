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
/**
 * Set just before a drag commits its move. A dragged piece is already under
 * the cursor at the destination, so sliding it in from the origin would make
 * it visibly jump back first. The capture flash still plays.
 */
let skipNextSlide = false;

const ANIM_DURATION = 200;
const FLASH_DURATION = 420;

const measureBoard = () => {
    if (boardEl.value) squarePx.value = boardEl.value.clientWidth / 8;
};

const onKeydown = (event) => {
    if (event.key !== 'Escape') return;
    chess.clearPremove();
    chess.clearSelection();
};

onMounted(() => {
    measureBoard();
    if (typeof ResizeObserver !== 'undefined' && boardEl.value) {
        boardRO = new ResizeObserver(measureBoard);
        boardRO.observe(boardEl.value);
    }
    window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
    if (boardRO) boardRO.disconnect();
    if (animTimer) clearTimeout(animTimer);
    if (flashTimer) clearTimeout(flashTimer);
    removeDragListeners();
    window.removeEventListener('keydown', onKeydown);
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

const scheduleAnimation = (move, { slide = true } = {}) => {
    if (slide) {
        const next = new Map();
        const { dx, dy } = offsetFor(move.from, move.to);
        next.set(move.to, { dx, dy, id: ++animSeq });

        // Castling: animate the rook leg too
        if (
            move.flags &&
            (move.flags.includes('k') || move.flags.includes('q'))
        ) {
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
    }

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
        if (!move) return;
        const slide = !skipNextSlide;
        skipNextSlide = false;
        scheduleAnimation(move, { slide });
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

/**
 * A piece you can pick up: to move now, or — while the engine is on move —
 * to queue a premove. The store decides which of the two a drop becomes.
 */
const canPickUp = (tile) =>
    !!tile.piece &&
    !chess.isReviewing &&
    ((chess.gamePhase === 'playing' &&
        tile.piece.color === chess.playerColor) ||
        (chess.canStartByMoving && tile.piece.color === 'w'));

const isPremoveSquare = (tile) =>
    !!chess.premove &&
    (chess.premove.from === tile.square || chess.premove.to === tile.square);

/**
 * Only your own pieces and legal destinations invite a click — plus, in the
 * lobby, White's pieces, since picking one up starts the session.
 */
const isPlayable = (tile) => canPickUp(tile) || isTarget(tile);

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

/* ============================================================
   Drag and drop

   Pointer events (not HTML5 drag-and-drop) so mouse, touch and pen
   all take the same path, and so the dragged piece can be a styled
   element rather than a browser drag image.
   ============================================================ */
const DRAG_THRESHOLD = 4; // px of travel before a press becomes a drag

/** { from, color, type, x, y, startX, startY, pointerId, active } */
const drag = ref(null);
const dropSquare = ref(null);
/** A completed drag also fires a click; that one must not re-select. */
let suppressClick = false;

const isDragging = computed(() => !!drag.value?.active);

/** Board-relative point → square name, honouring board orientation. */
const squareAtPoint = (clientX, clientY) => {
    if (!boardEl.value) return null;
    const rect = boardEl.value.getBoundingClientRect();
    const size = rect.width / 8;
    const col = Math.floor((clientX - rect.left) / size);
    const row = Math.floor((clientY - rect.top) / size);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const file = chess.boardFlipped ? 7 - col : col;
    const rank = chess.boardFlipped ? row + 1 : 8 - row;
    return String.fromCharCode(97 + file) + rank;
};

const tileBySquare = (square) =>
    chess.flattenedBoard.find((t) => t.square === square);

/**
 * Move/up/cancel are bound on the window rather than the board, so a drag
 * that ends outside the board — or outside the document — still resolves
 * instead of stranding a floating piece.
 */
const addDragListeners = () => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
};

const removeDragListeners = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
};

const endDrag = () => {
    drag.value = null;
    dropSquare.value = null;
    removeDragListeners();
};

const onPointerDown = (tile, event) => {
    suppressClick = false;
    // Left button / touch / pen only.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!canPickUp(tile)) return;

    // Selecting on press means a drag and a click share one code path, and
    // the piece lights up the instant you touch it.
    chess.selectSquare(tile);
    if (chess.selectedSquare !== tile.square) return;

    // Stops the browser starting its own image drag / text selection.
    event.preventDefault();
    // Capture keeps the grabbing cursor while the pointer roams; the window
    // listeners above are what actually guarantee delivery, so a browser that
    // refuses capture still behaves.
    try {
        event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
        /* not fatal — see above */
    }
    addDragListeners();

    drag.value = {
        from: tile.square,
        color: tile.piece.color,
        type: tile.piece.type,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
        active: false,
    };
};

const onPointerMove = (event) => {
    const d = drag.value;
    if (!d || event.pointerId !== d.pointerId) return;

    d.x = event.clientX;
    d.y = event.clientY;

    if (
        !d.active &&
        Math.hypot(event.clientX - d.startX, event.clientY - d.startY) >
            DRAG_THRESHOLD
    ) {
        d.active = true;
    }
    if (d.active)
        dropSquare.value = squareAtPoint(event.clientX, event.clientY);
};

const onPointerUp = (event) => {
    const d = drag.value;
    if (!d || event.pointerId !== d.pointerId) return;

    // Never crossed the threshold: this was a click. Leave the piece selected
    // and let the click handler drive the click-to-click flow.
    if (!d.active) {
        endDrag();
        return;
    }

    const target = squareAtPoint(event.clientX, event.clientY);
    endDrag();
    suppressClick = true;

    // Dropped back where it started — keep it selected, as a click would.
    if (target === d.from) return;

    if (target && chess.legalTargets.includes(target)) {
        // A dragged piece is already at the destination, so skip the slide —
        // but only when this drop moves now. A premove is played later, from
        // the origin square, and should animate normally.
        if (chess.isPlayerTurn) skipNextSlide = true;
        chess.selectSquare(tileBySquare(target));
    } else {
        // Illegal square, or released off the board.
        chess.clearSelection();
    }
};

const onPointerCancel = (event) => {
    const d = drag.value;
    if (!d || event.pointerId !== d.pointerId) return;
    endDrag();
};

const onSquareClick = (tile) => {
    if (suppressClick) {
        suppressClick = false;
        return;
    }
    chess.selectSquare(tile);
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
                canPickUp(tile) && 'square--grab',
                drag?.from === tile.square && 'square--dragging',
            ]"
            @pointerdown="onPointerDown(tile, $event)"
            @click="onSquareClick(tile)"
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
                v-else-if="isPremoveSquare(tile)"
                class="square__wash square__wash--premove"
            />
            <span
                v-else-if="isLastMove(tile)"
                class="square__wash square__wash--last"
            />

            <span
                v-if="
                    isDragging && dropSquare === tile.square && isTarget(tile)
                "
                class="square__wash square__wash--drop"
            />

            <span v-if="captureFlash === tile.square" class="square__flash" />

            <ChessPiece
                v-if="tile.piece"
                :key="animations.get(tile.square)?.id ?? 0"
                :class="[
                    'piece',
                    animations.has(tile.square) && 'piece--moving',
                    isDragging && drag.from === tile.square && 'piece--ghost',
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

    <!--
        Teleported to <body> on purpose: the board sits inside a translated
        ancestor at xl, which would otherwise become the containing block for
        a position:fixed layer and throw off the viewport coordinates.
    -->
    <Teleport to="body">
        <div
            v-if="isDragging"
            class="drag-layer"
            :style="{
                left: `${drag.x}px`,
                top: `${drag.y}px`,
                width: `${squarePx}px`,
                height: `${squarePx}px`,
            }"
        >
            <ChessPiece class="piece" :color="drag.color" :type="drag.type" />
        </div>
    </Teleport>
</template>
