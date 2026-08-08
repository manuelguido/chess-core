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

    return {
        name: mine ? 'You' : (chess.activeProfile?.name ?? 'Engine'),
        role: mine ? '' : `ENGINE · ${chess.activeProfile?.style ?? ''}`,
        rating: mine ? null : chess.elo,
        isEngine: !mine,
        active: chess.gamePhase === 'playing' && chess.turn === color,
        captured: taken.map((type) => ({ color: takenColor, type })),
        advantage: ahead ? Math.abs(balance) : null,
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
        Below xl the board is width-driven and the page scrolls.

        At xl the board must be driven by the *height* left over in the
        column, or a short viewport would push the shell into scrolling.
        That cannot be done with plain flex — a height-driven square inside
        a shrink-to-fit column makes width depend on itself. So the board
        row becomes a positioning context and the board is taken out of
        flow, where `height:100%` + `aspect-ratio` resolves cleanly. The
        stage's own max-width mirrors the same arithmetic so the strips line
        up with the board edges; if it is ever off, the board stays square
        and merely sits a little narrower than the strips.
    -->
    <div
        class="flex w-full max-w-[min(76vh,100%)] flex-col gap-2.5 xl:h-full xl:max-w-[calc(100dvh-220px)]"
    >
        <PlayerStrip v-bind="topStrip" />

        <div class="min-h-0 xl:relative xl:flex-1">
            <div
                class="flex items-stretch gap-2.5 xl:absolute xl:inset-y-0 xl:left-1/2 xl:-translate-x-1/2"
            >
                <!-- Eval bar: white's share of the static evaluation -->
                <div
                    class="relative w-[11px] shrink-0 overflow-hidden rounded-[3px] border border-[#1C232B] bg-bg-hover"
                    :title="`Evaluation ${chess.positionEval > 0 ? '+' : ''}${chess.positionEval}`"
                >
                    <div
                        class="absolute inset-x-0 bottom-0 bg-[#E4E7EB] transition-[height] duration-350 ease-out"
                        :style="{ height: `${chess.evalPercent}%` }"
                    />
                    <div
                        class="absolute inset-x-0 top-1/4 h-px bg-white/[0.07]"
                    />
                    <div class="absolute inset-x-0 top-1/2 h-px bg-accent/55" />
                    <div
                        class="absolute inset-x-0 top-3/4 h-px bg-white/[0.07]"
                    />
                </div>

                <ChessBoard />
            </div>
        </div>

        <PlayerStrip v-bind="bottomStrip" />

        <div class="mt-0.5 flex flex-wrap items-center gap-2">
            <div
                class="flex min-w-0 flex-auto items-center gap-2 rounded-md border px-2.5 py-1.5 whitespace-nowrap"
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
