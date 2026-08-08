<script setup>
/**
 * SetupRail — the left column: who you are playing, how the session is
 * configured, what assistance is on, and the primary session action.
 *
 * Everything in "Session setup" is locked once a game is running; the
 * assistance toggles stay live because they only change what is drawn.
 */
import { computed } from 'vue';
import {
    FlipVertical2,
    Play,
    RefreshCw,
    RotateCcw,
    UserRound,
} from 'lucide-vue-next';
import ChessPiece from '../ChessPiece.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

const TIME_PRESETS = [
    { label: '1+0', base: 60, increment: 0 },
    { label: '3+0', base: 180, increment: 0 },
    { label: '5+3', base: 300, increment: 3 },
    { label: '10+0', base: 600, increment: 0 },
];

const COLORS = [
    { label: 'White', value: 'w' },
    { label: 'Black', value: 'b' },
    { label: 'Random', value: 'random' },
];

const ASSISTANCE = [
    { key: 'showHints', label: 'Legal move hints' },
    { key: 'showCoords', label: 'Board coordinates' },
];

/** Engine ladder — one rung per bot profile the server sent. */
const ladder = computed(() =>
    [...chess.botProfiles].sort((a, b) => a.elo - b.elo),
);

const activeRung = computed(() =>
    ladder.value.findIndex((p) => p.elo === chess.activeProfile?.elo),
);

const isTimeActive = (preset) =>
    !!chess.timeControl &&
    chess.timeControl.base === preset.base &&
    chess.timeControl.increment === preset.increment;

const timeLabel = computed(() => {
    if (!chess.timeControl) return 'Untimed';
    const minutes = Math.floor(chess.timeControl.base / 60);
    return `${minutes}+${chess.timeControl.increment}`;
});

const phaseBadge = computed(() => {
    if (chess.gamePhase === 'playing') return 'LIVE';
    if (chess.gamePhase === 'over') return 'FINISHED';
    return 'READY';
});

const cycleOpponent = () => {
    if (chess.configLocked) return;
    const next = (activeRung.value + 1) % ladder.value.length;
    chess.elo = ladder.value[next].elo;
};

const selectRung = (index) => {
    if (chess.configLocked) return;
    chess.elo = ladder.value[index].elo;
};
</script>

<template>
    <aside class="rail">
        <div
            class="flex items-center justify-between border-b border-line-soft px-4 py-3.5"
        >
            <div class="flex flex-col gap-1">
                <span class="eyebrow">Training mode</span>
                <span class="text-[12.5px] font-semibold">
                    Practice vs engine
                </span>
            </div>
            <span class="badge badge--accent">{{ phaseBadge }}</span>
        </div>

        <!-- Opponent ------------------------------------------------- -->
        <div class="rail-section">
            <div class="mb-3 flex items-center justify-between gap-2">
                <span class="eyebrow">Opponent</span>
                <button
                    type="button"
                    class="btn btn--tiny"
                    :disabled="chess.configLocked"
                    @click="cycleOpponent"
                >
                    <UserRound class="h-2.5 w-2.5" :stroke-width="1.6" />
                    CHANGE
                </button>
            </div>

            <div class="flex items-center gap-3">
                <div
                    class="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[9px] border border-line-strong bg-bg-raised"
                >
                    <ChessPiece class="h-6 w-6 opacity-70" color="b" type="n" />
                </div>
                <div class="min-w-0">
                    <div class="truncate text-sm font-semibold">
                        {{ chess.activeProfile?.name }}
                    </div>
                    <div class="num mt-0.5 text-[11.5px] text-ink-soft">
                        {{ chess.elo }} ELO
                    </div>
                </div>
                <div class="ml-auto shrink-0 text-right">
                    <div class="text-[11px] font-medium text-ink-mild">
                        {{ chess.activeProfile?.style }}
                    </div>
                    <div class="num mt-1 text-[10.5px] text-ink-fainter">
                        Depth {{ chess.activeProfile?.depth }}
                    </div>
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

            <div>
                <div class="mb-2 text-[11px] text-ink-soft">Time control</div>
                <div class="segmented grid-cols-4">
                    <button
                        v-for="preset in TIME_PRESETS"
                        :key="preset.label"
                        type="button"
                        :data-active="isTimeActive(preset)"
                        :disabled="chess.configLocked"
                        @click="
                            chess.setTimeControl({
                                base: preset.base,
                                increment: preset.increment,
                            })
                        "
                    >
                        {{ preset.label }}
                    </button>
                </div>
            </div>

            <div>
                <div class="mb-2 text-[11px] text-ink-soft">Your colour</div>
                <div class="segmented grid-cols-3">
                    <button
                        v-for="option in COLORS"
                        :key="option.value"
                        type="button"
                        :data-active="chess.colorPreference === option.value"
                        :disabled="chess.configLocked"
                        @click="chess.setColorPreference(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>

            <div>
                <div class="mb-2 flex items-baseline justify-between">
                    <span class="text-[11px] text-ink-soft">
                        Engine strength
                    </span>
                    <span class="num text-[11px] text-ink-mild">
                        LV {{ activeRung + 1 }} · {{ chess.elo }}
                    </span>
                </div>
                <div
                    class="grid gap-[3px]"
                    :style="{
                        gridTemplateColumns: `repeat(${ladder.length}, minmax(0, 1fr))`,
                    }"
                >
                    <button
                        v-for="(profile, index) in ladder"
                        :key="profile.elo"
                        type="button"
                        class="h-5 rounded-[3px] transition-colors duration-150 disabled:cursor-not-allowed"
                        :class="
                            index <= activeRung
                                ? 'bg-accent hover:bg-accent-hover'
                                : 'bg-[#1B222A] hover:bg-line-strong'
                        "
                        :style="
                            index <= activeRung
                                ? { opacity: 0.55 + index * 0.09 }
                                : null
                        "
                        :disabled="chess.configLocked"
                        :title="`${profile.name} — ${profile.elo} ELO`"
                        :aria-label="`${profile.name}, ${profile.elo} ELO`"
                        @click="selectRung(index)"
                    />
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
                <span class="text-[12.5px] text-ink-mild">
                    {{ item.label }}
                </span>
                <span class="switch" :data-on="chess[item.key]" />
            </button>
        </div>

        <!-- Session actions ------------------------------------------ -->
        <div class="mt-auto flex flex-col gap-2 px-4 pt-3.5 pb-4">
            <button
                v-if="chess.gamePhase === 'lobby'"
                type="button"
                class="btn btn--primary"
                @click="chess.startGame()"
            >
                <Play class="h-3.5 w-3.5" :stroke-width="1.8" />
                Start session · {{ timeLabel }}
            </button>
            <button
                v-else
                type="button"
                class="btn btn--primary"
                @click="chess.newGame()"
            >
                <RotateCcw class="h-3.5 w-3.5" :stroke-width="1.8" />
                New session
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
