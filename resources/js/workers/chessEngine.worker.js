import { chooseBotMove } from '../engine/chessEngine.js';

self.onmessage = ({ data }) => {
    const { id, fen } = data;
    try {
        self.postMessage({ id, ...chooseBotMove(data) });
    } catch (error) {
        self.postMessage({
            id,
            fen,
            error:
                error instanceof Error ? error.message : 'Engine search failed',
        });
    }
};
