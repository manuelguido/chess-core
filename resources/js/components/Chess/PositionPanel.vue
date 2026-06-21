<script setup>
import { useChessStore } from '../../stores/useChessStore.js';

const chess = useChessStore();
</script>

<template>
    <section class="panel fade-in p-5">
        <h2>Position</h2>
        <p
            class="panel-inner notation mt-3 p-3 text-[11px] leading-relaxed break-all text-ink-muted"
        >
            {{ chess.viewFen }}
        </p>
    </section>
</template>
