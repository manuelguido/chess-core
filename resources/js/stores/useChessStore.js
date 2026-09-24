import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { useChessSound } from '../composables/useChessSound.js';
import {
    DEFAULT_TIME_CONTROL,
    isValidTimeControl,
} from '../config/timeControls.js';

const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const centerSquares = new Set(['d4', 'e4', 'd5', 'e5']);
const extendedCenterSquares = new Set([
    'c3',
    'd3',
    'e3',
    'f3',
    'c4',
    'f4',
    'c5',
    'f5',
    'c6',
    'd6',
    'e6',
    'f6',
]);

/* ------------------------------------------------------------------ */
/* Opening book — longest SAN prefix wins                              */
/* ------------------------------------------------------------------ */
const OPENINGS = [
    ['e4 e5 Nf3 Nc6 Bb5 a6', 'C70', 'Ruy López · Morphy Defence'],
    ['e4 e5 Nf3 Nc6 Bb5', 'C60', 'Ruy López'],
    ['e4 e5 Nf3 Nc6 Bc4', 'C50', 'Italian Game'],
    ['e4 e5 Nf3 Nc6', 'C44', "King's Knight Opening"],
    ['e4 e5 Nf3', 'C40', "King's Knight Opening"],
    ['e4 e5', 'C20', 'Open Game'],
    ['e4 c5', 'B20', 'Sicilian Defence'],
    ['e4 e6', 'C00', 'French Defence'],
    ['e4 c6', 'B10', 'Caro-Kann Defence'],
    ['e4 d5', 'B01', 'Scandinavian Defence'],
    ['e4 Nf6', 'B02', 'Alekhine Defence'],
    ['e4 d6', 'B07', 'Pirc Defence'],
    ['e4', 'B00', "King's Pawn Opening"],
    ['d4 d5 c4', 'D06', "Queen's Gambit"],
    ['d4 Nf6 c4', 'E00', 'Indian Game'],
    ['d4 d5', 'D00', "Queen's Pawn Game"],
    ['d4 Nf6', 'A45', 'Indian Defence'],
    ['d4 f5', 'A80', 'Dutch Defence'],
    ['d4', 'A40', "Queen's Pawn Opening"],
    ['c4', 'A10', 'English Opening'],
    ['Nf3', 'A04', 'Réti Opening'],
    ['g3', 'A00', "King's Fianchetto Opening"],
    ['b3', 'A01', 'Nimzo-Larsen Attack'],
];

