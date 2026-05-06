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
            <span>You play {{ chess.playerColor === "w" ? "white" : "black" }}</span>
        </p>

        <div class="flex items-center gap-2">
            <!-- Side selector — only interactive before the first move -->
            <div class="flex overflow-hidden rounded-md border border-line-soft">
                <button
                    type="button"
                    class="px-3 py-1.5 text-xs font-medium transition-colors duration-150"
                    :class="
                        chess.playerColor === 'w'
                            ? 'bg-bg-elevated text-ink'
                            : chess.canSwitchColor
                              ? 'bg-bg-surface text-ink-faint hover:text-ink'
                              : 'bg-bg-surface text-ink-faint opacity-40 cursor-not-allowed'
                    "
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
                            : chess.canSwitchColor
                              ? 'bg-bg-surface text-ink-faint hover:text-ink'
                              : 'bg-bg-surface text-ink-faint opacity-40 cursor-not-allowed'
                    "
                    @click="chess.playerColor !== 'b' && chess.switchColor()"
                >
                    ♚ Black
                </button>
            </div>

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
