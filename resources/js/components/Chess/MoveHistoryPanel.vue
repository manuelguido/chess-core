<script setup>
import { History } from "lucide-vue-next";
import { useChessStore } from "../../stores/useChessStore.js";

const chess = useChessStore();
</script>

<template>
    <section class="panel p-5 fade-in">
        <div class="mb-4 flex items-center justify-between">
            <h2>Move history</h2>
            <History class="h-4 w-4 text-ink-faint" :stroke-width="1.5" />
        </div>

        <div class="space-y-1">
            <div v-if="chess.movePairs.length === 0" class="meta py-2">
                Play any legal white move to begin.
            </div>
            <div
                v-for="pair in chess.movePairs"
                :key="pair.number"
                class="grid grid-cols-[28px_1fr_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg-elevated transition-colors duration-150"
            >
                <span class="num text-[11px] text-ink-faint">{{ pair.number }}.</span>
                <span class="num font-medium text-ink">{{ pair.white }}</span>
                <span class="num text-ink-muted">{{ pair.black }}</span>
            </div>
        </div>
    </section>
</template>
