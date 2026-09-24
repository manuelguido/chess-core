<script setup>
import { computed } from 'vue';
import { Flag, Radio, RefreshCw, Undo2 } from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();
const statusText = computed(() =>
    chess.isReviewing
        ? `Reviewing move ${chess.viewCursor + 1} of ${chess.fullHistory.length}`
        : chess.status,
);
const statusTone = computed(() => {
    if (chess.engineError || chess.gamePhase === 'over') return 'bg-danger';
    if (chess.gamePhase === 'playing' && chess.isPlayerTurn) return 'bg-accent';
    return 'bg-ink-fainter';
});
</script>

<template>
    <section class="game-actions" aria-label="Game controls">
        <div class="game-actions__status" role="status">
            <span class="h-2 w-2 shrink-0 rounded-full" :class="statusTone" />
            <span>{{ statusText }}</span>
        </div>

        <button
            v-if="chess.engineError"
            type="button"
            class="btn w-full"
            @click="chess.retryEngine()"
        >
            <RefreshCw class="h-4 w-4" :stroke-width="1.7" />
            Retry engine
        </button>
        <button
            v-if="chess.isReviewing"
            type="button"
            class="btn w-full"
            @click="chess.returnToLive()"
        >
            <Radio class="h-4 w-4" :stroke-width="1.7" />
            Return to live
        </button>

        <div class="grid grid-cols-2 gap-2">
            <button
                type="button"
                class="btn btn--quiet"
                :disabled="!chess.canTakeback"
                title="Take back your last move and the engine's reply"
                @click="chess.takeback()"
            >
                <Undo2 class="h-4 w-4" :stroke-width="1.7" />
                Takeback
            </button>
            <button
                type="button"
                class="btn btn--quiet btn--danger"
                :disabled="chess.gamePhase !== 'playing'"
                @click="chess.resign()"
            >
                <Flag class="h-4 w-4" :stroke-width="1.7" />
                Resign
            </button>
        </div>
    </section>
</template>
