// This function is serialized into the classic worker: keep it self-contained.
function initializeStockfish(scriptUrl) {
    const instantiateStreaming =
        WebAssembly.instantiateStreaming?.bind(WebAssembly);

    // Some shared hosts serve .wasm as text/plain or application/octet-stream.
    // Stockfish's loader only uses streaming, which rejects those MIME types.
    // Keep streaming when supported, otherwise compile the same downloaded bytes.
    WebAssembly.instantiateStreaming = async (source, imports) => {
        const response = await source;
        if (!response.ok) {
            throw new Error(
                `Stockfish download failed: HTTP ${response.status}`,
            );
        }
        if (
            instantiateStreaming &&
            response.headers.get('Content-Type') === 'application/wasm'
        ) {
            return instantiateStreaming(response, imports);
        }
        return WebAssembly.instantiate(await response.arrayBuffer(), imports);
    };

    // Stockfish can reject its initialization promise without a worker error.
    // Report that failure immediately instead of leaving the UI waiting.
    self.addEventListener('unhandledrejection', (event) => {
        event.preventDefault();
        self.postMessage({
            type: 'runtime-error',
            error:
                event.reason instanceof Error
                    ? event.reason.message
                    : String(event.reason),
        });
    });

    importScripts(scriptUrl);
}

export function createStockfishBootstrap(scriptUrl) {
    return `(${initializeStockfish.toString()})(${JSON.stringify(scriptUrl)});`;
}
