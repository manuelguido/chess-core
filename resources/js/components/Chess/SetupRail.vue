<script setup>
/**
 * SetupRail — the left column: who you are playing, how the session is
 * configured, what assistance is on, and the primary session action.
 *
 * Everything in "Session setup" is locked once a game is running; the
 * assistance toggles stay live because they only change what is drawn.
 */
import { computed } from 'vue';
import { FlipVertical2, Play, RefreshCw, RotateCcw } from 'lucide-vue-next';
import ChessPiece from '../ChessPiece.vue';
import TimeControlPicker from './TimeControlPicker.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

const COLORS = [
    { label: 'White', value: 'w' },
    { label: 'Black', value: 'b' },
    { label: 'Random', value: 'random' },
];

const ASSISTANCE = [
    { key: 'showHints', label: 'Legal move hints' },
    { key: 'showCoords', label: 'Board coordinates' },
];

const phaseBadge = computed(() => {
    if (chess.gamePhase === 'playing') return 'LIVE';
    if (chess.gamePhase === 'over') return 'FINISHED';
    return 'READY';
});

const setElo = (event) => {
    if (chess.configLocked) return;
    chess.elo = Number(event.target.value);
};
</script>

<template>
    <aside class="rail">
        <div class="min-h-0 flex-1 overflow-y-auto">
            <div
                class="flex items-center justify-between border-b border-line-soft px-4 py-3.5"
            >
                <div class="flex flex-col gap-1">
                    <span class="eyebrow">Training mode</span>
                    <span class="text-sm font-semibold">
                        Practice vs engine
                    </span>
                </div>
                <span class="badge badge--accent">{{ phaseBadge }}</span>
            </div>

            <!-- Opponent ------------------------------------------------- -->
            <div class="rail-section">
                <div class="eyebrow mb-3">Opponent</div>

                <div class="flex items-center gap-3">
                    <div
                        class="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border border-line-strong bg-bg-raised"
                    >
                        <ChessPiece
                            class="h-6 w-6 opacity-70"
                            color="b"
                            type="n"
                        />
                    </div>
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold">
                            {{ chess.activeProfile?.name }}
                        </div>
                        <div class="mt-0.5 text-xs text-ink-soft">
                            {{ chess.activeProfile?.style }}
                        </div>
                    </div>
                </div>

                <div class="mt-4">
                    <div class="flex items-baseline justify-between gap-2">
                        <label for="engine-elo" class="text-xs text-ink-muted">
                            Engine strength
                        </label>
                        <output
                            for="engine-elo"
                            class="num text-[13px] font-semibold text-accent"
                        >
                            {{ chess.elo }} ELO
                        </output>
                    </div>
                    <input
                        id="engine-elo"
                        class="elo-slider"
                        type="range"
                        min="800"
                        max="3200"
                        step="100"
                        title="Estimated playing strength; 3200 uses maximum strength"
                        :value="chess.elo"
                        :aria-valuetext="`${chess.elo} ELO`"
                        :disabled="chess.configLocked"
                        :style="{
                            '--elo-progress': `${((chess.elo - 800) / 2400) * 100}%`,
                        }"
                        @input="setElo"
                    />
                    <div
                        class="num flex justify-between text-[11px] text-ink-soft"
                        aria-hidden="true"
                    >
                        <span>800</span>
                        <span>3200</span>
                    </div>
                </div>
            </div>

            <!-- Session setup -------------------------------------------- -->
            <div class="rail-section flex flex-col gap-4">
                <div class="flex items-center justify-between">
                    <span class="eyebrow">Session setup</span>
                    <span
                        v-if="chess.configLocked"
                        class="micro text-ink-ghost"
                        title="Setup is locked while a game is in progress"
                    >
                        Locked
                    </span>
                </div>

                <TimeControlPicker
                    :control="chess.timeControl"
                    :locked="chess.configLocked"
                    @update:control="chess.setTimeControl"
                />

                <div>
                    <div class="mb-2 text-[13px] text-ink-muted">
                        Your colour
                    </div>
                    <div class="segmented grid-cols-3">
                        <button
                            v-for="option in COLORS"
                            :key="option.value"
                            type="button"
                            :data-active="
                                chess.colorPreference === option.value
                            "
                            :disabled="chess.configLocked"
                            @click="chess.setColorPreference(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Assistance ----------------------------------------------- -->
            <div class="rail-section flex flex-col gap-3">
                <span class="eyebrow">Assistance</span>
                <button
                    v-for="item in ASSISTANCE"
                    :key="item.key"
                    type="button"
                    class="flex items-center justify-between"
                    role="switch"
                    :aria-checked="chess[item.key]"
                    @click="chess[item.key] = !chess[item.key]"
                >
                    <span class="text-[13px] text-ink-mild">
                        {{ item.label }}
                    </span>
                    <span class="switch" :data-on="chess[item.key]" />
                </button>
            </div>
        </div>

        <!-- Session actions stay visible while the settings scroll. -->
        <div
            class="flex shrink-0 flex-col gap-2 border-t border-line px-4 pt-3.5 pb-4"
        >
            <button
                v-if="chess.gamePhase === 'lobby'"
                type="button"
                class="btn btn--primary"
                :disabled="!chess.engineReady"
                @click="chess.startGame()"
            >
                <Play class="h-3.5 w-3.5" :stroke-width="1.8" />
                {{ chess.engineLoading ? 'Loading engine…' : 'Start' }}
            </button>
            <button
                v-else
                type="button"
                class="btn btn--primary"
                @click="chess.newGame()"
            >
                <RotateCcw class="h-3.5 w-3.5" :stroke-width="1.8" />
                New game
            </button>

            <div class="grid grid-cols-2 gap-2">
                <button type="button" class="btn" @click="chess.flipBoard()">
                    <FlipVertical2 class="h-3.5 w-3.5" :stroke-width="1.7" />
                    Flip board
                </button>
                <button
                    type="button"
                    class="btn"
                    :disabled="chess.gamePhase === 'lobby'"
                    title="Restart with the same settings"
                    @click="
                        chess.newGame();
                        chess.startGame();
                    "
                >
                    <RefreshCw class="h-3.5 w-3.5" :stroke-width="1.7" />
                    Rematch
                </button>
            </div>
        </div>
    </aside>
</template>

<style scoped>
.eyebrow {
    font-size: 10.5px;
    color: var(--color-ink-soft);
}

.segmented button {
    font-size: 13px;
}

.elo-slider {
    display: block;
    width: 100%;
    height: 36px;
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
}

.elo-slider::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 999px;
    background: linear-gradient(
        to right,
        var(--color-accent) var(--elo-progress),
        var(--color-bg-strong) var(--elo-progress)
    );
}

.elo-slider::-moz-range-track {
    height: 6px;
    border-radius: 999px;
    background: linear-gradient(
        to right,
        var(--color-accent) var(--elo-progress),
        var(--color-bg-strong) var(--elo-progress)
    );
}

.elo-slider::-webkit-slider-thumb {
    width: 18px;
    height: 18px;
    margin-top: -6px;
    appearance: none;
    border: 2px solid var(--color-bg-panel);
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-edge);
}

.elo-slider::-moz-range-thumb {
    box-sizing: border-box;
    width: 18px;
    height: 18px;
    border: 2px solid var(--color-bg-panel);
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-edge);
}

.elo-slider:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}
</style>
