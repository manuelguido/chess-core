<script setup>
import { computed } from 'vue';
import { Check, CircleUserRound } from 'lucide-vue-next';
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();

const sortedProfiles = computed(() =>
    [...chess.botProfiles].sort((a, b) => a.elo - b.elo),
);
</script>

<template>
    <section
        class="panel fade-in p-4 sm:p-5"
        :class="chess.configLocked && 'opacity-60'"
    >
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
                <p class="eyebrow">Opponent</p>
                <h2 class="mt-2 text-xl sm:text-2xl">Choose your match</h2>
            </div>
            <div class="rounded-full bg-bg-elevated px-4 py-2 text-right">
                <p class="label">Rating</p>
                <p class="num text-lg font-bold text-navy-950">
                    {{ chess.elo }}
                </p>
            </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <button
                v-for="profile in sortedProfiles"
                :key="profile.elo"
                type="button"
                class="opponent-card"
                :data-active="chess.activeProfile?.elo === profile.elo"
                :disabled="chess.configLocked"
                @click="chess.elo = profile.elo"
            >
                <span class="flex items-start justify-between gap-3">
                    <span>
                        <span
                            class="block text-sm leading-snug font-bold text-inherit"
                        >
                            {{ profile.name }}
                        </span>
                        <span
                            class="meta mt-1 block text-xs"
                            :class="
                                chess.activeProfile?.elo === profile.elo
                                    ? 'text-white/70'
                                    : 'text-ink-muted'
                            "
                        >
                            {{ profile.elo }} ELO
                        </span>
                    </span>
                    <span
                        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                        :class="
                            chess.activeProfile?.elo === profile.elo
                                ? 'bg-white text-navy-950'
                                : 'bg-bg-elevated text-navy-700'
                        "
                    >
                        <Check
                            v-if="chess.activeProfile?.elo === profile.elo"
                            class="h-3.5 w-3.5"
                            :stroke-width="2.25"
                        />
                        <CircleUserRound
                            v-else
                            class="h-3.5 w-3.5"
                            :stroke-width="1.75"
                        />
                    </span>
                </span>
            </button>
        </div>
    </section>
</template>
