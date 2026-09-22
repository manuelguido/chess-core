<script setup>
import { computed } from 'vue';
import { useChessStore } from '../../stores/useChessStore.js';
import logoUrl from '../../../img/icon-1024.png';

const chess = useChessStore();

const phase = computed(() => {
    if (chess.gamePhase === 'playing') {
        return { label: 'LIVE', tone: 'bg-positive' };
    }
    if (chess.gamePhase === 'over') {
        return { label: 'ENDED', tone: 'bg-danger' };
    }
    return { label: 'LOBBY', tone: 'bg-ink-fainter' };
});
</script>

<template>
    <header
        class="flex h-13 shrink-0 items-center gap-3.5 border-b border-line bg-bg-panel px-3.5"
    >
        <div class="flex items-center gap-2.5">
            <img
                :src="logoUrl"
                alt=""
                class="h-[29px] w-[29px] rounded-md border border-line-strong bg-bg-hover object-contain p-0.5"
            />
            <div class="flex flex-col gap-0.5">
                <span
                    class="text-[12.5px] leading-none font-bold tracking-[0.15em]"
                >
                    CHESS CORE
                </span>
                <span
                    class="text-[8.5px] leading-none font-medium tracking-[0.2em] text-ink-fainter"
                >
                    COMPETITIVE TRAINING
                </span>
            </div>
        </div>

        <div class="hidden h-4.5 w-px bg-[#1E252E] sm:block" />

        <span class="badge ml-auto sm:ml-0">
            <span class="h-1.5 w-1.5 rounded-full" :class="phase.tone" />
            {{ phase.label }}
        </span>
    </header>
</template>
