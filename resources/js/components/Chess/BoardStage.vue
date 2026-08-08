<script setup>
/**
 * BoardStage — the centre column: opponent strip, eval bar + board,
 * player strip, and the in-game action bar.
 */
import { computed } from 'vue';
import { Flag, Radio, Undo2 } from 'lucide-vue-next';
import ChessBoard from './ChessBoard.vue';
import PlayerStrip from './PlayerStrip.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

/* Which colour sits on which edge of the board. */
const topColor = computed(() => (chess.boardFlipped ? 'w' : 'b'));
const bottomColor = computed(() => (chess.boardFlipped ? 'b' : 'w'));

const isMine = (color) => color === chess.playerColor;

/**
 * Everything a PlayerStrip needs for one side, resolved from the store.
 */
const strip = (color) => {
    const mine = isMine(color);
    const balance = chess.materialBalance;
    const ahead = color === 'w' ? balance > 0 : balance < 0;

    // Pieces this side has captured are the *other* side's losses.
    const takenColor = color === 'w' ? 'b' : 'w';
    const taken = color === 'w' ? chess.capturedBlack : chess.capturedWhite;

    const timed = !!chess.timeControl;
    const seconds = !timed
        ? null
        : chess.gamePhase === 'lobby'
          ? chess.timeControl.base
          : chess.clocks[color];

    return {
        name: mine ? 'You' : (chess.activeProfile?.name ?? 'Engine'),
        role: mine ? '' : `ENGINE · ${chess.activeProfile?.style ?? ''}`,
        rating: mine ? null : chess.elo,
        isEngine: !mine,
        active: chess.gamePhase === 'playing' && chess.turn === color,
        thinking: !mine && chess.botThinking,
        prompt:
            mine &&
            chess.gamePhase === 'playing' &&
            chess.isPlayerTurn &&
            !chess.botThinking &&
            !chess.isReviewing,
        captured: taken.map((type) => ({ color: takenColor, type })),
        advantage: ahead ? Math.abs(balance) : null,
        seconds,
        low: timed && seconds != null && seconds <= 30,
        clockFraction:
            timed && seconds != null ? seconds / chess.timeControl.base : 1,
    };
};

const topStrip = computed(() => strip(topColor.value));
const bottomStrip = computed(() => strip(bottomColor.value));

/** Dot colour on the status pill mirrors the phase. */
const statusTone = computed(() => {
    if (chess.gamePhase === 'over') return 'bg-danger';
    if (chess.gamePhase === 'lobby') return 'bg-ink-fainter';
    return chess.isPlayerTurn ? 'bg-accent' : 'bg-ink-fainter';
});

const statusText = computed(() =>
    chess.isReviewing
        ? `Reviewing move ${chess.viewCursor + 1} of ${chess.fullHistory.length}`
        : chess.status,
);
</script>

<template>
    <!--
        Below xl the board is width-driven and the page scrolls. At xl the
        stage is exactly as tall as its column and the board sizes itself
        from the leftover height, so it can never push the shell into
        scrolling no matter how short the viewport is.
    -->
    <div
        class="flex w-full max-w-[min(76vh,100%)] flex-col gap-2.5 xl:h-full xl:w-fit xl:max-w-full"
    >
        <PlayerStrip v-bind="topStrip" />

        <div class="flex min-h-0 flex-1 items-stretch justify-center gap-2.5">
            <!-- Eval bar: white's share of the static evaluation -->
            <div
                class="relative w-[11px] shrink-0 overflow-hidden rounded-[3px] border border-[#1C232B] bg-bg-hover"
                :title="`Evaluation ${chess.positionEval > 0 ? '+' : ''}${chess.positionEval}`"
            >
                <div
                    class="absolute inset-x-0 bottom-0 bg-[#E4E7EB] transition-[height] duration-350 ease-out"
                    :style="{ height: `${chess.evalPercent}%` }"
                />
                <div class="absolute inset-x-0 top-1/4 h-px bg-white/[0.07]" />
                <div class="absolute inset-x-0 top-1/2 h-px bg-accent/55" />
                <div class="absolute inset-x-0 top-3/4 h-px bg-white/[0.07]" />
            </div>

            <ChessBoard />
        </div>

        <PlayerStrip v-bind="bottomStrip" />

        <div class="mt-0.5 flex flex-wrap items-center gap-2">
            <div
                class="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
                :class="
                    chess.gamePhase === 'over'
                        ? 'border-[#3A241F] bg-bg-panel'
                        : 'border-line bg-bg-panel'
                "
            >
                <span
                    class="h-1.5 w-1.5 rounded-full transition-colors duration-250"
                    :class="statusTone"
                />
                <span class="text-xs text-ink-mild">{{ statusText }}</span>
            </div>

            <div class="ml-auto flex flex-wrap gap-1.5">
                <button
                    v-if="chess.isReviewing"
                    type="button"
                    class="btn btn--quiet"
                    @click="chess.returnToLive()"
                >
                    <Radio class="h-3.5 w-3.5" :stroke-width="1.7" />
                    Return to live
                </button>

                <button
                    type="button"
                    class="btn btn--quiet"
                    :disabled="!chess.canTakeback"
                    title="Take back your last move and the engine's reply"
                    @click="chess.takeback()"
                >
                    <Undo2 class="h-3.5 w-3.5" :stroke-width="1.7" />
                    Takeback
                </button>

                <button
                    type="button"
                    class="btn btn--quiet btn--danger"
                    :disabled="chess.gamePhase !== 'playing'"
                    @click="chess.resign()"
                >
                    <Flag class="h-3.5 w-3.5" :stroke-width="1.7" />
                    Resign
                </button>
            </div>
        </div>
    </div>
</template>
