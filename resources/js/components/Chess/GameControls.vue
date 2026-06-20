<script setup>
import { Flag, Play, RotateCcw } from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();
</script>

<template>
    <div
        class="board-size mt-5 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center"
    >
        <p class="meta">
            <span class="font-bold text-navy-950">{{
                chess.gameTurnLabel
            }}</span>
            <span class="mx-2 text-ink-faint">/</span>
            <span
                >You play
                {{ chess.playerColor === 'w' ? 'white' : 'black' }}</span
            >
        </p>

        <div class="flex items-center gap-2">
            <div
                class="segmented transition-opacity"
                :class="chess.configLocked && 'pointer-events-none opacity-40'"
            >
                <button
                    type="button"
                    :data-active="chess.playerColor === 'w'"
                    :disabled="chess.configLocked"
                    @click="chess.playerColor !== 'w' && chess.switchColor()"
                >
                    White
                </button>
                <button
                    type="button"
                    :data-active="chess.playerColor === 'b'"
                    :disabled="chess.configLocked"
                    @click="chess.playerColor !== 'b' && chess.switchColor()"
                >
                    Black
                </button>
            </div>

            <button
                v-if="chess.gamePhase === 'lobby'"
                class="btn btn--primary"
                type="button"
                @click="chess.startGame()"
            >
                <Play class="h-3.5 w-3.5" :stroke-width="2" />
                Start game
            </button>

            <template v-else-if="chess.gamePhase === 'playing'">
                <button
                    class="btn btn--ghost"
                    type="button"
                    @click="chess.resign()"
                >
                    <Flag class="h-3.5 w-3.5" :stroke-width="1.75" />
                    Resign
                </button>
            </template>

            <template v-else>
                <button
                    class="btn btn--primary"
                    type="button"
                    @click="chess.newGame()"
                >
                    <RotateCcw class="h-3.5 w-3.5" :stroke-width="2" />
                    New game
                </button>
            </template>
        </div>
    </div>
</template>
