<script setup>
import { Shield, Sparkles, TimerReset } from "lucide-vue-next";
import { useChessStore } from "../../stores/useChessStore.js";

const chess = useChessStore();
</script>

<template>
    <section class="panel p-5 fade-in">
        <div class="flex items-start justify-between gap-3">
            <div>
                <p class="eyebrow">Current game</p>
                <h2 class="mt-2 text-base text-ink">{{ chess.gameTurnLabel }}</h2>
                <p class="meta mt-1">vs. {{ chess.activeProfile?.name }}</p>
            </div>
            <Shield class="h-4 w-4 text-ink-faint" :stroke-width="1.5" />
        </div>

        <div class="mt-5 grid grid-cols-2 gap-3">
            <div class="panel-inner p-3">
                <TimerReset class="h-3.5 w-3.5 text-ink-faint" :stroke-width="1.5" />
                <p class="label mt-2">Bot delay</p>
                <p class="mt-1 num text-sm font-medium text-ink">
                    {{ chess.botDelay()
                    }}<span class="text-ink-faint text-[10px] ml-0.5">ms</span>
                </p>
            </div>
            <div class="panel-inner p-3">
                <Sparkles class="h-3.5 w-3.5 text-ink-faint" :stroke-width="1.5" />
                <p class="label mt-2">Search depth</p>
                <p class="mt-1 num text-sm font-medium text-ink">
                    {{ chess.activeProfile?.depth }}
                </p>
            </div>
        </div>
    </section>
</template>
