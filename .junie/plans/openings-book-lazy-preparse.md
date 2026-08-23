---
sessionId: session-260823-175834-1lit
---

# Requirements

### Overview & Goals
Loading the openings book currently freezes the app because `OpeningsBook.loadKnownOpeningsData()` synchronously runs `chess.js` PGN parsing/legality-checking over ~2000 opening entries on the main thread. The goal is to eliminate that runtime cost and reduce the amount of data fetched/searched per game, per the previously agreed plan (pre-parse at build time + shard/lazy-load by first move).

### Scope
**In Scope**
- A build-time script that converts raw PGN opening entries into pre-parsed `sanMoves: string[]` arrays, so no `chess.js` parsing happens at runtime when loading the book.
- Re-sharding the openings data by the actual first move played (extending the existing `split-openings-by-first-move.mjs` output), so a given game only needs to fetch the shard(s) relevant to the moves actually played.
- Rewriting `OpeningsBook` to lazily fetch only the needed shard(s) as moves are played, instead of eagerly fetching+parsing all 7 files on first load.
- Updating the few call sites (`ChessReplay.tsx`, `ChessComLibraryAnalysis.ts`, `GameAnalysisSummary.ts`) to the new async-aware API where needed.

**Out of Scope**
- Web Worker offloading (not needed once parsing is removed from the runtime path).
- Changing the opening data source (`openings.csv`) or opening names/content.

### Functional Requirements
- Opening lookups (`getOpeningBySanMoves`, `isKnownMovePath`) must return the same results as today, just without blocking the main thread.
- The app must not freeze while the openings book loads or while new shards are fetched during a game.
- Games whose opening isn't in an already-loaded shard must still resolve correctly once the relevant shard is fetched on demand.


# Technical Design

