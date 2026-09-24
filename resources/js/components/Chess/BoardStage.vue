<script setup>
import ChessBoard from './ChessBoard.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();
</script>

<template>
    <div class="board-stage">
        <div
            class="relative overflow-hidden rounded-xs border border-[#1C232B] bg-bg-hover"
            :title="`Evaluation ${chess.positionEval > 0 ? '+' : ''}${chess.positionEval}`"
        >
            <div
                class="absolute inset-x-0 bottom-0 bg-[#E4E7EB] transition-[height] duration-350 ease-out"
                :style="{ height: `${chess.evalPercent}%` }"
            />
            <div class="absolute inset-x-0 top-1/4 h-px bg-white/[0.07]" />
            <div class="absolute inset-x-0 top-1/2 h-px bg-accent/55" />
            <div class="absolute inset-x-0 top-3/4 h-px bg-white/[0.07]" />
        </div>

        <ChessBoard />
    </div>
</template>
