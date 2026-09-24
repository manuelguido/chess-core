import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';
import { createStockfishBootstrap } from '../../resources/js/engine/stockfishBootstrap.js';

const scriptUrl = 'https://chess.test/build/assets/stockfish.js';
const wasmUrl = 'https://chess.test/build/assets/stockfish.wasm';
const [engineScript, engineWasm] = await Promise.all([
    readFile(
        new URL(
            '../../node_modules/stockfish/bin/stockfish-18-lite-single.js',
            import.meta.url,
        ),
        'utf8',
    ),
    readFile(
        new URL(
            '../../node_modules/stockfish/bin/stockfish-18-lite-single.wasm',
            import.meta.url,
        ),
    ),
]);

function bootstrap(
    t,
    { mime = 'application/wasm', streaming = true, realEngine = false } = {},
) {
    const messages = [];
    const errors = [];
    const listeners = new Map();
    const timers = new Set();
    const waiters = new Set();
    const calls = { fetch: 0, streaming: 0, buffer: 0 };
    // The bootstrap patches WebAssembly only in its worker, never in Node's
    // shared global namespace or another test's engine.
    const wasmApi = Object.create(WebAssembly);
    wasmApi.instantiate = (...args) => {
        calls.buffer++;
        return WebAssembly.instantiate(...args);
    };
    wasmApi.instantiateStreaming = streaming
        ? (...args) => {
              calls.streaming++;
              return WebAssembly.instantiateStreaming(...args);
          }
        : undefined;

    const location = new URL(
        `blob:https://chess.test/engine#${encodeURIComponent(wasmUrl)}`,
    );
    const postMessage = (message) => {
        messages.push(message);
        for (const waiter of [...waiters]) {
            if (!waiter.matches(message)) continue;
            waiters.delete(waiter);
            clearTimeout(waiter.timeout);
            waiter.resolve(message);
        }
    };
    const context = vm.createContext({
        self: {
            location,
            postMessage,
            addEventListener: (type, listener) => listeners.set(type, listener),
        },
        location,
        postMessage,
        onmessage: null,
        console: {
            log: () => {},
            error: (...args) => errors.push(args.map(String).join(' ')),
        },
        WebAssembly: wasmApi,
        Response,
        Headers,
        ReadableStream,
        TextDecoder,
        TextEncoder,
        performance,
        fetch: async (url) => {
            assert.equal(url, wasmUrl);
            calls.fetch++;
            return new Response(engineWasm, {
                headers: { 'Content-Type': mime },
            });
        },
        setTimeout: (callback, delay) => {
            const timer = setTimeout(() => {
                timers.delete(timer);
                callback();
            }, delay);
            timers.add(timer);
            return timer;
        },
        clearTimeout,
        importScripts: (url) => {
            assert.equal(url, scriptUrl);
            if (realEngine) vm.runInContext(engineScript, context);
        },
    });
    t.after(() => {
        for (const timer of timers) clearTimeout(timer);
        for (const waiter of waiters) clearTimeout(waiter.timeout);
    });
    vm.runInContext(createStockfishBootstrap(scriptUrl), context);

    function waitFor(matches) {
        const existing = messages.find(matches);
        if (existing !== undefined) return Promise.resolve(existing);
        return new Promise((resolve, reject) => {
            const waiter = { matches, resolve };
            waiter.timeout = setTimeout(() => {
                waiters.delete(waiter);
                reject(
                    new Error(`Stockfish did not reply: ${errors.join('; ')}`),
                );
            }, 5000);
            waiters.add(waiter);
        });
    }

    return { context, wasmApi, messages, errors, listeners, calls, waitFor };
}

for (const { mime, streaming, expectedPath } of [
    { mime: 'text/plain', streaming: true, expectedPath: 'buffer' },
    {
        mime: 'application/octet-stream',
        streaming: true,
        expectedPath: 'buffer',
    },
    { mime: 'application/wasm', streaming: true, expectedPath: 'streaming' },
    { mime: 'application/wasm', streaming: false, expectedPath: 'buffer' },
]) {
    test(
        `real Stockfish loads and plays with ${mime}, streaming API ${streaming ? 'present' : 'absent'}`,
        { timeout: 10000 },
        async (t) => {
            const { context, calls, errors, waitFor } = bootstrap(t, {
                mime,
                streaming,
                realEngine: true,
            });
            context.onmessage({ data: 'uci' });
            await waitFor((line) => line === 'uciok');
            context.onmessage({ data: 'isready' });
            await waitFor((line) => line === 'readyok');
            context.onmessage({ data: 'position startpos' });
            context.onmessage({ data: 'go movetime 50' });
            const bestmove = await waitFor(
                (line) =>
                    typeof line === 'string' && line.startsWith('bestmove '),
            );
            const uci = bestmove.split(' ')[1];
            const game = new Chess();
            assert.doesNotThrow(() =>
                game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) }),
            );
            assert.equal(
                calls.fetch,
                1,
                'the fallback must reuse the downloaded response',
            );
            assert.equal(calls[expectedPath], 1);
            assert.equal(
                calls[expectedPath === 'buffer' ? 'streaming' : 'buffer'],
                0,
            );
            assert.deepEqual(errors, []);
        },
    );
}

test('bootstrap rejects unsuccessful HTTP responses before compiling', async (t) => {
    const { wasmApi, calls } = bootstrap(t);
    await assert.rejects(
        wasmApi.instantiateStreaming(
            new Response('Not found', { status: 404 }),
            {},
        ),
        /Stockfish download failed: HTTP 404/,
    );
    assert.equal(calls.streaming + calls.buffer, 0);
});

test('corrupt downloads remain errors for streaming and buffer compilation', async (t) => {
    for (const mime of ['text/plain', 'application/wasm']) {
        const { wasmApi } = bootstrap(t);
        await assert.rejects(
            wasmApi.instantiateStreaming(
                new Response('<html>Server error</html>', {
                    headers: { 'Content-Type': mime },
                }),
                {},
            ),
            WebAssembly.CompileError,
        );
    }
});

test('unhandled startup failures are forwarded immediately to the parent worker', (t) => {
    const { context, listeners, messages } = bootstrap(t);
    let prevented = 0;
    const error = vm.runInContext('new Error("WASM download failed")', context);
    for (const reason of [error, 'Connection lost']) {
        listeners.get('unhandledrejection')({
            reason,
            preventDefault: () => prevented++,
        });
    }
    assert.equal(prevented, 2);
    assert.deepEqual(
        messages.map(({ type, error }) => ({ type, error })),
        [
            { type: 'runtime-error', error: 'WASM download failed' },
            { type: 'runtime-error', error: 'Connection lost' },
        ],
    );
});
