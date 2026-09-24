<script setup>
import { computed } from 'vue';
import PlayerStrip from './PlayerStrip.vue';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

// Clock order follows the board, including when playing black or flipping it.
const players = computed(() => {
    const colors = chess.boardFlipped ? ['w', 'b'] : ['b', 'w'];
    return colors.map((color) => {
        const mine = color === chess.playerColor;
        const balance = chess.materialBalance;
        const ahead = color === 'w' ? balance > 0 : balance < 0;
        const takenColor = color === 'w' ? 'b' : 'w';
        const taken = color === 'w' ? chess.capturedBlack : chess.capturedWhite;

        return {
            color,
            name: mine ? 'You' : (chess.activeProfile?.name ?? 'Engine'),
            role: `${color === 'w' ? 'White' : 'Black'} · ${mine ? 'Player' : 'Engine'}`,
            active:
                chess.gamePhase === 'playing' &&
                chess.engineReady &&
                chess.turn === color,
            clock: mine ? chess.playerClock : chess.opponentClock,
            thinking: !mine && chess.botThinking,
            prompt:
                mine &&
                chess.engineReady &&
                chess.gamePhase === 'playing' &&
                chess.isPlayerTurn &&
                !chess.botThinking &&
                !chess.isReviewing,
            captured: taken.map((type) => ({ color: takenColor, type })),
            advantage: ahead ? Math.abs(balance) : null,
        };
    });
});
</script>

<template>
    <section class="match-clocks" aria-label="Player clocks">
        <PlayerStrip
            v-for="player in players"
            :key="player.color"
            v-bind="player"
        />
    </section>
</template>
