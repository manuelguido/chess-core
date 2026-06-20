<script setup>
import { computed, ref } from 'vue';
import {
    Clock3,
    Gauge,
    Settings2,
    Sparkles,
    TimerReset,
    X,
} from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

const isOpen = ref(false);
const showCustom = ref(false);
const customMinutes = ref(5);
const customIncrement = ref(0);

const open = () => {
    isOpen.value = true;
};

const PRESETS = [
    {
        label: 'Bullet',
        options: [
            { name: '1+0', base: 60, increment: 0 },
            { name: '2+0', base: 120, increment: 0 },
            { name: '2+1', base: 120, increment: 1 },
        ],
    },
    {
        label: 'Blitz',
        options: [
            { name: '3+0', base: 180, increment: 0 },
            { name: '3+2', base: 180, increment: 2 },
            { name: '5+0', base: 300, increment: 0 },
        ],
    },
    {
        label: 'Classical',
        options: [
            { name: '10+0', base: 600, increment: 0 },
            { name: '15+0', base: 900, increment: 0 },
        ],
    },
];

const engineParams = computed(() => {
    const elo = chess.elo;
    if (elo <= 800)
        return { depth: 1, temperature: 320, simplicity: 0.9, laziness: 0.6 };
    if (elo <= 900)
        return { depth: 1, temperature: 240, simplicity: 0.8, laziness: 0.5 };
    if (elo <= 1000)
        return { depth: 2, temperature: 180, simplicity: 0.7, laziness: 0.4 };
    if (elo <= 1100)
        return { depth: 2, temperature: 130, simplicity: 0.6, laziness: 0.3 };
    if (elo <= 1200)
        return { depth: 2, temperature: 100, simplicity: 0.45, laziness: 0.2 };
    if (elo <= 1300)
        return { depth: 3, temperature: 75, simplicity: 0.35, laziness: 0.15 };
    if (elo <= 1400)
        return { depth: 3, temperature: 55, simplicity: 0.25, laziness: 0.08 };
    if (elo <= 1500)
        return { depth: 3, temperature: 38, simplicity: 0.15, laziness: 0.04 };
    if (elo <= 1600)
        return { depth: 4, temperature: 22, simplicity: 0.07, laziness: 0.02 };
    if (elo <= 1800)
        return { depth: 4, temperature: 10, simplicity: 0.02, laziness: 0.0 };
    if (elo <= 2000)
        return { depth: 4, temperature: 4, simplicity: 0.0, laziness: 0.0 };
    if (elo <= 2200)
        return { depth: 5, temperature: 2, simplicity: 0.0, laziness: 0.0 };
    return { depth: 5, temperature: 0, simplicity: 0.0, laziness: 0.0 };
});

const botDelayLabel = computed(() => {
    const base = Math.max(250, 850 - Math.floor(chess.elo / 4));
    return `${(Math.max(180, base) / 1000).toFixed(1)}-5.5s`;
});

const formatPreview = (tc) => {
    if (!tc) return 'Untimed';
    const m = Math.floor(tc.base / 60);
    return tc.increment ? `${m}+${tc.increment}` : `${m}+0`;
};

const isActive = (preset) =>
    chess.timeControl &&
    chess.timeControl.base === preset.base &&
    chess.timeControl.increment === preset.increment;

const select = (preset) => {
    if (chess.configLocked) return;
    chess.timeControl = { base: preset.base, increment: preset.increment };
};

const selectUntimed = () => {
    if (chess.configLocked) return;
    chess.timeControl = null;
};

const openCustom = () => {
    if (chess.configLocked) return;
    if (chess.timeControl) {
        customMinutes.value = Math.floor(chess.timeControl.base / 60);
        customIncrement.value = chess.timeControl.increment;
    }
    showCustom.value = true;
};

const applyCustom = () => {
    const base = Math.max(1, Math.min(60, Number(customMinutes.value))) * 60;
    const increment = Math.max(0, Math.min(60, Number(customIncrement.value)));
    chess.timeControl = { base, increment };
    showCustom.value = false;
};

defineExpose({ open });
</script>

