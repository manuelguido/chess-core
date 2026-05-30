<script setup>
import { computed } from 'vue';
import { Shield, Sparkles, TimerReset } from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

// Mirrors store's engineParams — only depth is displayed here
const engineParams = (elo) => {
    if (elo <= 800) return { depth: 1 };
    if (elo <= 1000) return { depth: 2 };
    if (elo <= 1200) return { depth: 2 };
    if (elo <= 1400) return { depth: 3 };
    if (elo <= 1600) return { depth: 4 };
    if (elo <= 2200) return { depth: 5 };
    return { depth: 5 };
};

const params = computed(() => engineParams(chess.elo));

const formatTc = (tc) => {
    if (!tc) return '∞';
    const m = Math.floor(tc.base / 60);
    return tc.increment ? `${m}+${tc.increment}` : `${m}+0`;
};
</script>

<template>
    <section class="panel fade-in p-5">
        <div class="flex items-start justify-between gap-3">
            <div>
                <p class="eyebrow">Current game</p>
                <h2 class="mt-2 text-base text-ink">
                    {{ chess.gameTurnLabel }}
                </h2>
                <p class="meta mt-1">vs. {{ chess.activeProfile?.name }}</p>
            </div>
            <Shield class="h-4 w-4 text-ink-faint" :stroke-width="1.5" />
        </div>

        <div class="mt-5 grid grid-cols-2 gap-3">
            <div class="panel-inner p-3">
                <TimerReset
                    class="h-3.5 w-3.5 text-ink-faint"
                    :stroke-width="1.5"
                />
                <p class="label mt-2">Time control</p>
                <p class="num mt-1 text-sm font-medium text-ink">
                    {{ formatTc(chess.timeControl) }}
                </p>
            </div>
            <div class="panel-inner p-3">
                <Sparkles
                    class="h-3.5 w-3.5 text-ink-faint"
                    :stroke-width="1.5"
                />
                <p class="label mt-2">Search depth</p>
                <p class="num mt-1 text-sm font-medium text-ink">
                    {{ params.depth }}
                </p>
            </div>
        </div>
    </section>
</template>
