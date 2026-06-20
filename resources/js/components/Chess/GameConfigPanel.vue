<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
    BrainCircuit,
    ChevronRight,
    RotateCcw,
    Settings2,
    UserRound,
    X,
} from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';
import BotStrengthPanel from './BotStrengthPanel.vue';
import GameSettingsDrawer from './GameSettingsDrawer.vue';

const chess = useChessStore();

const showOpponentPicker = ref(false);

const closeOpponentPickerOnEscape = (event) => {
    if (event.key === 'Escape') showOpponentPicker.value = false;
};

onMounted(() => {
    window.addEventListener('keydown', closeOpponentPickerOnEscape);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', closeOpponentPickerOnEscape);
});

const formatTimeControl = (tc) => {
    if (!tc) return 'Untimed';
    const minutes = Math.floor(tc.base / 60);
    return tc.increment ? `${minutes}+${tc.increment}` : `${minutes}+0`;
};

const playerColorLabel = computed(() =>
    chess.playerColor === 'w' ? 'White' : 'Black',
);

const opponentStyle = computed(() => chess.activeProfile?.style ?? 'Balanced');
</script>

<template>
    <aside class="panel fade-in overflow-hidden">
        <section class="p-4">
            <div class="mb-4 flex items-center justify-between gap-3">
                <div>
                    <p class="eyebrow">Opponent</p>
                    <h2 class="mt-2 text-base leading-snug">
                        {{ chess.activeProfile?.name }}
                    </h2>
                </div>
                <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-navy-800"
                >
                    <UserRound class="h-4 w-4" :stroke-width="1.8" />
                </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div class="rounded-2xl bg-bg-sunken p-3">
                    <p class="label">ELO</p>
                    <p class="num mt-1 text-lg font-bold text-navy-950">
                        {{ chess.elo }}
                    </p>
                </div>
                <div class="rounded-2xl bg-bg-sunken p-3">
                    <p class="label">Style</p>
                    <p class="mt-1 text-sm font-bold text-navy-950">
                        {{ opponentStyle }}
                    </p>
                </div>
            </div>

            <button
                type="button"
                class="btn btn--ghost mt-3 w-full"
                @click="showOpponentPicker = true"
            >
                <BrainCircuit class="h-4 w-4" :stroke-width="1.8" />
                Change opponent
            </button>
        </section>

        <section class="panel-divider p-4">
            <div class="mb-4 flex items-center justify-between gap-3">
                <div>
                    <p class="eyebrow">Game</p>
                    <h2 class="mt-2 text-base">Preferences</h2>
                </div>
                <span class="pill num">{{
                    formatTimeControl(chess.timeControl)
                }}</span>
            </div>

            <dl class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                    <dt class="label">Time</dt>
                    <dd class="text-sm font-bold text-navy-950">
                        {{ formatTimeControl(chess.timeControl) }}
                    </dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <dt class="label">Color</dt>
                    <dd class="text-sm font-bold text-navy-950">
                        {{ playerColorLabel }}
                    </dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <dt class="label">Engine</dt>
                    <dd class="text-sm font-bold text-navy-950">
                        {{ opponentStyle }}
                    </dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <dt class="label">Assistance</dt>
                    <dd class="text-sm font-bold text-navy-950">Legal hints</dd>
                </div>
            </dl>

            <GameSettingsDrawer v-slot="{ open }">
                <button
                    type="button"
                    class="btn btn--ghost mt-4 w-full"
                    @click="open"
                >
                    <Settings2 class="h-4 w-4" :stroke-width="1.8" />
                    Customize game
                </button>
            </GameSettingsDrawer>
        </section>

        <section class="panel-divider p-4">
            <button
                type="button"
                class="btn btn--primary w-full"
                @click="chess.newGame()"
            >
                <RotateCcw class="h-4 w-4" :stroke-width="2" />
                New game
            </button>
        </section>

        <Teleport to="body">
            <div
                v-if="showOpponentPicker"
                class="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/24 p-4 backdrop-blur-[2px]"
                role="dialog"
                aria-modal="true"
                aria-label="Change opponent"
                @click.self="showOpponentPicker = false"
            >
                <div class="w-full max-w-5xl">
                    <div class="mb-3 flex justify-end">
                        <button
                            type="button"
                            class="icon-btn bg-bg-surface"
                            aria-label="Close opponent picker"
                            @click="showOpponentPicker = false"
                        >
                            <X class="h-4 w-4" :stroke-width="2" />
                        </button>
                    </div>

                    <BotStrengthPanel />

                    <div class="mt-3 flex justify-end">
                        <button
                            type="button"
                            class="btn btn--primary"
                            @click="showOpponentPicker = false"
                        >
                            Continue
                            <ChevronRight class="h-4 w-4" :stroke-width="2" />
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>
    </aside>
</template>