### Current Implementation
- [OpeningsBook.ts](air-file://e7uglmrnlcb6ecbdini4/Users/vshefer/IdeaProjects/chess-analysis/client/src/lib/OpeningsBook.ts?type=file&root=%252F) eagerly fetches all 7 `openings-*.json` files (`OPENINGS_FILE_PATHS`, lines 20-28) via `Promise.all`, then synchronously runs `toMainlineMoves()` (chess.js-based PGN parsing, lines 142-176) over every entry to build `knownMovePathPrefixes` / `openingByMovePathPrefix`.
- [split-openings-by-first-move.mjs](air-file://e7uglmrnlcb6ecbdini4/Users/vshefer/IdeaProjects/chess-analysis/client/public/openings/split-openings-by-first-move.mjs?type=file&root=%252F) already reads `openings.csv` and shards raw `{name, pgn, epd}` entries into the 7 JSON files by first move(s) (e4-e5-nf3, e4-e5, e4-c5, e4-other, d4-d5, d4-other, other).
- Callers: `ChessReplay.tsx` calls `OpeningsBook.load()` in a `useQuery`, then `OpeningsBook.getOpeningBySanMoves(...)`. `ChessComLibraryAnalysis.ts` calls `OpeningsBook.load()` once before analyzing a batch of games. `GameAnalysisSummary.ts` calls the synchronous `OpeningsBook.isKnownMovePath(...)` per tree node.

### Key Decisions
1. **Pre-parse PGN into `sanMoves` at build time.** Extend `split-openings-by-first-move.mjs` (or add a companion script) to also parse each PGN into a move array using the existing `stripVariations`/`toMainlineMoves`-equivalent logic (moved into the script, using `chess.js` in Node — no browser cost), writing `{ name, sanMoves }` instead of `{ name, pgn }`. This removes 100% of runtime `chess.js` calls from `OpeningsBook`.
2. **Shard files by first move actually played, and load lazily.** Keep the existing 7-way sharding scheme (it already buckets by first move(s)); change `OpeningsBook` to not fetch anything until the first SAN move of the current game is known, then fetch only the matching shard(s), falling back to fetching the remaining shards only if a lookup isn't found (e.g. `other` bucket) or another opening family is needed later in a multi-game batch (`ChessComLibraryAnalysis`).
3. **API shape:** `getOpeningBySanMoves(sanMoves)` stays async and becomes the entry point for lazy shard resolution (it already receives the moves played, so it can pick the right shard by inspecting `sanMoves[0]`/`sanMoves[1]`). `isKnownMovePath` (used synchronously in `GameAnalysisSummary.ts`) will only reflect shards already loaded; `GameAnalysisSummary`/callers that need guaranteed-loaded data must call a new `OpeningsBook.ensureLoadedForMoves(sanMoves)` (async) before relying on the synchronous check, mirroring how `getOpeningBySanMoves` already awaits data.

### Proposed Changes
- **Build script** (`client/public/openings/build-openings.mjs` or extend `split-openings-by-first-move.mjs`): for each bucket, parse `pgn` -> `sanMoves` using `chess.js` in Node (reusing the `stripVariations`/fallback-tokenizer logic ported from `OpeningsBook.ts`), and write JSON entries as `{ name, sanMoves }`. Regenerate the 7 `openings-*.json` files with this new shape. Add an npm script (e.g. `"build:openings"`) in `client/package.json` to run it.
- **`OpeningsBook.ts` rewrite:**
  - `OpeningEntry`/on-disk shape becomes `{ name?: string; sanMoves?: string[] }`; remove `toMainlineMoves`, `tryParseMovesWithChess`, `tokenizeSanMoves`, `stripVariations`, and the `Chess` import entirely — pure array iteration only.
  - Replace the single `knownOpeningsDataPromise` cache with a per-shard cache: `shardDataByPath: Map<string, Promise<KnownOpeningsData>>` (or per-shard `KnownOpeningsData`), and a helper `resolveShardPathsForMoves(sanMoves): string[]` that maps `sanMoves[0]`/`sanMoves[1]` to the matching `OPENINGS_FILE_PATHS` entries (same bucket logic as the build script, kept in one shared place if practical, otherwise duplicated compactly since it's tiny).
  - `getKnownOpeningsData()` becomes `getKnownOpeningsDataForMoves(sanMoves)`: computes the needed shard path(s) and fetches+merges only those, caching per-shard results so repeated calls don't refetch.
  - `getOpeningBySanMoves(sanMoves)` calls `getKnownOpeningsDataForMoves(sanMoves)` instead of the old eager `getKnownOpeningsData()`.
  - `isKnownMovePath(sanMoves)` stays synchronous but only checks already-fetched shards (unchanged signature); add `ensureLoadedForMoves(sanMoves): Promise<void>` for callers needing guaranteed availability.
  - `load()` is removed or repurposed to just warm the most common `other`-independent shard set (or removed entirely if no caller needs an eager full-load); this needs deciding per caller below.
- **Caller updates:**
  - `ChessReplay.tsx`: remove the eager `OpeningsBook.load()` `useQuery` (or replace with a no-op / warm the current game's first-move shard once moves are known); rely on `getOpeningBySanMoves` to lazily fetch what's needed as the user navigates the game tree.
  - `ChessComLibraryAnalysis.ts`: replace `await OpeningsBook.load()` with per-game `await OpeningsBook.ensureLoadedForMoves(...)` (or just rely on `getOpeningBySanMoves` being called per game, since it already awaits the right shard).
  - `GameAnalysisSummary.ts`: before the `Object.values(tree).forEach` loop that calls `isKnownMovePath`, await `OpeningsBook.ensureLoadedForMoves` for the relevant move path(s) so the synchronous check has data loaded.

### File Structure
- Modified: [client/src/lib/OpeningsBook.ts](air-file://e7uglmrnlcb6ecbdini4/Users/vshefer/IdeaProjects/chess-analysis/client/src/lib/OpeningsBook.ts?type=file&root=%252F)
- Modified: [client/src/components/ChessReplay.tsx](air-file://e7uglmrnlcb6ecbdini4/Users/vshefer/IdeaProjects/chess-analysis/client/src/components/ChessReplay.tsx?type=file&root=%252F)
- Modified: [client/src/lib/ChessComLibraryAnalysis.ts](air-file://e7uglmrnlcb6ecbdini4/Users/vshefer/IdeaProjects/chess-analysis/client/src/lib/ChessComLibraryAnalysis.ts?type=file&root=%252F)
- Modified: [client/src/lib/GameAnalysisSummary.ts](air-file://e7uglmrnlcb6ecbdini4/Users/vshefer/IdeaProjects/chess-analysis/client/src/lib/GameAnalysisSummary.ts?type=file&root=%252F)
- New/Modified: openings build script under [client/public/openings/](air-file://e7uglmrnlcb6ecbdini4/Users/vshefer/IdeaProjects/chess-analysis/client/public/openings?type=directory&root=%252F), regenerating the 7 `openings-*.json` files with pre-parsed `sanMoves`.

### Risks
- Fallback/partial-parse PGNs (where `chess.js` couldn't fully parse and the legality-checked loop stopped early) must be handled identically in the build script as today's runtime fallback, or some openings could silently lose plies — verify by comparing generated `sanMoves` counts against current runtime output for a sample of entries.
- Lazy shard resolution must correctly fall back to the `other`/`*-other` shard when the first move(s) don't match a known bucket, otherwise some openings would never resolve.


# Testing

### Validation Approach
Since there's no existing automated test suite entry point identified for `OpeningsBook`, validation will be manual/scripted: compare pre-parse build output against current runtime parsing, and exercise the lazy-loading paths through the existing UI flows.

### Key Scenarios
- Run the build script and diff a sample of generated `sanMoves` arrays against the current runtime `toMainlineMoves()` output for the same PGNs (temporarily, during development) to confirm parity.
- Load [ChessReplay.tsx](air-file://e7uglmrnlcb6ecbdini4/Users/vshefer/IdeaProjects/chess-analysis/client/src/components/ChessReplay.tsx?type=file&root=%252F) with a game starting `1. e4 e5 2. Nf3` and confirm only the relevant shard(s) are fetched (via network panel / added logging) and the opening name still resolves correctly.
- Load a game starting with an uncommon first move (falls into an `other` bucket) and confirm it still resolves after the fallback shard fetch.
- Run a `ChessComLibraryAnalysis` batch over multiple games with different openings and confirm all resolve without needing to eagerly load all 7 shards upfront.

### Edge Cases
- Empty/malformed PGN entries in the source CSV should still produce an empty `sanMoves: []` in the build output, matching today's behavior of skipping them.
- Game with zero moves (`sanMoves.length === 0`) should not trigger any shard fetch.


# Delivery Steps

###   Step 1: Build the openings pre-parse script and regenerate shard JSON with sanMoves
The `openings-*.json` shard files under `client/public/openings/` contain pre-parsed `sanMoves` arrays instead of raw `pgn`, computed once at build time.
- Add a Node script under `client/public/openings/` (extending or complementing `split-openings-by-first-move.mjs`) that reads `openings.csv`, applies the existing PGN-to-moves logic (port `stripVariations`, `tokenizeSanMoves`, and the `chess.js` legality-checked fallback from `OpeningsBook.ts`) using `chess.js` in Node.
- Write each of the 7 shard files (`openings-other.json`, `openings-e4-e5-nf3.json`, `openings-e4-e5.json`, `openings-e4-c5.json`, `openings-e4-other.json`, `openings-d4-d5.json`, `openings-d4-other.json`) with entries shaped as `{ name, sanMoves }`.
- Add an npm script (e.g. `build:openings`) in `client/package.json` to run this script, and run it once to regenerate the committed shard files.

###   Step 2: Rewrite OpeningsBook to consume pre-parsed data with no runtime chess.js parsing
`OpeningsBook.ts` builds its lookup maps purely from pre-parsed `sanMoves` arrays, with all `chess.js` parsing removed from the runtime path.
- Update the `OpeningEntry` interface to `{ name?: string; sanMoves?: string[] }` and remove `toMainlineMoves`, `tryParseMovesWithChess`, `tokenizeSanMoves`, `stripVariations`, and the `Chess` import.
- Update `loadKnownOpeningsData`/entry processing to iterate `openingEntry.sanMoves` directly when building `knownMovePathPrefixes` and `openingByMovePathPrefix`.
- Update `Opening`/`toOpening` to no longer expose/rely on `pgn` (store `sanMoves` on the `Opening` result instead), and update `cloneOpening` accordingly.
- Keep `getOpeningBySanMoves` and `isKnownMovePath` signatures unchanged for now (still operating over the full merged dataset) so this stage is a drop-in, verified replacement before introducing lazy shard loading.

###   Step 3: Introduce per-first-move shard resolution and lazy fetching in OpeningsBook
`OpeningsBook` fetches only the shard(s) relevant to the moves played so far, instead of eagerly fetching+merging all 7 files on first load.
- Add `resolveShardPathsForMoves(sanMoves): string[]` implementing the same first-move/first-two-move bucket logic as the build script (e4-e5-nf3, e4-e5, e4-c5, e4-other, d4-d5, d4-other, other).
- Replace the single `knownOpeningsDataPromise`/`knownOpeningsData` cache with a per-shard cache (`Map<path, Promise<KnownOpeningsData>>`), and add `getKnownOpeningsDataForMoves(sanMoves)` that fetches+merges only the resolved shard(s), with a fallback fetch of the `other`/`*-other` bucket when a lookup misses.
- Update `getOpeningBySanMoves(sanMoves)` to call `getKnownOpeningsDataForMoves(sanMoves)`.
- Add `ensureLoadedForMoves(sanMoves): Promise<void>` for callers that need the synchronous `isKnownMovePath` check to have data available; keep `isKnownMovePath` synchronous, checking only already-loaded shards.

###   Step 4: Update callers to the lazy-loading API
`ChessReplay.tsx`, `ChessComLibraryAnalysis.ts`, and `GameAnalysisSummary.ts` no longer eagerly load the full openings book and instead rely on lazy, per-move shard loading.
- In `ChessReplay.tsx`, remove the eager `OpeningsBook.load()` `useQuery` block; rely on the existing `OpeningsBook.getOpeningBySanMoves(...)` call (already present) to lazily fetch what's needed as the game is navigated.
- In `ChessComLibraryAnalysis.ts`, replace the single upfront `await OpeningsBook.load()` with per-game `await OpeningsBook.ensureLoadedForMoves(...)` (or rely on `getOpeningBySanMoves` being awaited per game) before/while analyzing each game's moves.
- In `GameAnalysisSummary.ts`, before the `Object.values(tree).forEach` loop that calls `OpeningsBook.isKnownMovePath`, await `OpeningsBook.ensureLoadedForMoves` for the move paths that will be checked so the synchronous lookup has its shard already loaded.
- Verify manually that the app no longer freezes on load and openings still resolve correctly for common and uncommon openings.