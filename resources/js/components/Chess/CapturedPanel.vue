<script setup>
import { Swords } from "lucide-vue-next";
import ChessPiece from "../ChessPiece.vue";
import { useChessStore } from "../../stores/useChessStore.js";

const chess = useChessStore();
</script>

<template>
    <section class="panel p-5 fade-in">
        <div class="mb-4 flex items-center justify-between">
            <h2>Captured</h2>
            <Swords class="h-4 w-4 text-ink-faint" :stroke-width="1.5" />
        </div>

        <div class="space-y-3">
            <div class="panel-inner p-3">
                <p class="label">White lost</p>
                <div class="mt-2 flex min-h-9 flex-wrap items-center gap-1">
                    <span
                        v-for="(piece, index) in chess.capturedWhite"
                        :key="`w-${piece}-${index}`"
                        class="block h-7 w-7"
                    >
                        <ChessPiece color="w" :type="piece" />
                    </span>
                </div>
            </div>
            <div class="panel-inner p-3">
                <p class="label">Black lost</p>
                <div class="mt-2 flex min-h-9 flex-wrap items-center gap-1">
                    <span
                        v-for="(piece, index) in chess.capturedBlack"
                        :key="`b-${piece}-${index}`"
                        class="block h-7 w-7"
                    >
                        <ChessPiece color="b" :type="piece" />
                    </span>
                </div>
            </div>
        </div>
    </section>
</template>
