<script setup>
import { useChessStore } from '../../stores/useChessStore.js';
import { Head } from '@inertiajs/vue3';
import { BrainCircuit, Crown } from 'lucide-vue-next';
import BotStrengthPanel from '../../components/Chess/BotStrengthPanel.vue';
import CapturedPanel from '../../components/Chess/CapturedPanel.vue';
import TimeControlPanel from '../../components/Chess/TimeControlPanel.vue';
import StatusStrip from '../../components/Chess/StatusStrip.vue';
import ClockDisplay from '../../components/Chess/ClockDisplay.vue';
import ChessBoard from '../../components/Chess/ChessBoard.vue';
import GameControls from '../../components/Chess/GameControls.vue';
import GameInfoPanel from '../../components/Chess/GameInfoPanel.vue';
import MoveHistoryPanel from '../../components/Chess/MoveHistoryPanel.vue';
import PositionPanel from '../../components/Chess/PositionPanel.vue';

const props = defineProps({
    botProfiles: Array,
});

const chess = useChessStore();
chess.botProfiles = props.botProfiles;
</script>

<template>
    <Head title="Chess Core" />

    <main class="min-h-screen bg-bg-base text-ink">
        <div
            class="mx-auto flex min-h-screen max-w-350 flex-col px-6 py-6 lg:px-10 lg:py-8"
        >
            <!-- Header -->
            <header
                class="flex flex-wrap items-center justify-between gap-4 pb-6"
            >
                <div class="flex items-center gap-3">
                    <span
                        class="flex h-9 w-9 items-center justify-center rounded-md border border-line-soft bg-bg-surface"
                    >
                        <Crown
                            class="h-4 w-4 text-accent"
                            :stroke-width="1.75"
                        />
                    </span>
                    <div class="flex flex-col leading-tight">
                        <h1>Chess Core</h1>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <span class="pill">
                        <BrainCircuit
                            class="h-3.5 w-3.5"
                            :stroke-width="1.75"
                        />
                        {{ chess.activeProfile?.name }}
                    </span>
                    <span class="pill pill--accent num"
                        >{{ chess.elo }} ELO</span
                    >
                </div>
            </header>

            <!-- 3-column grid -->
            <div
                class="grid flex-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)_280px]"
            >
                <!-- LEFT -->
                <aside class="order-2 flex flex-col gap-4 xl:order-1">
                    <BotStrengthPanel />
                    <TimeControlPanel />
                    <CapturedPanel />
                </aside>

                <!-- CENTER -->
                <section class="order-1 flex flex-col items-center xl:order-2">
                    <StatusStrip />
                    <ClockDisplay class="mb-2" />
                    <ChessBoard />
                    <GameControls />
                </section>

                <!-- RIGHT -->
                <aside class="order-3 flex flex-col gap-4">
                    <GameInfoPanel />
                    <MoveHistoryPanel />
                    <PositionPanel />
                </aside>
            </div>
        </div>
    </main>
</template>
