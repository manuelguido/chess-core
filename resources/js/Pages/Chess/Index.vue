<script setup>
import { Head } from '@inertiajs/vue3';
import { useChessStore } from '../../stores/useChessStore.js';
import AppHeader from '../../components/Chess/AppHeader.vue';
import AnalysisRail from '../../components/Chess/AnalysisRail.vue';
import BoardStage from '../../components/Chess/BoardStage.vue';
import SetupRail from '../../components/Chess/SetupRail.vue';

const props = defineProps({
    botProfiles: Array,
});

const chess = useChessStore();
chess.botProfiles = props.botProfiles;
</script>

<template>
    <Head title="Chess Core" />

    <!--
        Console layout: at xl and up this is a fixed-height three-column
        shell that never scrolls the page — the rails scroll internally.
        Below xl it degrades to a single scrolling column with the board
        first, since a 268px rail plus a board does not fit side by side.
        The analysis rail comes second there so the clocks — which now live
        in that rail — stay just under the board instead of below a screen
        of setup controls.
    -->
    <div
        class="flex min-h-screen flex-col bg-bg-base text-ink xl:h-screen xl:overflow-hidden"
    >
        <AppHeader />

        <div
            class="flex flex-1 flex-col xl:grid xl:min-h-0 xl:grid-cols-[268px_minmax(0,1fr)_356px]"
        >
            <SetupRail
                class="order-3 border-t border-line xl:order-1 xl:overflow-y-auto xl:border-t-0 xl:border-r"
            />

            <main
                class="order-1 flex justify-center px-4 py-4 xl:order-2 xl:min-h-0 xl:items-stretch xl:px-6"
            >
                <BoardStage />
            </main>

            <AnalysisRail
                class="order-2 border-t border-line xl:order-3 xl:min-h-0 xl:overflow-hidden xl:border-t-0 xl:border-l"
            />
        </div>
    </div>
</template>
