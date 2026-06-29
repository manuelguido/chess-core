# Chess Core

Chess Core is a single-player chess application focused on the feel of playing, reviewing, and managing a complete game in the browser. It includes a responsive board, legal move handling, clocks, captured material, move history, position review, and a configurable computer opponent.

The project is intentionally scoped to local play against a bot. It is not a multiplayer platform; it is a study in making a chess surface feel complete when the server mainly delivers the application shell.

## Gameplay

- Play a legal chess game against a configurable bot.
- Choose player color before the game starts.
- Pick from preset time controls or define a custom base time and increment.
- Play untimed games.
- See legal target squares, the last move, check state, captured material, material balance, and status text.
- Review previous positions through the move history without disturbing the live game.
- Start a new game or resign the current game.
- Use a responsive board layout with a side panel on desktop and a settings drawer on smaller screens.
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

The computer opponent is implemented in `resources/js/stores/useChessStore.js`. It is a client-side heuristic minimax bot with alpha-beta pruning, material and center-control evaluation, and a temperature-based move picker. The strength slider maps to search depth, move randomness, simplicity bias, and occasional shallow searches so lower-strength play is less deterministic.

The ELO labels are UI tuning profiles, not measured ratings.

The `stockfish` package is present in `package.json`, but the current store does not wire Stockfish into move selection. The active opponent is the custom minimax implementation described above.

## Project Shape

```text
app/Http/Controllers/ChessController.php
    Serves the Inertia page and bot profile metadata.

resources/js/Pages/Chess/Index.vue
    Top-level chess screen.

resources/js/stores/useChessStore.js
    Game state, move handling, clocks, history navigation, and bot logic.

resources/js/components/Chess/
    Board, controls, sidebars, settings, clock, captured pieces, and panels.

resources/js/composables/useChessSound.js
    Procedural Web Audio sounds for moves and game events.

tests/
    Framework smoke tests; chess-specific coverage is not in place yet.
```

## Stack

| Layer | Tools |
| --- | --- |
| Backend | Laravel 13, PHP 8.3+, Inertia Laravel |
| Frontend | Vue 3, Pinia, Vite, Tailwind CSS 4 |
| Chess | `chess.js`, custom minimax bot |
| UI | lucide-vue-next |
| Quality | PHPUnit, Laravel Pint, ESLint, Prettier |

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

## Known Boundaries

- There is no multiplayer mode.
- Games are not persisted to the database.
- The current bot is not a UCI engine integration.
- Promotion always promotes to a queen.
- Chess-specific tests for clock behavior, move review, and game lifecycle would be the next useful addition.

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
npm run lint:check
npm run format:check
npm run build
```

## License

Chess Core is open-sourced under the MIT license. See `LICENSE` for details.
