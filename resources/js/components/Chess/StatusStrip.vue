<script setup>
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();
</script>

<template>
    <div
        class="mb-4 grid w-full max-w-180 gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft"
        :class="chess.isReviewing ? 'grid-cols-5' : 'grid-cols-4'"
    >
        <div class="bg-bg-surface px-4 py-3">
            <p class="label">Status</p>
            <p class="mt-1.5 truncate text-sm font-medium text-ink">
                {{ chess.status }}
            </p>
        </div>
        <div class="bg-bg-surface px-4 py-3">
            <p class="label">Material</p>
            <p
                class="num mt-1.5 text-sm font-medium"
                :class="
                    chess.materialBalance > 0
                        ? 'text-positive'
                        : chess.materialBalance < 0
                          ? 'text-negative'
                          : 'text-ink'
                "
            >
                {{ chess.materialBalance > 0 ? '+' : ''
                }}{{ chess.materialBalance }}
            </p>
        </div>
        <div class="bg-bg-surface px-4 py-3">
            <p class="label">Move</p>
            <p class="num mt-1.5 text-sm font-medium text-ink">
                {{ chess.currentMoveNumber }}
            </p>
        </div>
        <div class="bg-bg-surface px-4 py-3">
            <p class="label">Analysis</p>
            <p class="mt-1.5 truncate text-sm font-medium text-accent">
                {{ chess.moveFeedback }}
            </p>
        </div>
        <!-- Review indicator cell -->
        <div v-if="chess.isReviewing" class="bg-bg-elevated px-4 py-3">
            <p class="label">Viewing</p>
            <p class="mt-1.5 truncate text-sm font-medium text-accent">
                Move {{ chess.viewCursor + 1 }}
            </p>
        </div>
    </div>
</template>
