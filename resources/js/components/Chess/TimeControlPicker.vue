<script setup>
import { computed, ref, watch } from 'vue';
import {
    customTimeControl,
    DEFAULT_TIME_CONTROL,
    TIME_PRESETS,
} from '../../config/timeControls.js';

const props = defineProps({
    control: { type: Object, default: null },
    locked: { type: Boolean, default: false },
});
const emit = defineEmits(['update:control']);

const matches = (preset) =>
    props.control?.base === preset.base &&
    props.control?.increment === preset.increment;
const customSelected = ref(!!props.control && !TIME_PRESETS.some(matches));
const minutes = ref(5);
const increment = ref(0);

function syncCustomFields() {
    const control = props.control ?? DEFAULT_TIME_CONTROL;
    minutes.value = control.base / 60;
    increment.value = control.increment;
}

watch(() => props.control, syncCustomFields, { immediate: true });

const customControl = computed(() =>
    customTimeControl(minutes.value, increment.value),
);

function selectPreset(preset) {
    if (props.locked) return;
    customSelected.value = false;
    emit('update:control', { base: preset.base, increment: preset.increment });
}

function selectCustom() {
    if (props.locked) return;
    syncCustomFields();
    customSelected.value = true;
}

function updateCustom() {
    if (!props.locked && customControl.value) {
        emit('update:control', customControl.value);
    }
}

function restoreInvalidFields() {
    if (!customControl.value) syncCustomFields();
}
</script>

<template>
    <fieldset class="time-picker" :disabled="locked">
        <legend class="time-picker__legend">Time control</legend>
        <div class="time-picker__presets">
            <button
                v-for="preset in TIME_PRESETS"
                :key="preset.label"
                type="button"
                class="time-preset"
                :aria-pressed="!customSelected && matches(preset)"
                :aria-label="`${preset.label} ${preset.category}`"
                @click="selectPreset(preset)"
            >
                <span class="time-preset__value num">{{ preset.label }}</span>
                <span class="time-preset__category">{{ preset.category }}</span>
            </button>
            <button
                type="button"
                class="time-preset time-preset--custom"
                :aria-pressed="customSelected"
                :aria-expanded="customSelected"
                aria-controls="custom-time-control"
                @click="selectCustom"
            >
                <span>Custom</span>
                <span class="time-preset__category">Your pace</span>
            </button>
        </div>

        <div
            v-if="customSelected"
            id="custom-time-control"
            class="time-picker__custom"
        >
            <div class="time-picker__fields">
                <label>
                    <span>Minutes</span>
                    <input
                        v-model.number="minutes"
                        type="number"
                        min="1"
                        max="180"
                        step="1"
                        required
                        inputmode="numeric"
                        aria-describedby="custom-time-help"
                        @input="updateCustom"
                        @blur="restoreInvalidFields"
                    />
                </label>
                <label>
                    <span>Increment (sec)</span>
                    <input
                        v-model.number="increment"
                        type="number"
                        min="0"
                        max="180"
                        step="1"
                        required
                        inputmode="numeric"
                        aria-describedby="custom-time-help"
                        @input="updateCustom"
                        @blur="restoreInvalidFields"
                    />
                </label>
            </div>
            <p
                id="custom-time-help"
                class="time-picker__help"
                :class="{ 'time-picker__help--invalid': !customControl }"
                aria-live="polite"
            >
                {{
                    customControl
                        ? 'Extra seconds are added after each move.'
                        : 'Use 1–180 minutes and 0–180 seconds.'
                }}
            </p>
        </div>
    </fieldset>
</template>

<style scoped>
.time-picker {
    min-width: 0;
    padding: 0;
    border: 0;
}

.time-picker__legend {
    margin-bottom: 10px;
    color: var(--color-ink-muted);
    font-size: 13px;
}

.time-picker__presets {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
}

.time-preset {
    display: flex;
    min-height: 54px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 7px 2px;
    border: 1px solid var(--color-line-strong);
    border-radius: 6px;
    background: var(--color-bg-raised);
    color: var(--color-ink-mild);
    cursor: pointer;
    transition:
        background 120ms,
        border-color 120ms,
        color 120ms;
}

.time-preset__value {
    font-size: 17px;
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.035em;
}

.time-preset__category {
    color: var(--color-ink-soft);
    font-size: 10px;
    line-height: 1.2;
}

.time-preset--custom {
    font-size: 13px;
    font-weight: 600;
}

.time-preset:hover:not(:disabled) {
    border-color: var(--color-line-hover);
    background: var(--color-bg-hover);
}

.time-preset[aria-pressed='true'] {
    border-color: var(--color-accent);
    background: var(--color-accent-wash);
    color: var(--color-accent-hover);
    box-shadow: inset 0 0 0 1px var(--color-accent-edge);
}

.time-preset[aria-pressed='true'] .time-preset__category {
    color: var(--color-accent);
}

.time-picker:disabled .time-preset {
    cursor: not-allowed;
    opacity: 0.55;
}

.time-picker:disabled .time-preset[aria-pressed='true'] {
    opacity: 1;
}

.time-picker__custom {
    margin-top: 12px;
}

.time-picker__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.time-picker__fields label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
    color: var(--color-ink-muted);
    font-size: 11px;
}

.time-picker__fields input {
    width: 100%;
    min-height: 36px;
    padding: 6px 8px;
    border: 1px solid var(--color-line-strong);
    border-radius: 5px;
    background: var(--color-bg-inset);
    color: var(--color-ink);
    font-size: 14px;
}

.time-picker__fields input:invalid {
    border-color: var(--color-danger);
}

.time-picker__help {
    margin: 8px 0 0;
    color: var(--color-ink-soft);
    font-size: 11px;
    line-height: 1.45;
}

.time-picker__help--invalid {
    color: var(--color-danger);
}
</style>
