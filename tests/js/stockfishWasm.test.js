import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Chess } from 'chess.js';
import { StockfishController } from '../../resources/js/engine/stockfishController.js';

test(
    'the installed WASM engine plays legal moves and finds mates within short search budgets',
    { timeout: 15000 },
    async (t) => {
        const executable = fileURLToPath(
            new URL(
                '../../node_modules/stockfish/bin/stockfish-18-lite-single.js',
                import.meta.url,
            ),
        );
        const process = spawn(globalThis.process.execPath, [executable], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const lines = [];
        let stderr = '';
        const waiters = new Set();
        const controller = new StockfishController({
            send: (command) => process.stdin.write(`${command}\n`),
            onMessage(message) {
                for (const waiter of [...waiters]) {
                    if (!waiter.accepts(message)) continue;
                    waiters.delete(waiter);
                    clearTimeout(waiter.timeout);
                    waiter.resolve(message);
                }
            },
        });
        const output = createInterface({ input: process.stdout });
        output.on('line', (line) => {
            lines.push(line);
            controller.handleLine(line);
        });
        process.stderr.on('data', (data) => {
            stderr = (stderr + data.toString()).slice(-1000);
        });
        process.on('error', (error) => controller.fail(error));
        process.stdin.on('error', (error) => controller.fail(error));
        t.after(() => {
            for (const waiter of waiters) clearTimeout(waiter.timeout);
            output.close();
            process.kill();
        });

        function waitFor(accepts) {
            return new Promise((resolve, reject) => {
                const waiter = { accepts, resolve };
                waiter.timeout = setTimeout(() => {
                    waiters.delete(waiter);
                    reject(
                        new Error(
                            `Stockfish did not reply within 5 seconds: ${stderr}`,
                        ),
                    );
                }, 5000);
                waiters.add(waiter);
            });
        }

        const readiness = waitFor(
            (message) => message.type === 'ready' || message.type === 'error',
        );
        const loadingStarted = performance.now();
        controller.handleMessage({ type: 'warmup' });
        assert.equal((await readiness).type, 'ready', stderr);
        t.diagnostic(
            `Stockfish cold startup: ${Math.round(performance.now() - loadingStarted)} ms`,
        );
        const advertisedElo = lines.find((line) =>
            line.startsWith('option name UCI_Elo '),
        );
        assert.match(advertisedElo, /min 1320 max 3190/);
        t.diagnostic(advertisedElo);

        let id = 0;
        async function search(position, elo, timeBudgetMs) {
            const requestId = ++id;
            const response = waitFor(
                (message) =>
                    message.type === 'error' ||
                    (message.id === requestId && 'move' in message),
            );
            const started = performance.now();
            const fen = position.fen();
            controller.handleMessage({
                id: requestId,
                gameId: requestId,
                fen,
                initialFen: fen,
                moves: [],
                elo,
                timeBudgetMs,
            });
            const result = await response;
            assert.notEqual(result.type, 'error', result.error);
            const elapsed = performance.now() - started;
            // Includes engine readiness and process scheduling, with headroom for slow CI.
            assert.ok(
                elapsed < timeBudgetMs + 1500,
                `${timeBudgetMs} ms search took ${Math.round(elapsed)} ms`,
            );
            assert.ok(result.move, 'a playable position must produce a move');
            assert.doesNotThrow(() => position.move(result.move));
            assert.ok(result.nodes > 0);
            t.diagnostic(
                `ELO ${elo}, budget ${timeBudgetMs} ms: ${Math.round(elapsed)} ms, depth ${result.depth}, ${result.nodes} nodes, ${result.move.from}${result.move.to}${result.move.promotion ?? ''}`,
            );
            return result;
        }

        const middlegame = new Chess();
        for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'])
            middlegame.move(move);
        const position = middlegame.fen();
        await search(new Chess(position), 1600, 667);
        await search(new Chess(position), 3200, 1000);
        for (const fen of [
            '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
            '8/8/8/8/8/6k1/5q2/7K b - - 0 1',
        ]) {
            const mate = new Chess(fen);
            await search(mate, 3200, 500);
            assert.equal(mate.isCheckmate(), true);
        }
    },
);
