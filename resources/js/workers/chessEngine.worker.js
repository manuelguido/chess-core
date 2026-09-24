import engineScriptAsset from 'stockfish/bin/stockfish-18-lite-single.js?url';
import engineWasmAsset from 'stockfish/bin/stockfish-18-lite-single.wasm?url';
import { StockfishController } from '../engine/stockfishController.js';
import { createStockfishBootstrap } from '../engine/stockfishBootstrap.js';

let runtime = null;
let runtimeUrl = null;
let loadTimeout = null;

function releaseRuntime() {
    clearTimeout(loadTimeout);
    runtime?.terminate();
    runtime = null;
    if (runtimeUrl) URL.revokeObjectURL(runtimeUrl);
    runtimeUrl = null;
}

const controller = new StockfishController({
    send: (command) => runtime.postMessage(command),
    onMessage: (message) => {
        if (message.type === 'ready') clearTimeout(loadTimeout);
        if (message.type === 'error') {
            console.error('Stockfish worker:', message.error);
            releaseRuntime();
        }
        self.postMessage(message);
    },
});

function loadRuntime() {
    if (runtime) return;
    const script = new URL(engineScriptAsset, import.meta.url).href;
    const wasm = new URL(engineWasmAsset, import.meta.url).href;
    // Stockfish's Emscripten runtime needs a classic worker. The tiny same-origin
    // bootstrap also permits Vite's development assets to live on another port.
    runtimeUrl = URL.createObjectURL(
        new Blob([createStockfishBootstrap(script)], {
            type: 'application/javascript',
        }),
    );
    runtime = new Worker(`${runtimeUrl}#${encodeURIComponent(wasm)}`);
    runtime.onmessage = ({ data }) => {
        if (data?.type === 'runtime-error') {
            controller.fail(new Error(data.error));
            return;
        }
        controller.handleLine(data);
    };
    runtime.onerror = (event) => {
        event.preventDefault();
        controller.fail(new Error(event.message || 'Stockfish could not load'));
    };
    runtime.onmessageerror = () =>
        controller.fail(new Error('Stockfish communication failed'));
    loadTimeout = setTimeout(() => {
        controller.fail(new Error('Stockfish took too long to load'));
    }, 15000);
}

self.onmessage = ({ data }) => {
    try {
        if (data.type === 'dispose') {
            controller.dispose();
            releaseRuntime();
            self.close();
            return;
        }
        if (data.type !== 'cancel') loadRuntime();
        controller.handleMessage(data);
    } catch (error) {
        controller.fail(error);
    }
};
