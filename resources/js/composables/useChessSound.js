/**
 * useChessSound — Web Audio API synthesised chess piece sounds.
 *
 * No audio files required. Sounds are generated procedurally using
 * bandpass-filtered noise bursts (woody thud) and brief oscillator
 * tones (check / game-end alerts), inspired by lichess / chess.com.
 *
 * Usage:
 *   const { playForMove } = useChessSound();
 *   playForMove(chessJsMove);          // picks the right sound automatically
 */

let _ctx = null;

function getCtx() {
    if (!_ctx) {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Browsers suspend AudioContext until a user gesture; resume lazily.
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
}

/**
 * Short percussive "wood piece landing on board" noise burst.
 *
 * @param {number} vol   Peak gain (0–1)
 * @param {number} dur   Total duration in seconds
 * @param {number} freq  Bandpass centre frequency in Hz (lower = heavier)
 */
function woodThud(vol, dur, freq = 700) {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // White noise buffer
    const bufLen = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Bandpass gives a "resonant wood" character
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 1.2;

    // Low-pass rolls off harsh highs
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = freq * 1.8;

    // Fast exponential decay envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.65);

    src.connect(bp);
    bp.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);

    src.start(now);
    src.stop(now + dur);
}

/**
 * Brief sine-wave tone used for check and game-end notifications.
 *
 * @param {number} freq   Pitch in Hz
 * @param {number} vol    Peak gain (0–1)
 * @param {number} delay  Start offset from AudioContext.currentTime (seconds)
 * @param {number} dur    Duration in seconds
 */
function tone(freq, vol, delay, dur) {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const t = now + delay;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
}

/* ── Individual sounds ─────────────────────────────────────────────────── */

/** Quiet single thud — normal move. */
function playMove() {
    woodThud(1, 0.055, 700);
}

/** Two overlapping thuds — piece taken + capturer lands. */
function playCapture() {
    setTimeout(() => woodThud(0.8, 0.05, 700), 80);
}

/** Two quick ascending tones — check alert. */
function playCheck() {
    tone(660, 0.18, 0, 0.13);
    tone(880, 0.15, 0.11, 0.13);
}

/** Three descending tones — game over (checkmate or draw). */
function playGameEnd() {
    tone(880, 0.2, 0, 0.25);
    tone(698, 0.18, 0.19, 0.25);
    tone(523, 0.16, 0.38, 0.3);
}

/* ── Composable ─────────────────────────────────────────────────────────── */

export function useChessSound() {
    /**
     * Play the appropriate sound for a chess.js verbose move object.
     * Pass `gameOver = true` when the position is already game-over after
     * the move (handles stalemate / draw cases that have no '#' in SAN).
     *
     * @param {object}  move      chess.js move (verbose)
     * @param {boolean} gameOver  true if game.isGameOver() after this move
     */
    const playForMove = (move, gameOver = false) => {
        if (gameOver || move.san.includes("#")) {
            playGameEnd();
            return;
        }
        if (move.san.includes("+")) {
            playCheck();
            return;
        }
        if (move.captured) {
            playCapture();
            return;
        }
        playMove();
    };

    return { playMove, playCapture, playCheck, playGameEnd, playForMove };
}
