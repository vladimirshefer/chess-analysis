### Total Game Estimate
Add Total Game Overview panel

### Player Accuracy
- Estimate total game accuracy by avg centipawn difference
- show this value to Total Game Estimate

### Game Complexity
- Estimate game complexity by avg (number of available captures / number of available moves)
- Separate for each player side.
- show this value to Total Game Estimate

### First implementation of a "Plan"
- When the move is on the board, get the engine evaluation and lines.
- Get the first line, show if on the board. if that piece moves on the board again in the same line of the engine, show it again.
- Do it with first 2 pieces to move on the board for each player side, draw it in diffeten colors.
- Example: Engine line says 
  - "White Knight to g5, Black Pawn to d5, White pawn e takes d, Black Knignt to a4, White Bishop to c3, Black Knight Takes c3"
  - draw this in different colors, taking only first 2 pieces of eash side - White Knight, White Pawn, Black Pawn, Black Knight.

### Move Hardness Estimate
- Compare estimate of the depth=4 with depth=max(e.g. 16+)
- If a low-depth estimate is better than a high-depth estimate, that means the move is a trap.
- If a high-depth estimate is better than a low-depth estimate, that means that move is a hard-to-find (maybe brilliant?) move.
- Potentially come up with the idea on how to explain it in human-understandable text.

### Live PGN Editor
- Should be updated when unknown moves made (expand the tree)
- Should be editable by user, edits are reflected on the board and the move-tree component.
- Should support user names and other pieces.
- Optional but cool: Support syntax highlight and autocomplete (when i write a move - suggest legal moves)

### Book Move Depth 22 Plan
Summary: All book moves are queued at depth 22; non-book behavior stays unchanged.
1. Add `BOOK_ANALYSIS_DEPTH = 22` in `client/src/components/ChessReplay.tsx` and reuse it in task scheduling.
2. In `buildAnalysisTasks`, detect book nodes by existing rules (known FEN or known move-path key) and force `minDepth` to `22`.
3. Keep queue/dedup/deep-analysis logic unchanged; validate book nodes show `d22` while non-book flow stays `12/16` + background behavior.

### Main Line Move Strip With PGN Marks
Summary: Add a compact horizontal main-line move strip with index-based navigation and native PGN move-mark annotations.
1. Build and persist annotated PGN in `ChessReplay`, including supported native marks only.
2. Add a dedicated `MoveLine` component that renders the main-line moves, highlights current move, and supports click navigation by index.
3. Resolve selected index using current position with ancestor fallback when user is in a variation.
4. Keep the line compact and horizontally scrollable with drag scrolling and no visible scrollbar.
5. Pull request: https://github.com/vladimirshefer/chess-analysis/pull/1
   TL;DR: Main-line move strip with PGN-native marks is implemented and tracked in PR #1.

### Imported PGN Analysis Priority
Summary: imported PGN first analyzes the whole imported line into separate state; current-position evaluation is `BACKGROUND`, so it runs only after imported nodes are done.
1. Add `ImportedLineAnalysisState` in `client/src/components/ChessReplay.tsx` with `importedPgn`, ordered `nodeIds`, `analysesByNodeId`, and `status`.
2. Change `importPgn()` and task scheduling so import starts one line-wide analysis pass first, while current selected-position evaluation stays lower priority instead of being hard-blocked.
3. Render imported-line nodes from imported analysis first, fall back to normal interactive analysis otherwise, and keep imported analysis separately saveable for future game-library storage.

### Imported PGN Non-Destructive Enrichment
Summary: Keep imported PGN as canonical editable full text; never delete imported content, only enrich it.
- [ ] In `ChessReplay`, make `fullPgn` the source of truth (use `setFullPgn`) and stop overwriting textarea from regenerated raw tree PGN.
- [ ] In `PortableGameNotation`, add non-destructive merge that keeps headers/comments/annotations and inserts missing tree SAN fragments before the result token.
- [ ] For added fragments, map engine marks to PGN suffixes only when supported (`!!`, `!`, `?!`, `?`, `??`) and skip unsupported marks.
