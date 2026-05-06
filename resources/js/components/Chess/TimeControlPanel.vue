<script setup>
import { ref } from "vue";
import { Timer } from "lucide-vue-next";
import { useChessStore } from "../../stores/useChessStore.js";

const chess = useChessStore();

const PRESETS = [
    { label: "Bullet",   options: [
        { name: "1+0",  base: 60,  increment: 0 },
        { name: "2+0",  base: 120, increment: 0 },
        { name: "2+1",  base: 120, increment: 1 },
    ]},
    { label: "Blitz",    options: [
        { name: "3+0",  base: 180, increment: 0 },
        { name: "3+2",  base: 180, increment: 2 },
        { name: "5+0",  base: 300, increment: 0 },
    ]},
    { label: "Classical", options: [
        { name: "10+0", base: 600,  increment: 0 },
        { name: "15+0", base: 900,  increment: 0 },
    ]},
];

// Custom modal state
const showCustom = ref(false);
const customMinutes = ref(5);
const customIncrement = ref(0);

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

const formatPreview = (tc) => {
    if (!tc) return "∞ Untimed";
    const m = Math.floor(tc.base / 60);
    return tc.increment ? `${m}+${tc.increment}` : `${m}+0`;
};
</script>

<template>
    <section class="panel p-5 fade-in" :class="chess.configLocked && 'opacity-60'">
        <div class="mb-4 flex items-center justify-between">
            <h2>Time control</h2>
            <Timer class="h-4 w-4 text-ink-faint" :stroke-width="1.5" />
        </div>

        <p class="label mb-3">
            Selected:
            <span class="ml-1 font-medium text-ink num">{{ formatPreview(chess.timeControl) }}</span>
        </p>

        <div class="space-y-3">
            <div v-for="group in PRESETS" :key="group.label">
                <p class="label mb-1.5">{{ group.label }}</p>
                <div class="grid grid-cols-3 gap-1.5">
                    <button
                        v-for="preset in group.options"
                        :key="preset.name"
                        type="button"
                        class="row-btn justify-center num text-xs"
                        :data-active="isActive(preset)"
                        :disabled="chess.configLocked"
                        @click="select(preset)"
                    >
                        {{ preset.name }}
                    </button>
                </div>
            </div>
        </div>

        <div class="mt-3 panel-divider pt-3 grid grid-cols-2 gap-1.5">
            <button
                type="button"
                class="row-btn justify-center text-xs"
                :data-active="chess.timeControl === null"
                :disabled="chess.configLocked"
                @click="selectUntimed"
            >
                ∞ Untimed
            </button>
            <button
                type="button"
                class="row-btn justify-center text-xs"
                :disabled="chess.configLocked"
                @click="openCustom"
            >
                Custom…
            </button>
        </div>
    </section>

    <!-- Custom time control modal -->
    <Teleport to="body">
        <div
            v-if="showCustom"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            @click.self="showCustom = false"
        >
            <div class="panel w-80 p-6 shadow-2xl">
                <h2 class="mb-5 text-base">Custom time control</h2>

                <div class="space-y-4">
                    <div>
                        <label class="label block mb-1.5" for="custom-minutes">
                            Base time (minutes)
                        </label>
                        <input
                            id="custom-minutes"
                            v-model.number="customMinutes"
                            type="number"
                            min="1"
                            max="60"
                            class="w-full rounded-md border border-line-soft bg-bg-elevated px-3 py-2 num text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                    </div>
                    <div>
                        <label class="label block mb-1.5" for="custom-increment">
                            Increment (seconds)
                        </label>
                        <input
                            id="custom-increment"
                            v-model.number="customIncrement"
                            type="number"
                            min="0"
                            max="60"
                            class="w-full rounded-md border border-line-soft bg-bg-elevated px-3 py-2 num text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                    </div>
                </div>

                <div class="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        class="btn btn--ghost"
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
    </Teleport>
</template>
