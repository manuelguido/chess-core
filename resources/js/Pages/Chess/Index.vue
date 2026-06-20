<script setup>
import { useChessStore } from '../../stores/useChessStore.js';
import { Head } from '@inertiajs/vue3';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { BrainCircuit, Crown, Settings2, X } from 'lucide-vue-next';
import ClockDisplay from '../../components/Chess/ClockDisplay.vue';
import ChessBoard from '../../components/Chess/ChessBoard.vue';
import GameConfigPanel from '../../components/Chess/GameConfigPanel.vue';
import GameControls from '../../components/Chess/GameControls.vue';
import GameSidebar from '../../components/Chess/GameSidebar.vue';

const props = defineProps({
    botProfiles: Array,
});

const chess = useChessStore();
chess.botProfiles = props.botProfiles;

const showConfigDrawer = ref(false);

const closeConfigDrawerOnEscape = (event) => {
    if (event.key === 'Escape') showConfigDrawer.value = false;
};

onMounted(() => {
    window.addEventListener('keydown', closeConfigDrawerOnEscape);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', closeConfigDrawerOnEscape);
});
</script>

<template>
    <Head title="Chess Core" />

    <main class="min-h-screen bg-bg-base text-ink">
        <div
            class="mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8 xl:px-10"
        >
            <header
                class="mb-5 flex flex-wrap items-center justify-between gap-4"
            >
                <div class="flex items-center gap-3">
                    <span
                        class="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-950 text-white shadow-1"
                    >
                        <Crown class="h-5 w-5" :stroke-width="1.75" />
                    </span>
                    <div class="flex flex-col gap-1 leading-tight">
                        <h1>Chess Core</h1>
                        <p class="meta hidden sm:block">
                            {{ chess.status }}
                        </p>
                    </div>
                </div>

                <div class="flex flex-wrap items-center justify-end gap-2">
                    <span class="pill pill--navy">
                        <BrainCircuit
                            class="h-3.5 w-3.5"
                            :stroke-width="1.75"
                        />
                        {{ chess.activeProfile?.name }}
                    </span>
                    <span class="pill num">{{ chess.elo }} ELO</span>
                </div>
            </header>

            <button
                type="button"
                class="btn btn--ghost mb-4 w-full xl:hidden"
                @click="showConfigDrawer = true"
            >
                <Settings2 class="h-4 w-4" :stroke-width="1.9" />
                Opponent & settings
            </button>

            <div
                class="grid flex-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[230px_minmax(0,1fr)_280px]"
            >
                <GameConfigPanel class="hidden xl:sticky xl:top-5 xl:block" />

                <section class="flex min-w-0 flex-col items-center">
                    <ClockDisplay class="mb-3" />
                    <ChessBoard />
                    <GameControls />
                </section>

                <GameSidebar class="lg:sticky lg:top-5" />
            </div>
        </div>

        <Teleport to="body">
            <div
                v-if="showConfigDrawer"
                class="fixed inset-0 z-50 bg-navy-950/24 backdrop-blur-[2px] xl:hidden"
                role="dialog"
                aria-modal="true"
                aria-label="Opponent and settings"
                @click.self="showConfigDrawer = false"
            >
                <aside
                    class="h-full w-full max-w-[340px] overflow-y-auto border-r border-line-soft bg-bg-surface shadow-2xl"
                >
                    <div
                        class="sticky top-0 z-10 flex items-center justify-between border-b border-line-soft bg-bg-surface/95 px-4 py-4 backdrop-blur"
                    >
                        <h2>Opponent & settings</h2>
                        <button
                            type="button"
                            class="icon-btn"
                            aria-label="Close opponent and settings"
                            @click="showConfigDrawer = false"
                        >
                            <X class="h-4 w-4" :stroke-width="2" />
                        </button>
                    </div>

                    <GameConfigPanel
                        class="!rounded-none !border-0 !shadow-none"
                    />
                </aside>
            </div>
        </Teleport>
    </main>
</template>
