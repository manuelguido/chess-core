<script setup>
import { Flag, Play, RotateCcw } from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();
</script>

<template>
    <div class="mt-5 flex w-full max-w-180 items-center justify-between gap-3">
        <p class="meta">
            <span class="text-ink">{{ chess.gameTurnLabel }}</span>
            <span class="mx-2 text-ink-faint">·</span>
            <span
                >You play
                {{ chess.playerColor === 'w' ? 'white' : 'black' }}</span
            >
        </p>

        <div class="flex items-center gap-2">
            <!-- Side selector — only interactive in lobby -->
            <div
                class="flex overflow-hidden rounded-md border border-line-soft transition-opacity"
                :class="chess.configLocked && 'pointer-events-none opacity-40'"
            >
                <button
                    type="button"
                    class="px-3 py-1.5 text-xs font-medium transition-colors duration-150"
                    :class="
                        chess.playerColor === 'w'
                            ? 'bg-bg-elevated text-ink'
                            : 'bg-bg-surface text-ink-faint hover:text-ink'
                    "
                    :disabled="chess.configLocked"
                    @click="chess.playerColor !== 'w' && chess.switchColor()"
                >
                    ♔ White
                </button>
                <button
                    type="button"
                    class="border-l border-line-soft px-3 py-1.5 text-xs font-medium transition-colors duration-150"
                    :class="
                        chess.playerColor === 'b'
                            ? 'bg-bg-elevated text-ink'
                            : 'bg-bg-surface text-ink-faint hover:text-ink'
                    "
                    :disabled="chess.configLocked"
                    @click="chess.playerColor !== 'b' && chess.switchColor()"
                >
                    ♚ Black
                </button>
            </div>

            <!-- Lobby: Start Game -->
            <button
                v-if="chess.gamePhase === 'lobby'"
                class="btn btn--primary"
                type="button"
                @click="chess.startGame()"
            >
                <Play class="h-3.5 w-3.5" :stroke-width="2" />
                Start game
            </button>

            <!-- Playing: Resign -->
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

            <!-- Over: New Game -->
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
