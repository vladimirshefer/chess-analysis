import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  EngineEvaluationPriority,
  getChessEngine,
  type ChessEngine,
  type ChessEngineLine,
  type EngineEvaluationPriority as EngineEvaluationPriorityValue,
  type EvaluationRequest,
  type FullMoveEvaluation,
} from '../lib/chessEngine';

interface MoveNode {
  id: string;
  san: string;
  fen: string;
  parentId: string | null;
  children: string[];
}

interface DisplayEngineLine {
  move: string;
  uci: string;
  pv: string;
  score: number;
  depth: number;
  multipv: number;
}

interface NodeAnalysis {
  fen: string;
  evaluation: number;
  depth: number;
  lines: DisplayEngineLine[];
  isFinal: boolean;
}

interface GameState {
  tree: Record<string, MoveNode>;
  currentNodeId: string | null;
  activeLineId: string | null;
  pgnInput: string;
}

interface AnalysisState {
  byNodeId: Record<string, NodeAnalysis>;
}

interface ViewState {
  statusText: string;
}

interface ScheduledTask {
  nodeId: string;
  request: EvaluationRequest;
  priority: EngineEvaluationPriorityValue;
}

const ChessReplay: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    tree: {},
    currentNodeId: null,
    activeLineId: null,
    pgnInput: '',
  });
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ byNodeId: {} });
  const [viewState, setViewState] = useState<ViewState>({ statusText: 'Interactive Mode' });

  const engineRef = useRef<ChessEngine | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const analysisSessionRef = useRef(0);

  useEffect(function syncGameStateRef() {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(function initEngine() {
    engineRef.current = getChessEngine();
  }, []);

  const fullTreePgn = useMemo(function buildFullTreePgn() {
    const roots = Object.values(gameState.tree).filter(function isRoot(node) {
      return node.parentId === null;
    });
    if (roots.length === 0) return '';

    let result = '';
    roots.forEach(function appendRoot(root, index) {
      result += (index === 0 ? '' : '(') +
        generatePgnString(root.id, 1, true, index !== 0, gameState.tree).trim() +
        (index === 0 ? ' ' : ') ');
    });
    return result.trim();
  }, [gameState.tree]);

  const visiblePath = useMemo(function buildVisiblePath() {
    const path: MoveNode[] = [];
    let current = gameState.activeLineId;

    while (current) {
      const node = gameState.tree[current];
      if (!node) break;
      path.unshift(node);
      current = node.parentId;
    }

    return path;
  }, [gameState.activeLineId, gameState.tree]);

  const currentAnalysis = gameState.currentNodeId ? analysisState.byNodeId[gameState.currentNodeId] ?? null : null;

  useEffect(function syncGeneratedPgn() {
    if (!fullTreePgn) return;

    setGameState(function updatePgn(previous) {
      if (previous.pgnInput === fullTreePgn) return previous;
      return { ...previous, pgnInput: fullTreePgn };
    });
  }, [fullTreePgn]);

  useEffect(function keepActiveLineVisible() {
    if (!gameState.currentNodeId) return;
    if (visiblePath.some(function hasCurrent(node) { return node.id === gameState.currentNodeId; })) return;

    setGameState(function updateActiveLine(previous) {
      if (!previous.currentNodeId) return previous;
      return {
        ...previous,
        activeLineId: getDeepestLeaf(previous.currentNodeId, previous.tree),
      };
    });
  }, [gameState.currentNodeId, gameState.tree, visiblePath]);

  useEffect(function hydrateSelectedNodeFromCache() {
    const engine = engineRef.current;
    const currentNodeId = gameState.currentNodeId;
    if (!engine || !currentNodeId) return;

    const node = gameState.tree[currentNodeId];
    if (!node) return;

    const cachedEvaluation = engine.getEvaluation(node.fen, 0);
    if (!cachedEvaluation) return;

    syncNodeAnalysis(currentNodeId, toNodeAnalysis(node.fen, cachedEvaluation, true));
  }, [gameState.currentNodeId, gameState.tree]);

  useEffect(function runAnalysisLoop() {
    const engine = engineRef.current;
    if (!engine) return;
    const analysisEngine: ChessEngine = engine;

    const session = analysisSessionRef.current + 1;
    analysisSessionRef.current = session;
    let cancelled = false;

    async function loop() {
      while (!cancelled && analysisSessionRef.current === session) {
        const task = scheduleNextTask(gameStateRef.current, analysisEngine);
        if (!task) {
          setViewState(function setComplete(previous) {
            if (previous.statusText === 'Analysis Complete') return previous;
            return { ...previous, statusText: 'Analysis Complete' };
          });
          return;
        }

        const node = gameStateRef.current.tree[task.nodeId];
        if (!node) return;

        setViewState(function setStatus(previous) {
          const nextStatus = `Analyzing ${node.san || 'start'} (d${task.request.minDepth})...`;
          if (previous.statusText === nextStatus) return previous;
          return { ...previous, statusText: nextStatus };
        });

        const finalEvaluation = await analysisEngine.evaluate(node.fen, task.request, task.priority, function onUpdate(update) {
          if (cancelled || analysisSessionRef.current !== session) return;
          syncNodeAnalysis(task.nodeId, toNodeAnalysis(node.fen, update, update.isFinal));
        });

        if (cancelled || analysisSessionRef.current !== session) return;
        syncNodeAnalysis(task.nodeId, toNodeAnalysis(node.fen, finalEvaluation, true));
      }
    }

    loop()
        .then(function handleSuccess() {
          setViewState({ statusText: 'Analysis Complete' });
        })
        .catch(function handleError() {
      if (cancelled || analysisSessionRef.current !== session) return;
      setViewState({ statusText: 'Engine Error' });
    });

    return function cleanup() {
      cancelled = true;
    };
  }, [gameState.tree, gameState.currentNodeId]);

  function syncNodeAnalysis(nodeId: string, nextAnalysis: NodeAnalysis) {
    setAnalysisState(function updateAnalysis(previous) {
      const currentAnalysisEntry = previous.byNodeId[nodeId];
      if (areNodeAnalysesEqual(currentAnalysisEntry, nextAnalysis)) return previous;
      return {
        ...previous,
        byNodeId: {
          ...previous.byNodeId,
          [nodeId]: nextAnalysis,
        },
      };
    });
  }

  function makeMove(move: { from: string; to: string; promotion?: string }) {
    const currentFen = getCurrentFen(gameState.currentNodeId, gameState.tree);
    const tempGame = new Chess(currentFen === 'start' ? undefined : currentFen);

    try {
      const result = tempGame.move(move);
      if (!result) return false;

      const nextFen = tempGame.fen();
      const nextNodeId = gameState.currentNodeId ? `${gameState.currentNodeId}|${result.san}` : result.san;

      setGameState(function updateGame(previous) {
        if (previous.tree[nextNodeId]) {
          return {
            ...previous,
            currentNodeId: nextNodeId,
            activeLineId: nextNodeId,
          };
        }

        const nextTree: Record<string, MoveNode> = {
          ...previous.tree,
          [nextNodeId]: {
            id: nextNodeId,
            san: result.san,
            fen: nextFen,
            parentId: previous.currentNodeId,
            children: [],
          },
        };

        if (previous.currentNodeId) {
          nextTree[previous.currentNodeId] = {
            ...previous.tree[previous.currentNodeId],
            children: [...previous.tree[previous.currentNodeId].children, nextNodeId],
          };
        }

        return {
          ...previous,
          tree: nextTree,
          currentNodeId: nextNodeId,
          activeLineId: nextNodeId,
        };
      });
      return true;
    } catch {
      return false;
    }
  }

  function applyEngineMove(uci: string) {
    return makeMove({
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      promotion: uci[4] || 'q',
    });
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    return makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
  }

  function importPgn(pgn: string) {
    const tempGame = new Chess();

    try {
      tempGame.loadPgn(pgn);
      const moves = tempGame.history();
      let lastNodeId: string | null = null;
      const nextTree: Record<string, MoveNode> = {};
      const walker = new Chess();

      moves.forEach(function addMove(moveSan) {
        const result = walker.move(moveSan);
        const nodeId = lastNodeId ? `${lastNodeId}|${result.san}` : result.san;

        if (!nextTree[nodeId]) {
          nextTree[nodeId] = {
            id: nodeId,
            san: result.san,
            fen: walker.fen(),
            parentId: lastNodeId,
            children: [],
          };
          if (lastNodeId) {
            nextTree[lastNodeId] = {
              ...nextTree[lastNodeId],
              children: [...nextTree[lastNodeId].children, nodeId],
            };
          }
        }

        lastNodeId = nodeId;
      });

      setGameState({
        tree: nextTree,
        currentNodeId: lastNodeId,
        activeLineId: lastNodeId,
        pgnInput: pgn,
      });
      setAnalysisState({ byNodeId: {} });
      setViewState({ statusText: 'PGN Imported' });
    } catch {
      setViewState({ statusText: 'Invalid PGN' });
    }
  }

  function loadSample() {
    importPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7');
  }

  function clearTree() {
    setGameState({
      tree: {},
      currentNodeId: null,
      activeLineId: null,
      pgnInput: '',
    });
    setAnalysisState({ byNodeId: {} });
    setViewState({ statusText: 'Interactive Mode' });
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 min-h-[700px]">
      <div className="flex-1 flex flex-col items-center">
        <div className="w-full max-w-[480px] shadow-2xl rounded-lg overflow-hidden border-8 border-gray-800 bg-gray-800">
          <Chessboard
            id="AnalysisBoard"
            position={gameState.currentNodeId ? gameState.tree[gameState.currentNodeId].fen : 'start'}
            onPieceDrop={onDrop}
            boardOrientation="white"
            animationDuration={200}
          />
        </div>

        <div className="flex items-center gap-4 mt-6">
          <button onClick={function goStart() { setGameState(function update(previous) { return { ...previous, currentNodeId: null }; }); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">Start</button>
          <button
            onClick={function goBack() {
              setGameState(function update(previous) {
                if (!previous.currentNodeId || !previous.tree[previous.currentNodeId]) return previous;
                return { ...previous, currentNodeId: previous.tree[previous.currentNodeId].parentId };
              });
            }}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold"
          >
            Back
          </button>
          <button
            disabled={!gameState.currentNodeId || gameState.tree[gameState.currentNodeId].children.length === 0}
            onClick={function goForward() {
              setGameState(function update(previous) {
                if (!previous.currentNodeId) return previous;
                const node = previous.tree[previous.currentNodeId];
                if (!node || node.children.length === 0) return previous;
                return { ...previous, currentNodeId: node.children[0] };
              });
            }}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold disabled:opacity-30"
          >
            Forward
          </button>
        </div>
      </div>

      <div className="w-full lg:w-[450px] flex flex-col gap-4">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Engine</h3>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase text-gray-400 font-bold">Eval</span>
              <div className="text-sm font-mono text-indigo-500">{currentAnalysis ? formatScore(currentAnalysis.evaluation) : '--'}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {(!currentAnalysis || currentAnalysis.lines.length === 0) && <div className="text-xs text-gray-400 italic py-2">Calculating best moves...</div>}
            {currentAnalysis?.lines.map(function renderLine(line, index) {
              return (
                <button key={index} onClick={function applyLine() { applyEngineMove(line.uci); }} className="flex flex-col gap-1 p-3 bg-white border border-gray-200 rounded hover:border-indigo-500 hover:shadow-sm transition-all text-left">
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-300">{line.multipv}.</span>
                      <span className="font-bold text-gray-800 font-mono text-base">{line.move}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${line.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatScore(line.score)}</span>
                      <span className="text-[10px] text-gray-400">d{line.depth}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-500 font-mono truncate w-full opacity-70">
                    {line.pv.split(' ').slice(1).join(' ')}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-gray-400">{viewState.statusText}</div>
        </div>

        <div className="flex-1 bg-gray-50 p-6 rounded-lg border border-gray-200 flex flex-col overflow-hidden">
          <h3 className="font-bold text-gray-800 mb-4 flex justify-between items-center">Move Tree <button onClick={clearTree} className="text-[10px] text-red-500 hover:underline">Clear Tree</button></h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {visiblePath.map(function renderNode(node, index) {
              const variations = (gameState.tree[node.parentId || 'root']?.children?.map(function toNode(id) {
                return gameState.tree[id];
              })) || Object.values(gameState.tree).filter(function findRoots(rootNode) {
                return rootNode.parentId === null;
              });
              const isWhite = index % 2 === 0;
              const isFocus = node.id === gameState.currentNodeId;
              const nodeAnalysis = analysisState.byNodeId[node.id];

              return (
                <div key={node.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 w-8">{isWhite ? `${Math.floor(index / 2) + 1}.` : ''}</span>
                    <button
                      onClick={function selectNode() {
                        setGameState(function update(previous) {
                          return { ...previous, currentNodeId: node.id };
                        });
                      }}
                      className={`flex-1 flex justify-between items-center p-2 rounded border transition-all ${isFocus ? 'bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-300' : 'bg-white hover:bg-indigo-50 border-gray-200'}`}
                    >
                      <span className="font-bold font-mono text-sm">{node.san}</span>
                      {nodeAnalysis && <span className={`text-[10px] font-bold ${isFocus ? 'text-indigo-100' : 'text-gray-500'}`}>{formatScore(nodeAnalysis.evaluation)} <span className="opacity-50">d{nodeAnalysis.depth}</span></span>}
                    </button>
                  </div>
                  {variations.length > 1 && (
                    <div className="ml-10 flex flex-wrap gap-1 border-l-2 border-indigo-100 pl-3 py-1">
                      {variations.map(function renderVariation(variation) {
                        if (variation.id === node.id) return null;
                        return (
                          <button
                            key={variation.id}
                            onClick={function selectVariation() {
                              setGameState(function update(previous) {
                                return {
                                  ...previous,
                                  currentNodeId: variation.id,
                                  activeLineId: getDeepestLeaf(variation.id, previous.tree),
                                };
                              });
                            }}
                            className="text-[9px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold transition-colors"
                          >
                            alt: {variation.san}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-800">PGN</h3>
            <button onClick={loadSample} className="text-[10px] text-indigo-600 font-bold hover:underline">Sample</button>
          </div>
          <form
            onSubmit={function submitPgn(event) {
              event.preventDefault();
              importPgn(gameState.pgnInput);
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              className="w-full h-32 p-2 text-xs font-mono border rounded outline-none bg-white"
              value={gameState.pgnInput}
              onChange={function updatePgn(event) {
                const nextValue = event.target.value;
                setGameState(function update(previous) {
                  return { ...previous, pgnInput: nextValue };
                });
              }}
            />
            <button className="py-2 bg-gray-800 text-white font-bold rounded text-sm hover:bg-black">Import PGN</button>
          </form>
        </div>
      </div>
    </div>
  );
};

function generatePgnString(
  nodeId: string,
  moveNum: number,
  isWhite: boolean,
  isFirstInVariation: boolean,
  tree: Record<string, MoveNode>,
): string {
  const node = tree[nodeId];
  if (!node) return '';

  let pgn = isWhite ? `${moveNum}. ` : (isFirstInVariation ? `${moveNum}... ` : '');
  pgn += `${node.san} `;

  if (node.children.length > 1) {
    for (let index = 1; index < node.children.length; index += 1) {
      pgn += `(${generatePgnString(node.children[index], moveNum, isWhite, true, tree).trim()}) `;
    }
  }

  if (node.children.length > 0) {
    pgn += generatePgnString(node.children[0], isWhite ? moveNum : moveNum + 1, !isWhite, false, tree);
  }

  return pgn;
}

function getCurrentFen(nodeId: string | null, tree: Record<string, MoveNode>): string {
  return nodeId ? tree[nodeId]?.fen ?? 'start' : 'start';
}

function getDeepestLeaf(nodeId: string, tree: Record<string, MoveNode>): string {
  const node = tree[nodeId];
  if (!node || node.children.length === 0) return nodeId;
  return getDeepestLeaf(node.children[0], tree);
}

function scheduleNextTask(gameState: GameState, engine: ChessEngine): ScheduledTask | null {
  const currentNodeId = gameState.currentNodeId;
  const otherNodeIds = Object.keys(gameState.tree).filter(function filterNode(nodeId) {
    return nodeId !== currentNodeId;
  });

  function findNode(nodeIds: string[], minDepth: number, linesAmount: number): string | null {
    for (const nodeId of nodeIds) {
      const node = gameState.tree[nodeId];
      if (!node) continue;

      const cachedEvaluation = engine.getEvaluation(node.fen, minDepth);
      if (!cachedEvaluation) return nodeId;
      if (cachedEvaluation.lines.length < linesAmount) return nodeId;
    }

    return null;
  }

  if (currentNodeId) {
    const currentAt12 = findNode([currentNodeId], 12, 3);
    if (currentAt12) return { nodeId: currentAt12, request: { minDepth: 12, linesAmount: 3 }, priority: EngineEvaluationPriority.IMMEDIATE };
  }

  const othersAt12 = findNode(otherNodeIds, 12, 1);
  if (othersAt12) return { nodeId: othersAt12, request: { minDepth: 12, linesAmount: 1 }, priority: EngineEvaluationPriority.NEXT };

  if (currentNodeId) {
    const currentAt20 = findNode([currentNodeId], 20, 3);
    if (currentAt20) return { nodeId: currentAt20, request: { minDepth: 20, linesAmount: 3 }, priority: EngineEvaluationPriority.IMMEDIATE };
  }

  const othersAt16 = findNode(otherNodeIds, 16, 1);
  if (othersAt16) return { nodeId: othersAt16, request: { minDepth: 16, linesAmount: 1 }, priority: EngineEvaluationPriority.BACKGROUND };

  const othersAt20 = findNode(otherNodeIds, 20, 1);
  if (othersAt20) return { nodeId: othersAt20, request: { minDepth: 20, linesAmount: 1 }, priority: EngineEvaluationPriority.BACKGROUND };

  return null;
}

function uciToSanLine(uciString: string, baseFen: string): string[] {
  const tempGame = new Chess(baseFen === 'start' ? undefined : baseFen);
  const uciMoves = uciString.split(' ');
  const sanMoves: string[] = [];

  for (const uciMove of uciMoves) {
    try {
      const move = tempGame.move({
        from: uciMove.substring(0, 2),
        to: uciMove.substring(2, 4),
        promotion: uciMove[4] || 'q',
      });
      if (!move) break;
      sanMoves.push(move.san);
    } catch {
      break;
    }
  }

  return sanMoves;
}

function toDisplayLine(baseFen: string, line: ChessEngineLine): DisplayEngineLine | null {
  const sanMoves = uciToSanLine(line.pv.join(' '), baseFen);
  if (sanMoves.length === 0) return null;

  return {
    move: sanMoves[0],
    uci: line.uci,
    pv: sanMoves.join(' '),
    score: line.evaluation,
    depth: line.depth,
    multipv: line.multipv,
  };
}

function toDisplayLines(baseFen: string, lines: ChessEngineLine[]): DisplayEngineLine[] {
  return lines
    .map(function mapLine(line) {
      return toDisplayLine(baseFen, line);
    })
    .filter(function filterLine(line): line is DisplayEngineLine {
      return line !== null;
    });
}

function toNodeAnalysis(baseFen: string, evaluation: FullMoveEvaluation, isFinal: boolean): NodeAnalysis {
  return {
    fen: evaluation.fen,
    evaluation: evaluation.evaluation,
    depth: evaluation.depth,
    lines: toDisplayLines(baseFen, evaluation.lines),
    isFinal,
  };
}

function formatScore(score: number): string {
  return score >= 0 ? `+${score.toFixed(1)}` : score.toFixed(1);
}

function areNodeAnalysesEqual(left?: NodeAnalysis, right?: NodeAnalysis): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  return left.fen === right.fen &&
    left.evaluation === right.evaluation &&
    left.depth === right.depth &&
    left.isFinal === right.isFinal &&
    areDisplayLinesEqual(left.lines, right.lines);
}

function areDisplayLinesEqual(left: DisplayEngineLine[], right: DisplayEngineLine[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftLine = left[index];
    const rightLine = right[index];
    if (
      leftLine.move !== rightLine.move ||
      leftLine.uci !== rightLine.uci ||
      leftLine.pv !== rightLine.pv ||
      leftLine.score !== rightLine.score ||
      leftLine.depth !== rightLine.depth ||
      leftLine.multipv !== rightLine.multipv
    ) {
      return false;
    }
  }

  return true;
}

export default ChessReplay;
