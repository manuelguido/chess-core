import { Chess } from 'chess.js';

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const now = () => globalThis.performance?.now() ?? Date.now();
const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, value));
const finiteNumber = (value, fallback) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;
const coordinates = (uci) => ({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length === 5 ? { promotion: uci[4] } : {}),
});

function positionCommand(request) {
    const moves = request.moves ?? [];
    if (!Array.isArray(moves) || moves.some((move) => !UCI_MOVE.test(move))) {
        throw new Error('Invalid move history');
    }
    const replay = request.initialFen !== undefined || moves.length > 0;
    const position = new Chess(replay ? request.initialFen : request.fen);
    for (const move of moves) position.move(coordinates(move));
    if (!request.fen || position.fen() !== request.fen) {
        throw new Error('Move history does not match the requested position');
    }
    const base = replay
        ? request.initialFen
            ? `fen ${request.initialFen}`
            : 'startpos'
        : `fen ${request.fen}`;
    return `position ${base}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
}

/**
 * Serializes UCI searches on a persistent engine. A stopped search must emit
 * bestmove before any later position can start, because UCI replies have no ID.
 * The transport and output callbacks also allow testing against the real WASM.
 */
export class StockfishController {
    constructor({ send, onMessage, random = Math.random }) {
        this.send = send;
        this.onMessage = onMessage;
        this.random = random;
        this.options = new Map();
        this.configured = new Map();
        this.started = false;
        this.ready = false;
        this.failed = false;
        this.waitingReady = null;
        this.pending = null;
        this.preparing = null;
        this.active = null;
        this.gameId = undefined;
        this.hasGame = false;
    }

    handleMessage(message) {
        if (this.failed) return;
        try {
            if (message.type === 'cancel') {
                this.cancel();
                return;
            }
            if (message.type !== 'warmup') {
                this.cancel();
                this.pending = message;
            }
            if (!this.started) {
                this.started = true;
                this.send('uci');
            }
            this.pump();
        } catch (error) {
            this.fail(error);
        }
    }

    cancel() {
        this.pending = null;
        this.preparing = null;
        if (this.active && !this.active.cancelled) {
            this.active.cancelled = true;
            this.send('stop');
        }
    }

    setOption(name, value) {
        const option = this.options.get(name);
        if (!option) return;
        if (option.type === 'spin')
            value = Math.round(clamp(value, option.min, option.max));
        if (this.configured.get(name) === value) return;
        this.send(`setoption name ${name} value ${value}`);
        this.configured.set(name, value);
    }

    configureStrength(elo) {
        const native = this.options.get('UCI_Elo');
        const minimum = native?.min ?? 1320;
        const maximum = native?.max ?? 3190;
        const approximate = elo < minimum;
        this.setOption('UCI_LimitStrength', !approximate && elo < 3200);
        this.setOption('Skill Level', 20);
        if (!approximate)
            this.setOption('UCI_Elo', clamp(elo, minimum, maximum));
        // Stockfish's calibrated option starts at 1320. Lower labels are an
        // approximation: choose among analyzed candidates, with more mistakes
        // at lower settings, instead of selecting arbitrary legal moves.
        const weakness = clamp((minimum - elo) / (minimum - 800), 0, 1);
        this.setOption(
            'MultiPV',
            approximate ? 3 + Math.round(weakness * 5) : 1,
        );
        return approximate ? 50 + weakness * 250 : 0;
    }

    pump() {
        if (!this.ready || this.waitingReady || this.active || !this.pending)
            return;
        const request = this.pending;
        this.pending = null;
        try {
            const position = positionCommand(request);
            const elo = clamp(finiteNumber(request.elo, 1600), 800, 3200);
            const budget = Math.round(
                clamp(finiteNumber(request.timeBudgetMs, 750), 50, 1000),
            );
            const temperature = this.configureStrength(elo);
            if (!this.hasGame || this.gameId !== request.gameId) {
                this.send('ucinewgame');
                this.gameId = request.gameId;
                this.hasGame = true;
            }
            this.preparing = {
                request,
                position,
                budget,
                temperature,
                candidates: new Map(),
                depth: 0,
                nodes: 0,
            };
            this.waitingReady = 'search';
            this.send('isready');
        } catch (error) {
            this.pending = request;
            this.fail(error);
        }
    }

    handleLine(value) {
        if (this.failed || typeof value !== 'string') return;
        try {
            for (const line of value.split(/\r?\n/))
                this.processLine(line.trim());
        } catch (error) {
            this.fail(error);
        }
    }

    processLine(line) {
        const option = line.match(/^option name (.+?) type (\w+)(.*)$/);
        if (option) {
            this.options.set(option[1], {
                type: option[2],
                min: Number(option[3].match(/\bmin (-?\d+)/)?.[1] ?? 0),
                max: Number(option[3].match(/\bmax (-?\d+)/)?.[1] ?? 0),
            });
            return;
        }
        if (line === 'uciok') {
            this.setOption('Threads', 1);
            this.setOption('Hash', 16);
            this.setOption('Ponder', false);
            this.waitingReady = 'initial';
            this.send('isready');
            return;
        }
        if (line === 'readyok') {
            const waiting = this.waitingReady;
            this.waitingReady = null;
            if (waiting === 'initial') {
                this.ready = true;
                this.onMessage({ type: 'ready', engine: 'Stockfish 18 lite' });
            } else if (waiting === 'search' && this.preparing) {
                this.active = this.preparing;
                this.preparing = null;
                this.send(this.active.position);
                this.active.startedAt = now();
                this.onMessage({
                    type: 'searching',
                    id: this.active.request.id,
                    fen: this.active.request.fen,
                });
                this.send(`go movetime ${this.active.budget}`);
            }
            this.pump();
            return;
        }
        if (line.startsWith('info ') && this.active && !this.active.cancelled) {
            this.recordInfo(line);
            return;
        }
        if (line.startsWith('bestmove ') && this.active) {
            const search = this.active;
            if (!search.cancelled) {
                let uci = line.split(/\s+/)[1];
                if (uci !== '(none)' && uci !== '0000' && !UCI_MOVE.test(uci)) {
                    throw new Error('Stockfish returned an invalid move');
                }
                if (search.temperature && UCI_MOVE.test(uci))
                    uci = this.chooseCandidate(search) ?? uci;
                this.active = null;
                this.onMessage({
                    id: search.request.id,
                    fen: search.request.fen,
                    move: UCI_MOVE.test(uci) ? coordinates(uci) : null,
                    depth: search.depth,
                    nodes: search.nodes,
                    elapsedMs: Math.round(now() - search.startedAt),
                });
            } else this.active = null;
            this.pump();
        }
    }

    recordInfo(line) {
        const search = this.active;
        const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
        search.depth = Math.max(search.depth, depth);
        search.nodes = Math.max(
            search.nodes,
            Number(line.match(/\bnodes (\d+)/)?.[1] ?? 0),
        );
        if (!search.temperature) return;
        const pv = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)\b/);
        const score = line.match(/\bscore (cp|mate) (-?\d+)/);
        if (!pv || !score || /\b(?:lowerbound|upperbound)\b/.test(line)) return;
        const index = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
        const value = Number(score[2]);
        const centipawns =
            score[1] === 'cp'
                ? value
                : Math.sign(value) * (100000 - Math.min(Math.abs(value), 1000));
        if (!search.candidates.has(depth))
            search.candidates.set(depth, new Map());
        search.candidates
            .get(depth)
            .set(index, { uci: pv[1], score: centipawns });
        // Keep the last completed iteration when a time limit interrupts the
        // next one midway through its candidate list.
        for (const previous of search.candidates.keys()) {
            if (previous < depth - 1) search.candidates.delete(previous);
        }
    }

    chooseCandidate(search) {
        const groups = [...search.candidates.entries()].sort(
            ([depthA, a], [depthB, b]) => b.size - a.size || depthB - depthA,
        );
        if (!groups.length) return null;
        const candidates = [...groups[0][1].values()];
        const best = Math.max(...candidates.map(({ score }) => score));
        const weights = candidates.map(({ score }) =>
            Math.exp((score - best) / search.temperature),
        );
        let target =
            this.random() * weights.reduce((sum, weight) => sum + weight, 0);
        for (let index = 0; index < candidates.length; index++) {
            target -= weights[index];
            if (weights[index] > 0 && target <= 0) return candidates[index].uci;
        }
        return candidates[0].uci;
    }

    fail(error) {
        if (this.failed) return;
        this.failed = true;
        const request =
            this.pending ?? this.preparing?.request ?? this.active?.request;
        this.onMessage({
            type: 'error',
            ...(request ? { id: request.id, fen: request.fen } : {}),
            error: error instanceof Error ? error.message : String(error),
        });
    }

    dispose() {
        if (!this.failed && this.started) this.send('quit');
        this.failed = true;
        this.pending = null;
        this.preparing = null;
        this.active = null;
    }
}
