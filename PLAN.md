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
- 
