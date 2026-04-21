## Total Game Estimate
Add Total Game Overview panel

### Player Accuracy
- Estimate total game accuracy by avg centipawn difference
- show this value to Total Game Estimate

### Game Complexity
- Estimate game complexity by avg (number of available captures / numebr of available moves)
- Separate for each player side.
- show this value to Total Game Estimate

## Other ideas

### Fix brilliant move marking to mean "Sacrifice"
- That means giving up the material, with (almost) no loss in evaluation.

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

### Multiple parallel engine workers
- We could analyze multiple positions at once with spawning more stockfish workers.

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

### EngineEvaluation -> AbsoluteNumericEvaluation (Research Plan)
1. Replace `EngineEvaluation` in core engine contracts (`ChessEngineLine`, `FullMoveEvaluation`, cache interface) with `AbsoluteNumericEvaluation`.
2. Update `NativeChessEngine`/`CachedChessEngine`/`PersistentChessEngine` flow to produce, pass, persist, and hydrate only numeric evaluations (drop object<->number conversion bridges).
3. Refactor `EvaluationThermometer` and `ChessReplay` call sites to use numeric formatting/parsing helpers from `Evaluations` only.
4. Simplify `evaluation.ts`: remove `EngineEvaluation`, `parseEngineEvaluation`, `getTerminalEvaluation`, `evalToNum`, and `absoluteNumericEvaluationToEngineEvaluation`; keep numeric-first helpers.
   TL;DR: migrate to one canonical eval type end-to-end (number), then clean old adapters/tests to eliminate dual-representation drift.