<template>
    <slot :open="open">
        <button type="button" class="btn btn--ghost w-full" @click="open">
            <Settings2 class="h-4 w-4" :stroke-width="1.9" />
            Customize game
        </button>
    </slot>

    <Teleport to="body">
        <div
            v-if="isOpen"
            class="fixed inset-0 z-50 bg-navy-950/24 backdrop-blur-[2px]"
            @click.self="isOpen = false"
        >
            <aside
                class="ml-auto flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-line-soft bg-bg-surface shadow-2xl"
            >
                <div
                    class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line-soft bg-bg-surface/95 px-6 py-5 backdrop-blur"
                >
                    <div>
                        <p class="eyebrow">Settings</p>
                        <h2 class="mt-2 text-xl">Game preferences</h2>
                    </div>
                    <button
                        type="button"
                        class="icon-btn"
                        aria-label="Close settings"
                        @click="isOpen = false"
                    >
                        <X class="h-4 w-4" :stroke-width="2" />
                    </button>
                </div>

                <div class="space-y-7 px-6 py-6">
                    <section>
                        <div
                            class="mb-4 flex items-center justify-between gap-4"
                        >
                            <div>
                                <p class="eyebrow">Time</p>
                                <h3 class="mt-2 text-base">Time control</h3>
                            </div>
                            <span class="pill num">
                                <Clock3
                                    class="h-3.5 w-3.5"
                                    :stroke-width="1.8"
                                />
                                {{ formatPreview(chess.timeControl) }}
                            </span>
                        </div>

                        <div
                            class="space-y-4"
                            :class="
                                chess.configLocked &&
                                'pointer-events-none opacity-50'
                            "
                        >
                            <div v-for="group in PRESETS" :key="group.label">
                                <p class="label mb-2">{{ group.label }}</p>
                                <div class="grid grid-cols-3 gap-2">
                                    <button
                                        v-for="preset in group.options"
                                        :key="preset.name"
                                        type="button"
                                        class="row-btn num justify-center text-xs"
                                        :data-active="isActive(preset)"
                                        :disabled="chess.configLocked"
                                        @click="select(preset)"
                                    >
                                        {{ preset.name }}
                                    </button>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    class="row-btn justify-center text-xs"
                                    :data-active="chess.timeControl === null"
                                    :disabled="chess.configLocked"
                                    @click="selectUntimed"
                                >
                                    Untimed
                                </button>
                                <button
                                    type="button"
                                    class="row-btn justify-center text-xs"
                                    :disabled="chess.configLocked"
                                    @click="openCustom"
                                >
                                    Custom
                                </button>
                            </div>

                            <div
                                v-if="showCustom"
                                class="rounded-3xl border border-line-soft bg-bg-sunken p-4"
                            >
                                <div class="grid grid-cols-2 gap-3">
                                    <label class="block">
                                        <span class="label mb-2 block"
                                            >Minutes</span
                                        >
                                        <input
                                            v-model.number="customMinutes"
                                            type="number"
                                            min="1"
                                            max="60"
                                            class="input num"
                                        />
                                    </label>
                                    <label class="block">
                                        <span class="label mb-2 block"
                                            >Increment</span
                                        >
                                        <input
                                            v-model.number="customIncrement"
                                            type="number"
                                            min="0"
                                            max="60"
                                            class="input num"
                                        />
                                    </label>
                                </div>
                                <div class="mt-4 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        class="btn btn--quiet"
                                        @click="showCustom = false"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        class="btn btn--primary"
                                        @click="applyCustom"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="panel-divider pt-6">
                        <div
                            class="mb-4 flex items-center justify-between gap-4"
                        >
                            <div>
                                <p class="eyebrow">Engine</p>
                                <h3 class="mt-2 text-base">
                                    Opponent behavior
                                </h3>
                            </div>
                            <span class="pill pill--navy num"
                                >{{ chess.elo }} ELO</span
                            >
                        </div>

                        <div
                            class="mb-4 rounded-3xl border border-line-soft bg-bg-sunken p-4"
                            :class="
                                chess.configLocked &&
                                'pointer-events-none opacity-50'
                            "
                        >
                            <div
                                class="mb-3 flex items-center justify-between gap-3"
                            >
                                <p class="label">Rating</p>
                                <p class="num text-sm font-bold text-navy-950">
                                    {{ chess.elo }} ELO
                                </p>
                            </div>

                            <input
                                v-model="chess.elo"
                                type="range"
                                min="800"
                                max="2400"
                                step="100"
                                class="slider"
                                :disabled="chess.configLocked"
                                aria-label="Bot ELO"
                            />

                            <div
                                class="num mt-3 flex justify-between text-[10px] font-semibold text-ink-faint"
                            >
                                <span>800</span>
                                <span>2400</span>
                            </div>
                        </div>

                        <div
                            class="grid gap-px overflow-hidden rounded-3xl border border-line-soft bg-line-soft"
                        >
                            <div class="bg-bg-surface p-4">
                                <div
                                    class="flex items-center justify-between gap-3"
                                >
                                    <span
                                        class="flex items-center gap-2 text-sm font-bold text-navy-950"
                                    >
                                        <Sparkles
                                            class="h-4 w-4 text-navy-700"
                                            :stroke-width="1.7"
                                        />
                                        Engine style
                                    </span>
                                    <span
                                        class="text-sm font-semibold text-ink-muted"
                                    >
                                        {{ chess.activeProfile?.style }}
                                    </span>
                                </div>
                            </div>
                            <div class="bg-bg-surface p-4">
                                <div
                                    class="flex items-center justify-between gap-3"
                                >
                                    <span
                                        class="flex items-center gap-2 text-sm font-bold text-navy-950"
                                    >
                                        <Gauge
                                            class="h-4 w-4 text-navy-700"
                                            :stroke-width="1.7"
                                        />
                                        Search depth
                                    </span>
                                    <span
                                        class="num text-sm font-semibold text-ink-muted"
                                    >
                                        {{ engineParams.depth }} ply
                                    </span>
                                </div>
                            </div>
                            <div class="bg-bg-surface p-4">
                                <div
                                    class="flex items-center justify-between gap-3"
                                >
                                    <span
                                        class="flex items-center gap-2 text-sm font-bold text-navy-950"
                                    >
                                        <TimerReset
                                            class="h-4 w-4 text-navy-700"
                                            :stroke-width="1.7"
                                        />
                                        Bot delay
                                    </span>
                                    <span
                                        class="num text-sm font-semibold text-ink-muted"
                                    >
                                        {{ botDelayLabel }}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </aside>
        </div>
    </Teleport>
</template>