export const useChessStore = defineStore('chess', () => {
    const { playForMove } = useChessSound();

    /* ================================================================== */
    /* SECTION A — Configuration (editable only in lobby)                 */
    /* ================================================================== */
    const botProfiles = ref([]); // server props, display only

    /** 'lobby' | 'playing' | 'over' */
    const gamePhase = ref('lobby');

    const elo = ref(1600);
    const playerColor = ref('w');

    /**
     * What the player *asked* for in the lobby: 'w' | 'b' | 'random'.
     * `playerColor` is the resolved side and is what the rest of the
     * store reasons about; 'random' is settled once, at startGame().
     */
    const colorPreference = ref('w');

    /**
     * Time control: base in seconds, increment in seconds.
     * null = untimed.
     */
    const timeControl = ref({ ...DEFAULT_TIME_CONTROL }); // 5+0 Blitz

    const configLocked = computed(() => gamePhase.value !== 'lobby');

    /* Assistance — display-only, safe to change mid-game. */
    const showHints = ref(true);
    const showCoords = ref(true);

    /**
     * Manual board-orientation override. `null` = follow the side you play,
     * which is the behaviour you want in every case except "let me look at
     * this from the other side for a moment".
     */
    const flipOverride = ref(null);

    const boardFlipped = computed(() =>
        flipOverride.value === null
            ? playerColor.value === 'b'
            : flipOverride.value,
    );

    const flipBoard = () => {
        flipOverride.value = !boardFlipped.value;
    };

    /* ================================================================== */
    /* SECTION B — Active game state                                       */
    /* ================================================================== */
    const game = shallowRef(new Chess());
    const board = ref(game.value.board());
    const selectedSquare = ref(null);
    const legalTargets = ref([]);
    const botThinking = ref(false);
    const engineState = ref('idle'); // idle | loading | ready | error
    const engineError = ref(null);
    const engineReady = computed(() => engineState.value === 'ready');
    const engineLoading = computed(
        () => engineState.value === 'idle' || engineState.value === 'loading',
    );
    const capturedWhite = ref([]);
    const capturedBlack = ref([]);
    const lastMove = ref(null);
    const moveFeedback = ref('Ready');

    /**
     * Why the game ended, when the reason is not visible on the board —
     * resignation or a flag fall. Checkmate and draws are read from the
     * position itself, so they leave this null.
     */
    const resultReason = ref(null);
    const positionFen = ref(game.value.fen());
    const currentMoveNumber = ref(game.value.moveNumber());

    // Full verbose history — needed for history navigation
    const fullHistory = ref([]); // array of { san, from, to, flags, color, fen }
    // Derived SAN list (kept for backward compat with existing UI)
    const moveHistory = computed(() => fullHistory.value.map((e) => e.san));

    /**
     * Written by `registerMove` every time a move is committed.
     * ChessBoard watches this to trigger its pixel-level slide animations.
     */
    const lastPlayedMove = ref(null);

    /**
     * A move queued while the engine is thinking: { from, to }. It is fired
     * the instant the engine replies, and silently dropped if the reply makes
     * it illegal. Only one is held at a time, as on every other chess site.
     */
    const premove = ref(null);

    const clearPremove = () => {
        premove.value = null;
    };

    /** Any exit from 'playing' — mate, resignation, flag — voids the queue. */
    watch(gamePhase, (phase) => {
        if (phase !== 'playing') premove.value = null;
    });

    /* ================================================================== */
    /* SECTION C — Clock state                                             */
    /* ================================================================== */
    const clocks = ref({ w: 0, b: 0 }); // seconds remaining
    let clockInterval = null;

    const _startClock = () => {
        if (!timeControl.value) return;
        if (clockInterval) return;
        clockInterval = setInterval(() => {
            if (gamePhase.value !== 'playing' || !engineReady.value)
                return _stopClock();
            const turn = game.value.turn();
            clocks.value[turn] = Math.max(0, clocks.value[turn] - 1);
            if (clocks.value[turn] === 0) _timeOut(turn);
        }, 1000);
    };

    const _stopClock = () => {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
    };

    const _applyIncrement = (color) => {
        if (!timeControl.value) return;
        clocks.value[color] += timeControl.value.increment;
    };

    const _timeOut = (color) => {
        _cancelBotMove();
        _stopClock();
        gamePhase.value = 'over';
        const reason =
            color === playerColor.value ? 'Time — you lost' : 'Time — you win!';
        moveFeedback.value = reason;
        resultReason.value = reason;
    };

    /* ================================================================== */
    /* SECTION D — History navigation                                      */
    /* ================================================================== */

    /**
     * Index of the move the user is currently *viewing*.
     * -1 = start position, fullHistory.length - 1 = live position.
     * null = tracking live (default).
     */
    const viewCursor = ref(null);

    const isReviewing = computed(
        () =>
            viewCursor.value !== null &&
            viewCursor.value < fullHistory.value.length - 1,
    );

    /**
     * Board tiles rendered by ChessBoard — either the live board or
     * the position reconstructed at viewCursor.
     */
    const viewBoard = computed(() => {
        if (
            viewCursor.value === null ||
            viewCursor.value === fullHistory.value.length - 1
        ) {
            return board.value;
        }
        // Replay up to cursor from initial position
        const tmp = new Chess();
        const moves = fullHistory.value.slice(0, viewCursor.value + 1);
        for (const m of moves) tmp.move(m.san);
        return tmp.board();
    });

    const viewFen = computed(() => {
        if (viewCursor.value === -1) return DEFAULT_POSITION;
        if (viewCursor.value === null || fullHistory.value.length === 0) {
            return positionFen.value;
        }
        return fullHistory.value[viewCursor.value]?.fen ?? positionFen.value;
    });

    /** Last move highlighted in the currently viewed position. */
    const viewLastMove = computed(() => {
        if (viewCursor.value === null) return lastMove.value;
        if (viewCursor.value < 0) return null;
        const entry = fullHistory.value[viewCursor.value];
        return entry ? { from: entry.from, to: entry.to } : null;
    });

    const goTo = (index) => {
        const clamped = Math.max(
            -1,
            Math.min(fullHistory.value.length - 1, index),
        );
        viewCursor.value =
            clamped === fullHistory.value.length - 1 ? null : clamped;
    };

    const returnToLive = () => {
        viewCursor.value = null;
    };
    const goToStart = () => {
        goTo(-1);
    };
    const goBack = () => {
        const cur = viewCursor.value ?? fullHistory.value.length - 1;
        goTo(cur - 1);
    };
    const goForward = () => {
        const cur = viewCursor.value ?? fullHistory.value.length - 1;
        goTo(cur + 1);
    };

    /* ================================================================== */
    /* SECTION E — Computed (game state)                                   */
    /* ================================================================== */
    const activeProfile = computed(() => {
        return (
            [...botProfiles.value].reverse().find((p) => elo.value >= p.elo) ??
            botProfiles.value[0]
        );
    });

    /**
     * Side to move on the live position. Reads through `positionFen` so it
     * re-evaluates on every committed move — `game` is a shallowRef whose
     * internals Vue cannot see.
     */
    const turn = computed(() => {
        positionFen.value;
        return game.value.turn();
    });

    const isPlayerTurn = computed(() => turn.value === playerColor.value);

    const isCheckmate = computed(() => {
        positionFen.value;
        return game.value.isCheckmate();
    });

    /**
     * White moves first, so only White can open a session with a board click.
     * 'random' is excluded on purpose: clicking a white piece would quietly
     * settle the draw, which is not what picking Random asked for.
     */
    const canStartByMoving = computed(
        () =>
            gamePhase.value === 'lobby' &&
            colorPreference.value === 'w' &&
            engineReady.value,
    );

    const canTakeback = computed(
        () =>
            gamePhase.value === 'playing' &&
            engineReady.value &&
            !botThinking.value &&
            isPlayerTurn.value &&
            fullHistory.value.length >= 2,
    );

    const status = computed(() => {
        positionFen.value;
        if (engineError.value) return engineError.value;
        if (engineLoading.value) return 'Loading engine…';
        if (gamePhase.value === 'lobby') return 'Not started';
        // Resignation and flag falls leave a perfectly playable position
        // behind, so they have to be reported before anything is read off
        // the board.
        if (resultReason.value) return resultReason.value;
        if (game.value.isCheckmate()) {
            return game.value.turn() === playerColor.value
                ? 'Checkmate — you lost'
                : 'Checkmate — you win!';
        }
        if (game.value.isDraw()) return 'Draw';
        if (game.value.isCheck()) {
            return game.value.turn() === playerColor.value
                ? 'You are in check'
                : 'Bot in check';
        }
        if (botThinking.value) return 'Bot thinking…';
        return game.value.turn() === playerColor.value
            ? 'Your move'
            : 'Bot to move';
    });

    const gameTurnLabel = computed(() => {
        positionFen.value;
        if (gamePhase.value === 'lobby') return 'Configure & start';
        if (resultReason.value) return resultReason.value;
        if (game.value.isCheckmate()) {
            return game.value.turn() === playerColor.value
                ? 'Bot wins by checkmate'
                : 'You win by checkmate';
        }
        if (game.value.isDraw()) return 'Game drawn';
        return game.value.turn() === 'w' ? 'White to move' : 'Black to move';
    });

    const materialBalance = computed(() => {
        const whiteLost = capturedWhite.value.reduce(
            (t, p) => t + pieceValues[p],
            0,
        );
        const blackLost = capturedBlack.value.reduce(
            (t, p) => t + pieceValues[p],
            0,
        );
        return Math.round(((blackLost - whiteLost) / 100) * 10) / 10;
    });

    /**
     * Static evaluation of the position on screen, in pawns, from white's
     * point of view. This lightweight material/centre/mobility readout is
     * independent of Stockfish's deeper move search.
     */
    const positionEval = computed(() => {
        const fen = viewFen.value;
        if (!fen) return 0;
        let probe;
        try {
            probe = new Chess(fen);
        } catch {
            return 0;
        }
        if (probe.isCheckmate()) return probe.turn() === 'w' ? -99 : 99;
        if (probe.isDraw()) return 0;
        return Math.round((evaluatePosition(probe) / 100) * 10) / 10;
    });

    /** Eval bar fill, 0-100, white's share of the bar. */
    const evalPercent = computed(() => {
        const clamped = Math.max(-8, Math.min(8, positionEval.value));
        return Math.max(4, Math.min(96, 50 + clamped * 5.75));
    });

    /**
     * Everything the clock cards need for one side, resolved in one place.
     * In the lobby there is no running clock yet, so the card previews the
     * configured base time instead of sitting at 0:00.
     */
    const _clockFor = (color) => {
        const timed = !!timeControl.value;
        const seconds = !timed
            ? null
            : gamePhase.value === 'lobby'
              ? timeControl.value.base
              : clocks.value[color];
        return {
            seconds,
            active:
                gamePhase.value === 'playing' &&
                engineReady.value &&
                turn.value === color,
            low: timed && seconds != null && seconds <= 30,
            fraction:
                timed && seconds != null ? seconds / timeControl.value.base : 1,
        };
    };

    const playerClock = computed(() => _clockFor(playerColor.value));
    const opponentClock = computed(() =>
        _clockFor(playerColor.value === 'w' ? 'b' : 'w'),
    );

    /** Longest matching opening prefix, or a "custom position" fallback. */
    const opening = computed(() => {
        const line = moveHistory.value.join(' ');
        const hit = OPENINGS.find((entry) => line.startsWith(entry[0]));
        return hit
            ? { eco: hit[1], name: hit[2] }
            : { eco: '—', name: 'Custom position' };
    });

    const movePairs = computed(() => {
        const history = moveHistory.value;
        const pairs = [];
        for (let i = 0; i < history.length; i += 2) {
            // whiteIdx / blackIdx: the index in fullHistory for cursor comparison
            pairs.push({
                number: i / 2 + 1,
                white: history[i],
                whiteIdx: i,
                black: history[i + 1] ?? '',
                blackIdx: i + 1 < history.length ? i + 1 : null,
            });
        }
        return pairs;
    });

    const flattenedBoard = computed(() => {
        const src = viewBoard.value;
        return src.flatMap((rank, rowIndex) =>
            rank.map((piece, fileIndex) => {
                const square = `${String.fromCharCode(97 + fileIndex)}${8 - rowIndex}`;
                return {
                    square,
                    piece,
                    rowIndex,
                    fileIndex,
                    dark: (rowIndex + fileIndex) % 2 === 1,
                };
            }),
        );
    });

    /**
     * Squares the board draws move markers on. Turning hints off hides the
     * markers only — the move itself is still validated by chess.js, so
     * playing without hints stays playable.
     */
    const legalTargetSet = computed(() =>
        showHints.value ? new Set(legalTargets.value) : new Set(),
    );

    const kingInCheckSquare = computed(() => {
        positionFen.value;
        // Only show check ring on live position
        if (isReviewing.value) return null;
        if (!game.value.isCheck()) return null;
        const turn = game.value.turn();
        for (const tile of flattenedBoard.value) {
            if (
                tile.piece &&
                tile.piece.type === 'k' &&
                tile.piece.color === turn
            )
                return tile.square;
        }
        return null;
    });

    /* ================================================================== */
    /* SECTION F — Internal helpers                                        */
    /* ================================================================== */
    const syncBoard = () => {
        board.value = game.value.board();
        positionFen.value = game.value.fen();
        currentMoveNumber.value = game.value.moveNumber();
    };

    /** Rebuild both captured lists from the move log (used after a takeback). */
    const _recomputeCaptured = () => {
        const white = [];
        const black = [];
        for (const entry of fullHistory.value) {
            if (!entry.captured) continue;
            if (entry.color === 'w') black.push(entry.captured);
            else white.push(entry.captured);
        }
        capturedWhite.value = white;
        capturedBlack.value = black;
    };

    const classifyMove = (move, side) => {
        if (move.san.includes('#'))
            return side === 'player'
                ? 'Checkmate landed'
                : 'Engine delivers mate';
        if (move.san.includes('+'))
            return side === 'player' ? 'Forcing check' : 'Bot creates pressure';
        if (move.captured)
            return side === 'player'
                ? 'Material captured'
                : 'Bot wins material';
        if (centerSquares.has(move.to))
            return side === 'player' ? 'Center control' : 'Bot contests center';
        return side === 'player' ? 'Position improved' : 'Bot develops';
    };

    const registerMove = (move, side) => {
        if (move.captured) {
            if (move.color === 'w') capturedBlack.value.push(move.captured);
            else capturedWhite.value.push(move.captured);
        }
        lastMove.value = { from: move.from, to: move.to };
        moveFeedback.value = classifyMove(move, side);
        fullHistory.value.push({
            san: move.san,
            from: move.from,
            to: move.to,
            flags: move.flags,
            color: move.color,
            promotion: move.promotion,
            // Recorded so a takeback can rebuild the captured lists exactly.
            captured: move.captured ?? null,
            fen: game.value.fen(),
        });
        // Keep view cursor tracking live
        viewCursor.value = null;
        lastPlayedMove.value = {
            from: move.from,
            to: move.to,
            flags: move.flags,
            color: move.color,
        };
        _applyIncrement(move.color);
        playForMove(move, game.value.isGameOver());
    };

    /* ================================================================== */
    /* SECTION G — Player / bot actions                                    */
    /* ================================================================== */
    let botWorker = null;
    let workerBootstrapUrl = null;
    let botWatchdog = null;
    let engineLoadTimer = null;
    let botRequestId = 0;
    let engineGameId = 0;
    let pendingBotRequest = null;

    const _releaseWorkerBootstrap = () => {
        if (workerBootstrapUrl) URL.revokeObjectURL(workerBootstrapUrl);
        workerBootstrapUrl = null;
    };

    const _cancelBotMove = () => {
        if (botWatchdog !== null) clearTimeout(botWatchdog);
        botWatchdog = null;
        pendingBotRequest = null;
        botThinking.value = false;
        // Keep the loaded WASM engine. It drains the stopped search before
        // accepting a new position, so old bestmoves cannot leak into a game.
        if (botWorker) {
            try {
                botWorker.postMessage({ type: 'cancel' });
            } catch {
                _failEngine();
            }
        }
    };

    const _failEngine = () => {
        if (botWatchdog !== null) clearTimeout(botWatchdog);
        if (engineLoadTimer !== null) clearTimeout(engineLoadTimer);
        botWatchdog = null;
        engineLoadTimer = null;
        pendingBotRequest = null;
        botWorker?.terminate();
        botWorker = null;
        _releaseWorkerBootstrap();
        botThinking.value = false;
        engineState.value = 'error';
        engineError.value = 'Engine unavailable. Retry to continue.';
        _stopClock();
    };

    const prepareEngine = () => {
        if (botWorker || engineReady.value) return;
        engineState.value = 'loading';
        engineError.value = null;
        try {
            let worker;
            if (import.meta.env?.DEV) {
                // Laravel and Vite use different ports in development. A
                // same-origin bootstrap can import Vite's module over CORS;
                // a direct cross-origin Worker constructor is forbidden.
                const entry = '../workers/chessEngine.worker.js';
                const url = new URL(entry, import.meta.url).href;
                workerBootstrapUrl = URL.createObjectURL(
                    new Blob([`import ${JSON.stringify(url)};`], {
                        type: 'application/javascript',
                    }),
                );
                worker = new Worker(workerBootstrapUrl, { type: 'module' });
            } else {
                worker = new Worker(
                    new URL(
                        '../workers/chessEngine.worker.js',
                        import.meta.url,
                    ),
                    { type: 'module' },
                );
            }
            botWorker = worker;
            engineLoadTimer = setTimeout(_failEngine, 15000);
            worker.onmessage = ({ data }) => {
                if (botWorker !== worker) return;
                if (data?.type === 'ready') {
                    _releaseWorkerBootstrap();
                    if (engineLoadTimer !== null) clearTimeout(engineLoadTimer);
                    engineLoadTimer = null;
                    engineState.value = 'ready';
                    engineError.value = null;
                    if (gamePhase.value === 'playing') {
                        _startClock();
                        if (game.value.turn() !== playerColor.value)
                            makeBotMove();
                    }
                    return;
                }
                if (data?.type === 'error' || data?.error) {
                    console.error('Chess engine failed:', data.error);
                    _failEngine();
                    return;
                }
                const active = pendingBotRequest;
                if (
                    !active ||
                    data?.id !== active.id ||
                    data?.fen !== active.fen
                )
                    return;
                if (data.type === 'searching') {
                    clearTimeout(botWatchdog);
                    botWatchdog = setTimeout(
                        _failEngine,
                        active.timeBudgetMs + 1000,
                    );
                } else {
                    _finishBotMove(active, data.move);
                }
            };
            const failed = (event) => {
                if (botWorker === worker) {
                    console.error('Chess engine worker failed:', event.message);
                    _failEngine();
                }
            };
            worker.onerror = failed;
            worker.onmessageerror = failed;
            worker.postMessage({ type: 'warmup' });
        } catch (error) {
            console.error('Chess engine could not start:', error);
            _failEngine();
        }
    };

    const retryEngine = () => {
        if (engineState.value === 'error') prepareEngine();
    };

    onScopeDispose(() => {
        _cancelBotMove();
        if (engineLoadTimer !== null) clearTimeout(engineLoadTimer);
        botWorker?.terminate();
        botWorker = null;
        _releaseWorkerBootstrap();
        _stopClock();
    });

    /**
     * Squares a piece could move to if it were already your turn.
     *
     * Derived by reloading the position with the side-to-move flipped, which
     * lets chess.js do the work. It is an approximation on purpose: it cannot
     * know what the engine is about to play, so a premove that only opens up
     * *because* of the engine's reply (sliding through a square it is about to
     * vacate, say) is not offered. Anything queued is re-checked for real
     * before it is played, so a wrong guess is discarded, never played.
     */
    const premoveTargets = (square) => {
        const parts = game.value.fen().split(' ');
        parts[1] = playerColor.value;
        parts[3] = '-'; // en passant depends on the reply; never premove it
        try {
            const probe = new Chess();
            probe.load(parts.join(' '), { skipValidation: true });
            return probe.moves({ square, verbose: true }).map((m) => m.to);
        } catch {
            return [];
        }
    };

    /** The rook is an alternate click target for a legal king castling move. */
    const castlingTarget = (tile) => {
        const rank = playerColor.value === 'w' ? '1' : '8';
        if (
            selectedSquare.value !== `e${rank}` ||
            game.value.get(selectedSquare.value)?.type !== 'k' ||
            tile.piece?.type !== 'r' ||
            tile.piece.color !== playerColor.value
        )
            return null;

        const target =
            tile.square === `h${rank}`
                ? `g${rank}`
                : tile.square === `a${rank}`
                  ? `c${rank}`
                  : null;
        // These destinations come from chess.js, including castling rights,
        // clear paths and checks. Premoves are checked again before playing.
        return legalTargets.value.includes(target) ? target : null;
    };

    /** Click/drop handling while the engine is on move: queue, don't play. */
    const _selectForPremove = (tile) => {
        const target = castlingTarget(tile) ?? tile.square;
        if (selectedSquare.value && legalTargets.value.includes(target)) {
            premove.value = { from: selectedSquare.value, to: target };
            clearSelection();
            return;
        }
        if (tile.piece?.color === playerColor.value) {
            selectedSquare.value = tile.square;
            legalTargets.value = premoveTargets(tile.square);
            return;
        }
        // Anywhere else cancels both the pick-up and any queued premove.
        clearSelection();
        clearPremove();
    };

    const selectSquare = (tile) => {
        // Picking up a white piece in the lobby starts the session, so the
        // first move doubles as "begin". Falls through to the normal path
        // below, which now passes, so the piece is selected in the same click.
        if (canStartByMoving.value && tile.piece?.color === 'w') startGame();

        // Ignore clicks while reviewing history, not playing, or game over
        if (
            isReviewing.value ||
            !engineReady.value ||
            gamePhase.value !== 'playing' ||
            game.value.isGameOver()
        )
            return;

        // Not your turn — the click queues a premove instead of moving.
        if (game.value.turn() !== playerColor.value) {
            _selectForPremove(tile);
            return;
        }

        if (botThinking.value) return;

        const castle = castlingTarget(tile);
        if (castle) {
            makePlayerMove(castle);
            return;
        }

        if (tile.piece?.color === playerColor.value) {
            selectedSquare.value = tile.square;
            legalTargets.value = game.value
                .moves({ square: tile.square, verbose: true })
                .map((m) => m.to);
            return;
        }

        if (!selectedSquare.value) return;
        makePlayerMove(tile.square);
    };

    /** Drop the current selection without moving. */
    const clearSelection = () => {
        selectedSquare.value = null;
        legalTargets.value = [];
    };

    const makePlayerMove = (target) => {
        // chess.js throws on an illegal move rather than returning null, so the
        // destination has to be vetted first. Checked against the raw
        // `legalTargets` list, never `legalTargetSet` — that one is empty when
        // move hints are switched off, which would block every move.
        if (!selectedSquare.value || !legalTargets.value.includes(target)) {
            clearSelection();
            return;
        }

        const move = game.value.move({
            from: selectedSquare.value,
            to: target,
            promotion: 'q',
        });
        registerMove(move, 'player');
        clearSelection();
        syncBoard();
        _handOverToBot();
    };

    /** Shared tail for any committed player move: end the game, or let the engine reply. */
    const _handOverToBot = () => {
        if (game.value.isGameOver()) {
            _cancelBotMove();
            gamePhase.value = 'over';
            _stopClock();
            return;
        }
        makeBotMove();
    };

    /**
     * Fire the queued premove, if the engine's reply left it legal.
     * Consumed either way — a premove never survives into a second turn.
     */
    const _tryPremove = () => {
        const queued = premove.value;
        premove.value = null;
        if (
            !queued ||
            gamePhase.value !== 'playing' ||
            game.value.turn() !== playerColor.value
        )
            return;

        // Re-checked against the position the engine actually left behind,
        // not the approximation the board offered when it was queued.
        const legal = game.value
            .moves({ square: queued.from, verbose: true })
            .some((m) => m.to === queued.to);
        if (!legal) return;

        const move = game.value.move({
            from: queued.from,
            to: queued.to,
            promotion: 'q',
        });
        registerMove(move, 'player');
        clearSelection();
        syncBoard();
        _handOverToBot();
    };

    const _isCurrentBotRequest = (request) =>
        request === pendingBotRequest &&
        gamePhase.value === 'playing' &&
        game.value.turn() !== playerColor.value &&
        game.value.fen() === request.fen;

    const _finishBotMove = (request, candidate) => {
        if (!_isCurrentBotRequest(request)) return;
        // A broken engine must be visible to the player, never silently
        // replaced by an arbitrary move that destroys the selected strength.
        const move = game.value
            .moves({ verbose: true })
            .find(
                (legal) =>
                    legal.from === candidate?.from &&
                    legal.to === candidate?.to &&
                    legal.promotion === candidate?.promotion,
            );
        if (!move) return _failEngine();
        if (botWatchdog !== null) clearTimeout(botWatchdog);
        botWatchdog = null;
        pendingBotRequest = null;
        const played = game.value.move(move);
        registerMove(played, 'bot');
        syncBoard();
        clearSelection();
        botThinking.value = false;
        if (game.value.isGameOver()) {
            _cancelBotMove();
            gamePhase.value = 'over';
            _stopClock();
            return;
        }
        _tryPremove();
    };

    const makeBotMove = () => {
        if (
            gamePhase.value !== 'playing' ||
            game.value.turn() === playerColor.value ||
            pendingBotRequest
        )
            return;
        if (!engineReady.value) {
            prepareEngine();
            return;
        }
        // Strength and thinking time are independent. Keep normal searches
        // between 500 and 1000ms, with a smaller allowance near flag fall.
        const normalBudget = Math.max(
            500,
            Math.min(1000, Math.round(500 + ((elo.value - 800) / 2400) * 500)),
        );
        const remaining = clocks.value[game.value.turn()];
        const timeBudgetMs = timeControl.value
            ? Math.max(50, Math.min(normalBudget, remaining * 50))
            : normalBudget;
        const request = {
            id: ++botRequestId,
            gameId: engineGameId,
            fen: game.value.fen(),
            moves: fullHistory.value.map(
                (move) => move.from + move.to + (move.promotion ?? ''),
            ),
            elo: elo.value,
            timeBudgetMs,
        };
        pendingBotRequest = request;
        botThinking.value = true;
        // Transport/stop-drain timeout. The actual search gets its own
        // watchdog only after Stockfish confirms it has started.
        botWatchdog = setTimeout(_failEngine, 2500);
        try {
            botWorker.postMessage(request);
        } catch {
            _failEngine();
        }
    };

    /* ================================================================== */
    /* SECTION H — Position display                                       */
    /* ================================================================== */

    /**
     * Static evaluation in centipawns, positive = better for white.
     * Used only for the displayed position; search runs in a worker.
     */
    const evaluatePosition = (position = game.value) => {
        if (position.isCheckmate())
            return position.turn() === 'w' ? -100000 : 100000;
        if (position.isDraw()) return 0;
        let score = 0;
        for (const tile of position.board().flat()) {
            if (!tile) continue;
            const bonus = centerSquares.has(tile.square)
                ? 18
                : extendedCenterSquares.has(tile.square)
                  ? 8
                  : 0;
            score +=
                (pieceValues[tile.type] + bonus) *
                (tile.color === 'w' ? 1 : -1);
        }
        score +=
            position.moves({ verbose: true }).length *
            (position.turn() === 'w' ? 1.5 : -1.5);
        return score;
    };

    /* ================================================================== */
    /* SECTION I — Game lifecycle                                          */
    /* ================================================================== */

    const _resetBoard = () => {
        _cancelBotMove();
        engineGameId++;
        _stopClock();
        game.value = new Chess();
        board.value = game.value.board();
        selectedSquare.value = null;
        legalTargets.value = [];
        capturedWhite.value = [];
        capturedBlack.value = [];
        lastMove.value = null;
        moveFeedback.value = 'Ready';
        resultReason.value = null;
        botThinking.value = false;
        lastPlayedMove.value = null;
        premove.value = null;
        fullHistory.value = [];
        viewCursor.value = null;
        flipOverride.value = null;
        syncBoard();
    };

    /** Go back to lobby — config becomes editable again. */
    const newGame = () => {
        _resetBoard();
        gamePhase.value = 'lobby';
    };

    /**
     * Start the game from lobby. Locks config, starts clocks,
     * and triggers bot opening move if player chose black.
     */
    const startGame = () => {
        if (gamePhase.value !== 'lobby') return;
        if (!engineReady.value) {
            prepareEngine();
            return;
        }
        // Reset board in case a previous game finished without newGame()
        _resetBoard();
        // Settle 'random' now, so the rest of the game has a concrete side.
        playerColor.value =
            colorPreference.value === 'random'
                ? Math.random() < 0.5
                    ? 'w'
                    : 'b'
                : colorPreference.value;
        // Init clocks
        if (timeControl.value) {
            clocks.value = {
                w: timeControl.value.base,
                b: timeControl.value.base,
            };
        }
        gamePhase.value = 'playing';
        moveFeedback.value = 'Game started';
        _startClock();
        if (playerColor.value === 'b') makeBotMove();
    };

    /** Resign ends the current game, puts into 'over' state. */
    const resign = () => {
        if (gamePhase.value !== 'playing') return;
        _cancelBotMove();
        _stopClock();
        gamePhase.value = 'over';
        moveFeedback.value = 'Resigned';
        resultReason.value = 'You resigned';
    };

    /**
     * Take back your last move together with the bot's reply, so the
     * position returns to the last point where it was your turn.
     */
    const takeback = () => {
        if (gamePhase.value !== 'playing') return;
        if (botThinking.value) return;
        if (!isPlayerTurn.value) return;
        if (fullHistory.value.length < 2) return;

        game.value.undo();
        game.value.undo();
        fullHistory.value = fullHistory.value.slice(0, -2);
        _recomputeCaptured();

        const last = fullHistory.value[fullHistory.value.length - 1];
        lastMove.value = last ? { from: last.from, to: last.to } : null;
        lastPlayedMove.value = null;
        clearSelection();
        clearPremove();
        viewCursor.value = null;
        moveFeedback.value = 'Move taken back';
        syncBoard();
    };

    /** Choose which side to play — only in lobby. 'w' | 'b' | 'random'. */
    const setColorPreference = (preference) => {
        if (gamePhase.value !== 'lobby') return;
        colorPreference.value = preference;
        // Show the board from the chosen side straight away; 'random' keeps
        // white's view until startGame() picks a side.
        playerColor.value = preference === 'random' ? 'w' : preference;
        flipOverride.value = null;
    };

    /** Set the time control — only in lobby. `null` = untimed. */
    const setTimeControl = (control) => {
        if (gamePhase.value !== 'lobby') return;
        if (control !== null && !isValidTimeControl(control)) return;
        timeControl.value = control === null ? null : { ...control };
    };

    /* ================================================================== */
    /* SECTION J — Public API                                              */
    /* ================================================================== */
    return {
        // Config
        botProfiles,
        elo,
        playerColor,
        colorPreference,
        timeControl,
        configLocked,
        showHints,
        showCoords,
        boardFlipped,
        // Phase
        gamePhase,
        // Active game
        board,
        selectedSquare,
        legalTargets,
        botThinking,
        engineReady,
        engineLoading,
        engineError,
        capturedWhite,
        capturedBlack,
        lastMove,
        moveFeedback,
        resultReason,
        moveHistory,
        fullHistory,
        positionFen,
        currentMoveNumber,
        lastPlayedMove,
        // Clocks
        clocks,
        // History navigation
        viewCursor,
        isReviewing,
        viewLastMove,
        viewFen,
        goTo,
        returnToLive,
        goToStart,
        goBack,
        goForward,
        // Computed
        activeProfile,
        status,
        gameTurnLabel,
        turn,
        isPlayerTurn,
        isCheckmate,
        canTakeback,
        canStartByMoving,
        materialBalance,
        positionEval,
        evalPercent,
        opening,
        playerClock,
        opponentClock,
        movePairs,
        flattenedBoard,
        legalTargetSet,
        kingInCheckSquare,
        // Actions
        selectSquare,
        clearSelection,
        premove,
        clearPremove,
        prepareEngine,
        retryEngine,
        newGame,
        startGame,
        resign,
        takeback,
        flipBoard,
        setColorPreference,
        setTimeControl,
    };
});
