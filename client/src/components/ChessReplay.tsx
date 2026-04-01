import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { FaAnglesLeft, FaChevronLeft, FaChevronRight, FaFileImport, FaMagnifyingGlassPlus, FaRotate, FaTrashCan } from 'react-icons/fa6';
import { GiPerspectiveDiceSixFacesRandom } from 'react-icons/gi';
import { Chessboard } from 'react-chessboard';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  EngineEvaluationPriority,
  getChessEngine,
  type ChessEngine,
  type ChessEngineLine,
  type EngineEvaluationPriority as EngineEvaluationPriorityValue,
  type EvaluationRequest,
  type FullMoveEvaluation,
} from '../lib/chessEngine';
import {
  mergePlayersInfo,
  parsePgnPlayersInfo,
  type GamePlayersInfo,
  type ImportedGameInfo,
  type PlayerInfo,
} from '../lib/gameInfo';
import { classifyMoveMark, MoveMark, type MoveMarkResult } from '../lib/moveMarks';
import EvaluationThermometer from './EvaluationThermometer';
import RenderIcon from './RenderIcon';

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
  pvUci: string[];
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
  source: 'engine-final' | 'engine-live' | 'seeded-from-parent';
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
  deepAnalysisKey: string | null;
  boardOrientation: 'white' | 'black';
}

interface BoardPlayers {
  top: PlayerCardInfo;
  bottom: PlayerCardInfo;
}

interface PlayerCardInfo {
  side: 'white' | 'black';
  player: PlayerInfo | null;
}

interface ScheduledTask {
  nodeId: string;
  fen: string;
  label: string;
  request: EvaluationRequest;
  priority: EngineEvaluationPriorityValue;
}

interface MoveResult {
  nodeId: string;
  fen: string;
}

interface AnalyzerLocationState {
  importedPgn?: string;
  importedGameInfo?: ImportedGameInfo;
  initialBoardOrientation?: 'white' | 'black';
}

const ROOT_ANALYSIS_NODE_ID = '__root__';

