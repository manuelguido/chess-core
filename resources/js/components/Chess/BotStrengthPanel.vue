<script setup>
import { Gauge } from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();
</script>

<template>
    <section
        class="panel fade-in p-5"
        :class="chess.configLocked && 'opacity-60'"
    >
        <div class="mb-4 flex items-center justify-between">
            <h2>Bot strength</h2>
            <Gauge class="h-4 w-4 text-ink-faint" :stroke-width="1.5" />
        </div>

        <div class="mb-4 flex items-end justify-between">
            <span class="num text-3xl font-semibold tracking-tight text-ink">
                {{ chess.elo }}
            </span>
            <span class="label">ELO</span>
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

        <div class="num mt-3 flex justify-between text-[10px] text-ink-faint">
            <span>800</span>
            <span>2400</span>
        </div>

        <div class="mt-5 grid gap-2">
            <button
                v-for="profile in chess.botProfiles"
                :key="profile.elo"
                type="button"
                class="row-btn"
                :data-active="chess.activeProfile?.elo === profile.elo"
                :disabled="chess.configLocked"
                @click="chess.elo = profile.elo"
            >
                <span>{{ profile.name }}</span>
                <span class="num text-[11px] text-ink-faint">{{
                    profile.elo
                }}</span>
            </button>
        </div>

        <div class="panel-divider mt-5 grid grid-cols-2 gap-4 pt-4">
            <div>
                <p class="label">Style</p>
                <p class="mt-1 text-sm font-medium text-ink">
                    {{ chess.activeProfile?.style }}
                </p>
            </div>
            <div>
                <p class="label">Depth</p>
                <p class="num mt-1 text-sm font-medium text-ink">
                    {{ chess.activeProfile?.depth }}
                </p>
            </div>
        </div>
    </section>
</template>
