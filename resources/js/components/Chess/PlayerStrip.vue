<script setup>
import ChessPiece from '../ChessPiece.vue';
import PlayerClockCard from './PlayerClockCard.vue';

defineProps({
    name: { type: String, required: true },
    role: { type: String, default: '' },
    color: { type: String, required: true },
    active: { type: Boolean, default: false },
    clock: { type: Object, required: true },
    thinking: { type: Boolean, default: false },
    prompt: { type: Boolean, default: false },
    captured: { type: Array, default: () => [] },
    advantage: { type: Number, default: null },
});
</script>

<template>
    <div class="player-strip" :data-active="active">
        <div class="player-strip__identity">
            <div class="flex min-w-0 items-center gap-2">
                <span class="player-strip__side" :data-color="color" />
                <span class="player-strip__name" :title="name">{{ name }}</span>
            </div>
            <span class="player-strip__role">{{ role }}</span>

            <div v-if="captured.length" class="player-strip__captures">
                <span class="flex flex-wrap items-center">
                    <ChessPiece
                        v-for="(piece, index) in captured"
                        :key="`${piece.color}-${piece.type}-${index}`"
                        class="h-5 w-5"
                        :color="piece.color"
                        :type="piece.type"
                    />
                </span>
                <span v-if="advantage" class="num text-xs text-ink-muted">
                    +{{ advantage }}
                </span>
            </div>
        </div>

        <PlayerClockCard
            :name="name"
            :thinking="thinking"
            :prompt="prompt"
            v-bind="clock"
        />
    </div>
</template>
