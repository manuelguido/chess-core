<script setup>
import { Head } from '@inertiajs/vue3';
import { onMounted } from 'vue';
import { useChessStore } from '../../stores/useChessStore.js';
import AppHeader from '../../components/Chess/AppHeader.vue';
import AnalysisRail from '../../components/Chess/AnalysisRail.vue';
import BoardStage from '../../components/Chess/BoardStage.vue';
import GameActions from '../../components/Chess/GameActions.vue';
import MatchClocks from '../../components/Chess/MatchClocks.vue';
import SetupRail from '../../components/Chess/SetupRail.vue';

const props = defineProps({
    botProfiles: Array,
});

const chess = useChessStore();
chess.botProfiles = props.botProfiles;
onMounted(() => chess.prepareEngine());
</script>

<template>
    <Head title="Chess Core" />

    <div class="game-screen">
        <AppHeader />

        <div class="game-container game-layout">
            <SetupRail class="game-setup" />

            <main class="game-workspace" aria-label="Chess game">
                <BoardStage />

                <aside class="game-sidebar" aria-label="Game information">
                    <MatchClocks />
                    <AnalysisRail />
                    <GameActions />
                </aside>
            </main>
        </div>
    </div>
</template>
