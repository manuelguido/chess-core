# Chess Core

Chess Core is a single-player chess application focused on the feel of playing, reviewing, and managing a complete game in the browser. It includes a responsive board, legal move handling, clocks, captured material, move history, position review, and a configurable computer opponent.

The project is intentionally scoped to local play against a bot. It is not a multiplayer platform; it is a study in making a chess surface feel complete when the server mainly delivers the application shell.

## Gameplay

- Play a legal chess game against a configurable bot.
- Choose player color before the game starts.
- Start with 5+0 Blitz, choose from 11 Bullet/Blitz/Rapid/Classical presets, or set a custom time (1–180 minutes and 0–180 seconds of increment).
- See legal target squares, the last move, check state, captured material, material balance, and status text.
- Review previous positions through the move history without disturbing the live game.
- Start a new game or resign the current game.
- See both clocks together beside the board, with Moves, Captured, and Position panels. On smaller screens, the match panel and settings stack below the board.
- Hear synthesized move, capture, check, and game-end sounds generated through the Web Audio API.

## Game Model And Opponent

The rules of chess are handled by [`chess.js`](https://www.npmjs.com/package/chess.js). The main Pinia store keeps a single `Chess` instance for the live game and exposes the derived state needed by the UI:

- current board matrix
- legal targets for the selected piece
- move history and SAN notation
- FEN for the current and reviewed positions
- captured pieces
- clock state
- current phase: lobby, playing, or over
- bot-thinking state

The computer opponent is Stockfish 18 Lite, compiled to single-threaded WebAssembly by [`stockfish.js`](https://github.com/nmrugg/stockfish.js). Its approximately 7 MB engine runs in a dedicated worker behind a UCI controller. The lighter build keeps the initial download manageable and single-threading avoids requiring cross-origin isolation headers. It is loaded once in the lobby and stays warm across moves and rematches. Starting a game waits for engine readiness, so downloading or initializing the engine does not consume either player's clock.

Each move receives a `go movetime` search budget of 500–1000 ms, scaled with the selected strength (about 667 ms at the default 1600). The budget shrinks further under clock pressure. There are no extra artificial thinking delays. The interface stays responsive while Stockfish searches; the first download and initialization take additional time before the game starts. Actual response time also includes message delivery and device scheduling, so the budget is not a guaranteed end-to-end latency.

The strength slider defaults to 1600 and offers 800–3200 in steps of 100. The controller reads the engine's advertised `UCI_Elo` limits at startup (1320–3190 in the installed build). Within that range it uses Stockfish's native `UCI_LimitStrength` and `UCI_Elo` options. The 800–1300 settings are approximate beginner profiles: Stockfish evaluates several candidate moves and the controller selects among them with increasing preference for stronger moves as the slider rises. The 3200 setting disables strength limiting and uses the best move this build finds within its time budget. These labels are difficulty targets, not independently measured or guaranteed human ELO ratings; this Lite build is also not equivalent to an unrestricted full desktop Stockfish search.

The store sends complete move history for repetition detection and validates the request ID, position and legality before applying any reply. Resetting or ending a game cancels pending work, and the controller drains a canceled search before starting another so late UCI results cannot enter a new game. A loading or search failure pauses the clocks and offers retry; it never substitutes a random move. Retry reloads the engine and resumes the same position.

## Project Shape

```text
app/Http/Controllers/ChessController.php
    Serves the Inertia page and bot profile metadata.

resources/js/Pages/Chess/Index.vue
    Top-level chess screen.

resources/js/stores/useChessStore.js
    Game state, move handling, clocks, history navigation, and worker lifecycle.

resources/js/engine/stockfishController.js
    UCI readiness, search serialization, cancellation, and strength settings.

resources/js/workers/chessEngine.worker.js
    Hosts the Stockfish WebAssembly worker off the UI thread.

resources/js/components/Chess/
    Board, controls, sidebars, settings, clock, captured pieces, and panels.

resources/js/composables/useChessSound.js
    Procedural Web Audio sounds for moves and game events.

tests/
    Framework smoke tests and JavaScript engine/game lifecycle regressions.
```

## Stack

| Layer    | Tools                                                        |
| -------- | ------------------------------------------------------------ |
| Backend  | Laravel 13, PHP 8.3+, Inertia Laravel                        |
| Frontend | Vue 3, Pinia, Vite, Tailwind CSS 4                           |
| Chess    | `chess.js`, Stockfish 18 Lite WebAssembly                    |
| UI       | lucide-vue-next                                              |
| Quality  | PHPUnit, Node.js test runner, Laravel Pint, ESLint, Prettier |

## Local Setup

Install PHP and JavaScript dependencies:

```bash
composer install
npm ci
```

Create the environment file and application key:

```bash
cp .env.example .env
php artisan key:generate
```

Configure the database connection in `.env`, then run migrations:

```bash
php artisan migrate
```

Start the local development stack:

```bash
composer dev
```

That Composer script runs Laravel, the queue listener, Laravel Pail, and Vite together through `concurrently`.

If you prefer separate processes:

```bash
php artisan serve
npm run dev
```

## Build

```bash
npm run build
```

## Tests And Checks

Run the Laravel test suite:

```bash
composer test
```

Run PHP style formatting:

```bash
composer lint
```

Run frontend checks and formatting:

```bash
npm test
npm run lint:check
npm run format:check
```

Apply frontend fixes:

```bash
npm run lint:fix
npm run format
```

## Implementation Notes

The game configuration is intentionally locked once a game starts. Bot strength, player color, and time control can be changed in the lobby, but not mid-game.

Move review is separate from the live board. The store replays SAN history into a temporary `Chess` instance to render reviewed positions, while the active game continues to own the true move state.

The board component owns pixel-level move animation because animation depends on measured square size. The store only emits the last played move.

Clock state is handled in the store with one interval. In timed games, the side to move loses when their clock reaches zero. Increment is applied after each committed move.

The game screen groups the board and match sidebar within one bounded workspace. `MatchClocks` resolves player identity and clock order from the board orientation; `AnalysisRail` owns move review, captures and FEN display; `GameActions` owns status and in-game controls. `TimeControlPicker` uses the shared presets and validation in `config/timeControls.js`.

## Known Boundaries

- There is no multiplayer mode.
- Games are not persisted to the database.
- Promotion always promotes to a queen.
- Bot strength depends on the device, Lite engine build and search budget; ELO labels remain uncalibrated.
- The first engine download and initialization must finish before a game starts.
- The displayed evaluation bar uses a lightweight material/position estimate, not Stockfish's search evaluation.

## Contributing

Keep changes focused on the chess experience. Good contributions usually fall into one of these areas:

- board interaction and accessibility
- move generation or review behavior
- bot evaluation and strength tuning
- tests around clock behavior, game lifecycle, and history navigation
- polishing responsive layout without changing the application contract

Before opening a pull request, run:

```bash
composer test
npm test
npm run lint:check
npm run format:check
npm run build
```

## License

Chess Core application code is open-sourced under the MIT license. See `LICENSE` for details. Stockfish is a separate GPL-3.0 engine; its [license](public/stockfish/COPYING.txt) and [source notice](public/stockfish/NOTICE.txt) are shipped in `public/stockfish/`. See the [Stockfish.js source repository](https://github.com/nmrugg/stockfish.js) for engine source and build instructions.