const ChessReplay: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState>({
    tree: {},
    currentNodeId: null,
    activeLineId: null,
    pgnInput: '',
  });
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ byNodeId: {} });
  const [viewState, setViewState] = useState<ViewState>({
    statusText: 'Interactive Mode',
    deepAnalysisKey: null,
    boardOrientation: 'white',
  });
  const [playersInfo, setPlayersInfo] = useState<GamePlayersInfo | null>(null);

  const engineRef = useRef<ChessEngine | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const analysisSessionRef = useRef(0);
  const lastImportedRouteKeyRef = useRef<string | null>(null);

  useEffect(function syncGameStateRef() {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(function initEngine() {
    engineRef.current = getChessEngine();
  }, []);

  function goStart() {
    setGameState(function update(previous) {
      if (previous.currentNodeId === null) return previous;
      return { ...previous, currentNodeId: null };
    });
  }

  function goBack() {
    setGameState(function update(previous) {
      if (!previous.currentNodeId || !previous.tree[previous.currentNodeId]) return previous;
      return { ...previous, currentNodeId: previous.tree[previous.currentNodeId].parentId };
    });
  }

  function goForward() {
    setGameState(function update(previous) {
      const nextNodeId = getNextNodeId(previous.currentNodeId, previous.tree);
      if (!nextNodeId) return previous;
      return { ...previous, currentNodeId: nextNodeId };
    });
  }

  useEffect(function importPgnFromRouteState() {
    const locationState = location.state as AnalyzerLocationState | null;
    const importedPgn = locationState?.importedPgn?.trim();
    if (!importedPgn) return;
    if (lastImportedRouteKeyRef.current === location.key) return;

    lastImportedRouteKeyRef.current = location.key;
    importPgn(
      importedPgn,
      locationState?.importedGameInfo ?? null,
      locationState?.initialBoardOrientation ?? 'white',
    );
    navigate(location.pathname, { replace: true, state: null });
  }, [location.key, location.pathname, location.state, navigate]);

  useEffect(function bindArrowNavigation() {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;

      if (event.key === 'ArrowLeft') {
        goBack();
        return;
      }

      if (event.key === 'ArrowRight') {
        goForward();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return function cleanup() {
      window.removeEventListener('keydown', handleKeyDown);
    };
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
  const moveMarksByNodeId = useMemo(function buildMoveMarks() {
    return buildMoveMarksByNodeId(gameState.tree, analysisState.byNodeId);
  }, [analysisState.byNodeId, gameState.tree]);
  const currentMoveMark = gameState.currentNodeId ? moveMarksByNodeId[gameState.currentNodeId] ?? null : null;
  const currentMoveSquares = useMemo(function buildCurrentMoveSquares() {
    if (!gameState.currentNodeId) return null;

    const node = gameState.tree[gameState.currentNodeId];
    if (!node?.parentId) return null;

    const parent = gameState.tree[node.parentId];
    if (!parent) return null;

    return getMoveSquares(parent.fen, node.san);
  }, [gameState.currentNodeId, gameState.tree]);
  const boardMarkStyles = useMemo(function buildBoardMarkStyles() {
    if (!currentMoveMark || !currentMoveSquares?.to) return {};

    return {
      [currentMoveSquares.to]: {
        boxShadow: `inset 0 0 0 4px ${getMoveMarkColor(currentMoveMark.mark)}`,
        backgroundColor: getMoveMarkBackground(currentMoveMark.mark),
      },
    };
  }, [currentMoveMark, currentMoveSquares]);
  const canGoForward = useMemo(function checkCanGoForward() {
    return getNextNodeId(gameState.currentNodeId, gameState.tree) !== null;
  }, [gameState.currentNodeId, gameState.tree]);
  const boardPlayers = useMemo(function buildBoardPlayers() {
    return getDisplayedPlayersInfo(playersInfo, viewState.boardOrientation);
  }, [playersInfo, viewState.boardOrientation]);

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

        setViewState(function setStatus(previous) {
          const nextStatus = `Analyzing ${task.label} (d${task.request.minDepth})...`;
          if (previous.statusText === nextStatus) return previous;
          return { ...previous, statusText: nextStatus };
        });

        const finalEvaluation = await analysisEngine.evaluate(task.fen, task.request, task.priority, function onUpdate(update) {
          if (cancelled || analysisSessionRef.current !== session) return;
          syncNodeAnalysis(task.nodeId, toNodeAnalysis(task.fen, update, update.isFinal));
        });

        if (cancelled || analysisSessionRef.current !== session) return;
        syncNodeAnalysis(task.nodeId, toNodeAnalysis(task.fen, finalEvaluation, true));
      }
    }

    loop()
        .then(function handleSuccess() {
          setViewState(function update(previous) {
            return { ...previous, statusText: 'Analysis Complete' };
          });
        })
        .catch(function handleError() {
      if (cancelled || analysisSessionRef.current !== session) return;
      setViewState(function update(previous) {
        return { ...previous, statusText: 'Engine Error' };
      });
    });

    return function cleanup() {
      cancelled = true;
    };
  }, [gameState.tree, gameState.currentNodeId]);

  function syncNodeAnalysis(nodeId: string, nextAnalysis: NodeAnalysis) {
    setAnalysisState(function updateAnalysis(previous) {
      const currentAnalysisEntry = previous.byNodeId[nodeId];
      const preferredAnalysis = pickPreferredAnalysis(currentAnalysisEntry, nextAnalysis);
      if (areNodeAnalysesEqual(currentAnalysisEntry, preferredAnalysis)) return previous;
      return {
        ...previous,
        byNodeId: {
          ...previous.byNodeId,
          [nodeId]: preferredAnalysis,
        },
      };
    });
  }

  function runDeepAnalysis() {
    const engine = engineRef.current;
    if (!engine) return;

    const target = getSelectedAnalysisTarget(gameState);
    if (!target) return;

    setViewState(function update(previous) {
      return {
        ...previous,
        deepAnalysisKey: target.nodeId,
        statusText: `Analyzing ${target.label} (d22)...`,
      };
    });

    void engine.evaluate(
      target.fen,
      { minDepth: 22, linesAmount: 3 },
      EngineEvaluationPriority.IMMEDIATE,
      function onUpdate(update) {
        syncNodeAnalysis(target.nodeId, toNodeAnalysis(target.fen, update, update.isFinal));
      },
    )
      .then(function handleDeepResult(result) {
        syncNodeAnalysis(target.nodeId, toNodeAnalysis(target.fen, result, true));
      })
      .catch(function handleDeepError() {
        setViewState(function update(previous) {
          return { ...previous, statusText: 'Engine Error' };
        });
      })
      .finally(function clearDeepState() {
        setViewState(function update(previous) {
          if (previous.deepAnalysisKey !== target.nodeId) return previous;
          return {
            ...previous,
            deepAnalysisKey: null,
            statusText: previous.statusText === `Analyzing ${target.label} (d22)...`
              ? 'Analysis Complete'
              : previous.statusText,
          };
        });
      });
  }

  function makeMove(move: { from: string; to: string; promotion?: string }): MoveResult | null {
    const currentFen = getCurrentFen(gameState.currentNodeId, gameState.tree);
    const tempGame = new Chess(currentFen === 'start' ? undefined : currentFen);

    try {
      const result = tempGame.move(move);
      if (!result) return null;

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
      return {
        nodeId: nextNodeId,
        fen: nextFen,
      };
    } catch {
      return null;
    }
  }

  function applyEngineMove(line: DisplayEngineLine) {
    const moveResult = makeMove({
      from: line.uci.substring(0, 2),
      to: line.uci.substring(2, 4),
      promotion: line.uci[4] || 'q',
    });
    if (!moveResult) return null;

    const engine = engineRef.current;
    const cachedEvaluation = engine?.getEvaluation(moveResult.fen, 0);
    if (cachedEvaluation) {
      syncNodeAnalysis(moveResult.nodeId, toNodeAnalysis(moveResult.fen, cachedEvaluation, true));
      return moveResult;
    }

    const seededAnalysis = buildSeededNodeAnalysis(moveResult.fen, line);
    if (seededAnalysis) {
      syncNodeAnalysis(moveResult.nodeId, seededAnalysis);
    }

    return moveResult;
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    return makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' }) !== null;
  }

  function importPgn(
    pgn: string,
    importedGameInfo: ImportedGameInfo | null = null,
    initialBoardOrientation: 'white' | 'black' = 'white',
  ) {
    const tempGame = new Chess();

    try {
      tempGame.loadPgn(pgn);
      const parsedPlayersInfo = parsePgnPlayersInfo(tempGame.getHeaders());
      const mergedPlayersInfo = mergePlayersInfo(parsedPlayersInfo, importedGameInfo?.players ?? null);
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
      setPlayersInfo(mergedPlayersInfo);
      setAnalysisState({ byNodeId: {} });
      setViewState(function update(previous) {
        return {
          ...previous,
          statusText: 'PGN Imported',
          deepAnalysisKey: null,
          boardOrientation: initialBoardOrientation,
        };
      });
    } catch {
      setViewState(function update(previous) {
        return { ...previous, statusText: 'Invalid PGN' };
      });
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
    setPlayersInfo(null);
    setAnalysisState({ byNodeId: {} });
    setViewState({ statusText: 'Interactive Mode', deepAnalysisKey: null, boardOrientation: 'white' });
  }

  function toggleBoardOrientation() {
    setViewState(function update(previous) {
      return {
        ...previous,
        boardOrientation: previous.boardOrientation === 'white' ? 'black' : 'white',
      };
    });
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 min-h-[700px]">
      <div className="flex-1 flex flex-col items-center">
        <div className="w-full max-w-120 mb-3">
          <PlayerCard info={boardPlayers.top} />
        </div>
        <div className="w-full max-w-130 flex items-stretch gap-3">
          <EvaluationThermometer
            evaluation={currentAnalysis?.evaluation ?? null}
            orientation={viewState.boardOrientation}
            className="w-8 min-h-120 rounded-md"
          />
          <div className="flex-1 shadow-2xl rounded-lg overflow-hidden border-8 border-gray-800 bg-gray-800">
            <Chessboard
              id="AnalysisBoard"
              position={gameState.currentNodeId ? gameState.tree[gameState.currentNodeId].fen : 'start'}
              onPieceDrop={onDrop}
              boardOrientation={viewState.boardOrientation}
              animationDuration={200}
              customSquareStyles={boardMarkStyles}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 mt-6 flex-wrap justify-center">
          <button onClick={goStart} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">
            <RenderIcon iconType={FaAnglesLeft} className={"text-sm"}/>
            <span>Start</span>
          </button>
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold"
          >
            <RenderIcon iconType={FaChevronLeft} className="text-sm" />
            <span>Back</span>
          </button>
          <button
            disabled={!canGoForward}
            onClick={goForward}
            className="inline-flex items-center gap-2 px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold disabled:opacity-30"
          >
            <RenderIcon iconType={FaChevronRight} className="text-sm" />
            <span>Forward</span>
          </button>
          <button
            onClick={toggleBoardOrientation}
            aria-label={viewState.boardOrientation === 'white' ? 'View board as black' : 'View board as white'}
            title={viewState.boardOrientation === 'white' ? 'View as Black' : 'View as White'}
            className="inline-flex items-center justify-center w-10 h-10 bg-gray-800 hover:bg-black text-white rounded font-bold"
          >
            <RenderIcon iconType={FaRotate} className="text-base" />
          </button>
        </div>

        <div className="w-full max-w-120 mt-4">
          <PlayerCard info={boardPlayers.bottom} />
        </div>
      </div>

      <div className="w-full lg:w-[450px] flex flex-col gap-4">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Engine</h3>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-right">
                <span className="text-[10px] uppercase text-gray-400 font-bold">Eval</span>
                <div className="text-sm font-mono text-indigo-500">{currentAnalysis ? formatScore(currentAnalysis.evaluation) : '--'}</div>
              </div>
              <button
                onClick={runDeepAnalysis}
                disabled={viewState.deepAnalysisKey !== null}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white bg-gray-800 rounded hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RenderIcon iconType={FaMagnifyingGlassPlus} className="text-xs" />
                <span>Deeper...</span>
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {(!currentAnalysis || currentAnalysis.lines.length === 0) && <div className="text-xs text-gray-400 italic py-2">Calculating best moves...</div>}
            {currentAnalysis?.lines.map(function renderLine(line, index) {
              return (
                <button key={index} onClick={function applyLine() { applyEngineMove(line); }} className="flex flex-col gap-1 p-3 bg-white border border-gray-200 rounded hover:border-indigo-500 hover:shadow-sm transition-all text-left">
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
          <h3 className="font-bold text-gray-800 mb-4 flex justify-between items-center">
            <span>Move Tree</span>
            <button onClick={clearTree} className="inline-flex items-center gap-1.5 text-[10px] text-red-500 hover:underline">
              <RenderIcon iconType={FaTrashCan} className="text-[9px]" />
              <span>Clear Tree</span>
            </button>
          </h3>
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
              const moveMark = moveMarksByNodeId[node.id];

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
                      <span className="flex items-center gap-2">
                        <span className="font-bold font-mono text-sm">{node.san}</span>
                        {moveMark && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${getMoveMarkBadgeClass(moveMark.mark, isFocus)}`}>
                            {moveMark.mark}
                          </span>
                        )}
                      </span>
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
            <div className="flex items-center gap-3">
              <Link to="/import/chess-com" className="text-[10px] text-indigo-600 font-bold hover:underline">Chess.com</Link>
              <button onClick={loadSample} className="inline-flex items-center gap-1.5 text-[10px] text-indigo-600 font-bold hover:underline">
                <RenderIcon iconType={GiPerspectiveDiceSixFacesRandom} className="text-xs" />
                <span>Sample</span>
              </button>
            </div>
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
            <button className="inline-flex items-center justify-center gap-2 py-2 bg-gray-800 text-white font-bold rounded text-sm hover:bg-black">
              <RenderIcon iconType={FaFileImport} className="text-sm" />
              <span>Import PGN</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

function PlayerCard({ info }: { info: PlayerCardInfo }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400">{info.side}</div>
        <div className="text-sm font-bold text-gray-900">{info.player?.name ?? capitalizeSide(info.side)}</div>
      </div>
      {typeof info.player?.rating === 'number' && (
        <div className="text-sm font-mono font-bold text-gray-500">{info.player.rating}</div>
      )}
    </div>
  );
}

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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  if (target.isContentEditable) return true;

  return Boolean(target.closest('[contenteditable="true"]'));
}

function getCurrentFen(nodeId: string | null, tree: Record<string, MoveNode>): string {
  return nodeId ? tree[nodeId]?.fen ?? 'start' : 'start';
}

function getDisplayedPlayersInfo(playersInfo: GamePlayersInfo | null, orientation: 'white' | 'black'): BoardPlayers {
  if (orientation === 'black') {
    return {
      top: { side: 'white', player: playersInfo?.white ?? null },
      bottom: { side: 'black', player: playersInfo?.black ?? null },
    };
  }

  return {
    top: { side: 'black', player: playersInfo?.black ?? null },
    bottom: { side: 'white', player: playersInfo?.white ?? null },
  };
}

function getRootNodeIds(tree: Record<string, MoveNode>): string[] {
  return Object.values(tree)
    .filter(function isRoot(node) {
      return node.parentId === null;
    })
    .map(function toId(node) {
      return node.id;
    });
}

function getNextNodeId(currentNodeId: string | null, tree: Record<string, MoveNode>): string | null {
  if (currentNodeId === null) {
    return getRootNodeIds(tree)[0] ?? null;
  }

  const node = tree[currentNodeId];
  if (!node || node.children.length === 0) return null;
  return node.children[0];
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
  const hasMoves = Object.keys(gameState.tree).length > 0;

  function findNode(nodeIds: string[], minDepth: number, linesAmount: number): string | null {
    for (const nodeId of nodeIds) {
      const fen = nodeId === ROOT_ANALYSIS_NODE_ID ? 'start' : gameState.tree[nodeId]?.fen;
      if (!fen) continue;

      const cachedEvaluation = engine.getEvaluation(fen, minDepth);
      if (!cachedEvaluation) return nodeId;
      if (cachedEvaluation.lines.length < linesAmount) return nodeId;
    }

    return null;
  }

  function toTask(nodeId: string, request: EvaluationRequest, priority: EngineEvaluationPriorityValue): ScheduledTask | null {
    if (nodeId === ROOT_ANALYSIS_NODE_ID) {
      return {
        nodeId,
        fen: 'start',
        label: 'start',
        request,
        priority,
      };
    }

    const node = gameState.tree[nodeId];
    if (!node) return null;

    return {
      nodeId,
      fen: node.fen,
      label: node.san || 'start',
      request,
      priority,
    };
  }

  if (currentNodeId) {
    const currentAt12 = findNode([currentNodeId], 12, 3);
    if (currentAt12) return toTask(currentAt12, { minDepth: 12, linesAmount: 3 }, EngineEvaluationPriority.IMMEDIATE);
  }

  const nextDepth12NodeIds = hasMoves ? [ROOT_ANALYSIS_NODE_ID, ...otherNodeIds] : otherNodeIds;
  const othersAt12 = findNode(nextDepth12NodeIds, 12, 2);
  if (othersAt12) return toTask(othersAt12, { minDepth: 12, linesAmount: 2 }, EngineEvaluationPriority.NEXT);

  if (currentNodeId) {
    const currentAt16 = findNode([currentNodeId], 16, 3);
    if (currentAt16) return toTask(currentAt16, { minDepth: 16, linesAmount: 3 }, EngineEvaluationPriority.IMMEDIATE);
  }

  const backgroundNodeIds = hasMoves ? [ROOT_ANALYSIS_NODE_ID, ...otherNodeIds] : otherNodeIds;
  const othersAt16 = findNode(backgroundNodeIds, 16, 1);
  if (othersAt16) return toTask(othersAt16, { minDepth: 16, linesAmount: 1 }, EngineEvaluationPriority.BACKGROUND);

  return null;
}

function getSelectedAnalysisTarget(gameState: GameState): ScheduledTask | null {
  if (!gameState.currentNodeId) {
    return {
      nodeId: ROOT_ANALYSIS_NODE_ID,
      fen: 'start',
      label: 'start',
      request: { minDepth: 22, linesAmount: 3 },
      priority: EngineEvaluationPriority.IMMEDIATE,
    };
  }

  const node = gameState.tree[gameState.currentNodeId];
  if (!node) return null;

  return {
    nodeId: node.id,
    fen: node.fen,
    label: node.san || 'start',
    request: { minDepth: 22, linesAmount: 3 },
    priority: EngineEvaluationPriority.IMMEDIATE,
  };
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
    pvUci: line.pv,
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
    source: isFinal ? 'engine-final' : 'engine-live',
  };
}

function buildSeededNodeAnalysis(childFen: string, line: DisplayEngineLine): NodeAnalysis | null {
  const childPvUci = line.pvUci.slice(1);
  const childLines = childPvUci.length > 0 ? toSeededDisplayLines(childFen, childPvUci, line) : [];

  return {
    fen: childFen,
    evaluation: line.score,
    depth: line.depth,
    lines: childLines,
    isFinal: false,
    source: 'seeded-from-parent',
  };
}

function toSeededDisplayLines(childFen: string, childPvUci: string[], line: DisplayEngineLine): DisplayEngineLine[] {
  const sanMoves = uciToSanLine(childPvUci.join(' '), childFen);
  if (sanMoves.length === 0) return [];

  return [{
    move: sanMoves[0],
    uci: childPvUci[0],
    pvUci: childPvUci,
    pv: sanMoves.join(' '),
    score: line.score,
    depth: line.depth,
    multipv: 1,
  }];
}

function buildMoveMarksByNodeId(
  tree: Record<string, MoveNode>,
  analysesByNodeId: Record<string, NodeAnalysis>,
): Record<string, MoveMarkResult> {
  const marksByNodeId: Record<string, MoveMarkResult> = {};

  Object.values(tree).forEach(function classifyNode(node) {
    const parentAnalysis = node.parentId ? analysesByNodeId[node.parentId] : analysesByNodeId[ROOT_ANALYSIS_NODE_ID];
    const nodeAnalysis = analysesByNodeId[node.id];
    const parentFen = node.parentId ? tree[node.parentId]?.fen : 'start';
    if (!parentFen) return;
    if (!parentAnalysis?.isFinal || !nodeAnalysis?.isFinal) return;
    if (parentAnalysis.lines.length === 0) return;

    const mark = classifyMoveMark({
      parentFen,
      playedMoveSan: node.san,
      playedEvaluation: nodeAnalysis.evaluation,
      parentLines: parentAnalysis.lines.map(function toEngineLine(line) {
        return {
          uci: line.uci,
          evaluation: line.score,
        };
      }),
    });

    if (mark) marksByNodeId[node.id] = mark;
  });

  return marksByNodeId;
}

function getMoveSquares(baseFen: string, san: string): { from: string; to: string } | null {
  const tempGame = new Chess(baseFen === 'start' ? undefined : baseFen);

  try {
    const move = tempGame.move(san);
    if (!move) return null;
    return { from: move.from, to: move.to };
  } catch {
    return null;
  }
}

function getMoveMarkBadgeClass(mark: MoveMark, isFocus: boolean): string {
  switch (mark) {
    case MoveMark.BEST:
      return isFocus ? 'bg-green-200 text-green-900' : 'bg-green-100 text-green-700';
    case MoveMark.OK:
      return isFocus ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-700';
    case MoveMark.INACCURACY:
      return isFocus ? 'bg-yellow-200 text-yellow-900' : 'bg-yellow-100 text-yellow-800';
    case MoveMark.MISTAKE:
      return isFocus ? 'bg-orange-200 text-orange-900' : 'bg-orange-100 text-orange-800';
    case MoveMark.BLUNDER:
      return isFocus ? 'bg-red-200 text-red-900' : 'bg-red-100 text-red-700';
    case MoveMark.ONLY_MOVE:
      return isFocus ? 'bg-blue-200 text-blue-900' : 'bg-blue-100 text-blue-700';
    case MoveMark.BRILLIANT:
      return isFocus ? 'bg-teal-200 text-teal-900' : 'bg-teal-100 text-teal-700';
    default:
      return isFocus ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-700';
  }
}

function getMoveMarkColor(mark: MoveMark): string {
  switch (mark) {
    case MoveMark.BEST:
      return 'rgba(22, 163, 74, 0.9)';
    case MoveMark.OK:
      return 'rgba(107, 114, 128, 0.9)';
    case MoveMark.INACCURACY:
      return 'rgba(234, 179, 8, 0.9)';
    case MoveMark.MISTAKE:
      return 'rgba(249, 115, 22, 0.9)';
    case MoveMark.BLUNDER:
      return 'rgba(220, 38, 38, 0.9)';
    case MoveMark.ONLY_MOVE:
      return 'rgba(37, 99, 235, 0.9)';
    case MoveMark.BRILLIANT:
      return 'rgba(13, 148, 136, 0.9)';
    default:
      return 'rgba(107, 114, 128, 0.9)';
  }
}

function getMoveMarkBackground(mark: MoveMark): string {
  switch (mark) {
    case MoveMark.BEST:
      return 'rgba(34, 197, 94, 0.22)';
    case MoveMark.OK:
      return 'rgba(107, 114, 128, 0.18)';
    case MoveMark.INACCURACY:
      return 'rgba(250, 204, 21, 0.24)';
    case MoveMark.MISTAKE:
      return 'rgba(251, 146, 60, 0.24)';
    case MoveMark.BLUNDER:
      return 'rgba(248, 113, 113, 0.26)';
    case MoveMark.ONLY_MOVE:
      return 'rgba(59, 130, 246, 0.24)';
    case MoveMark.BRILLIANT:
      return 'rgba(45, 212, 191, 0.24)';
    default:
      return 'rgba(107, 114, 128, 0.18)';
  }
}

function capitalizeSide(side: 'white' | 'black'): string {
  return side.charAt(0).toUpperCase() + side.slice(1);
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
    left.source === right.source &&
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
      leftLine.pvUci.join(' ') !== rightLine.pvUci.join(' ') ||
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

function pickPreferredAnalysis(currentAnalysis: NodeAnalysis | undefined, nextAnalysis: NodeAnalysis): NodeAnalysis {
  const mergedNextAnalysis = mergeNodeAnalysisLines(currentAnalysis, nextAnalysis);
  if (!currentAnalysis) return nextAnalysis;
  if (currentAnalysis.source === 'engine-final' && mergedNextAnalysis.source === 'seeded-from-parent') return currentAnalysis;
  if (currentAnalysis.source === 'engine-live' && mergedNextAnalysis.source === 'seeded-from-parent') return currentAnalysis;
  if (currentAnalysis.source === 'engine-final' && mergedNextAnalysis.source === 'engine-live' && mergedNextAnalysis.depth <= currentAnalysis.depth) {
    return currentAnalysis;
  }
  if (mergedNextAnalysis.source === 'engine-final' && currentAnalysis.source !== 'engine-final') return mergedNextAnalysis;
  if (currentAnalysis.source === 'seeded-from-parent' && mergedNextAnalysis.source !== 'seeded-from-parent') return mergedNextAnalysis;
  if (mergedNextAnalysis.depth > currentAnalysis.depth) return mergedNextAnalysis;
  if (mergedNextAnalysis.depth < currentAnalysis.depth) return currentAnalysis;
  if (mergedNextAnalysis.lines.length > currentAnalysis.lines.length) return mergedNextAnalysis;
  if (mergedNextAnalysis.lines.length < currentAnalysis.lines.length) return currentAnalysis;
  return mergedNextAnalysis;
}

function mergeNodeAnalysisLines(currentAnalysis: NodeAnalysis | undefined, nextAnalysis: NodeAnalysis): NodeAnalysis {
  if (!currentAnalysis) return nextAnalysis;
  if (currentAnalysis.fen !== nextAnalysis.fen) return nextAnalysis;
  if (nextAnalysis.lines.length >= currentAnalysis.lines.length) return nextAnalysis;

  const mergedByMultiPv = new Map<number, DisplayEngineLine>();
  nextAnalysis.lines.forEach(function addNext(line) {
    mergedByMultiPv.set(line.multipv, line);
  });
  currentAnalysis.lines.forEach(function addMissing(line) {
    if (!mergedByMultiPv.has(line.multipv)) mergedByMultiPv.set(line.multipv, line);
  });

  return {
    ...nextAnalysis,
    lines: [...mergedByMultiPv.values()].sort(function sortByMultiPv(left, right) {
      return left.multipv - right.multipv;
    }),
  };
}

export default ChessReplay;
