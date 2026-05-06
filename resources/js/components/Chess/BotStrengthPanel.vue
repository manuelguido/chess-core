<script setup>
import { Gauge } from "lucide-vue-next";
import { useChessStore } from "../../stores/useChessStore.js";

const chess = useChessStore();
</script>

<template>
    <section class="panel p-5 fade-in">
        <div class="mb-4 flex items-center justify-between">
            <h2>Bot strength</h2>
            <Gauge class="h-4 w-4 text-ink-faint" :stroke-width="1.5" />
        </div>

        <div class="mb-4 flex items-end justify-between">
            <span class="num text-3xl font-semibold text-ink tracking-tight">
                {{ chess.elo }}
            </span>
            <span class="label">ELO</span>
        </div>

        <input
            v-model="chess.elo"
            type="range"
            min="800"
            max="3000"
            step="100"
            class="slider"
            aria-label="Bot ELO"
        />

        <div class="mt-3 flex justify-between num text-[10px] text-ink-faint">
            <span>800</span>
            <span>3000</span>
        </div>

        <div class="mt-5 grid gap-2">
            <button
                v-for="profile in chess.botProfiles"
                :key="profile.elo"
                type="button"
                class="row-btn"
                :data-active="chess.activeProfile?.elo === profile.elo"
                @click="chess.elo = profile.elo"
            >
                <span>{{ profile.name }}</span>
                <span class="num text-[11px] text-ink-faint">{{ profile.elo }}</span>
            </button>
        </div>

        <div class="mt-5 panel-divider grid grid-cols-2 gap-4 pt-4">
            <div>
                <p class="label">Style</p>
                <p class="mt-1 text-sm font-medium text-ink">
                    {{ chess.activeProfile?.style }}
                </p>
            </div>
            <div>
                <p class="label">Depth</p>
                <p class="mt-1 text-sm font-medium text-ink num">
                    {{ chess.activeProfile?.depth }}
                </p>
            </div>
        </div>
    </section>
</template>
