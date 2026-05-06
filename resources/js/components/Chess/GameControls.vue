<script setup>
import { Flag, RotateCcw } from "lucide-vue-next";
import { useChessStore } from "../../stores/useChessStore.js";

const chess = useChessStore();
</script>

<template>
    <div class="mt-5 flex w-full max-w-180 items-center justify-between gap-3">
        <p class="meta">
            <span class="text-ink">{{ chess.gameTurnLabel }}</span>
            <span class="mx-2 text-ink-faint">·</span>
            <span>You play white</span>
        </p>

        <div class="flex gap-2">
            <button class="btn btn--ghost" type="button" @click="chess.resign">
                <Flag class="h-3.5 w-3.5" :stroke-width="1.75" />
                Reset line
            </button>
            <button class="btn btn--primary" type="button" @click="chess.newGame">
                <RotateCcw class="h-3.5 w-3.5" :stroke-width="2" />
                New game
            </button>
        </div>
    </div>
</template>
