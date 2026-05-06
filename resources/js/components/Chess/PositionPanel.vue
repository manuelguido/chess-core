<script setup>
import { useChessStore } from "../../stores/useChessStore.js";

const chess = useChessStore();
</script>

<template>
    <section class="panel p-5 fade-in">
        <h2>Position</h2>
        <p
            class="mt-3 panel-inner num break-all p-3 text-[11px] leading-relaxed text-ink-muted"
        >
            {{ chess.viewFen }}
        </p>
    </section>
</template>
