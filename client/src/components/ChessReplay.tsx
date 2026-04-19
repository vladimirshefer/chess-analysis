import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  FaAnglesLeft,
  FaChevronLeft,
  FaChevronRight,
  FaFileImport,
  FaMagnifyingGlassPlus,
  FaRotate,
  FaTrashCan,
} from "react-icons/fa6";
import { GiPerspectiveDiceSixFacesRandom } from "react-icons/gi";
import { Chessboard } from "react-chessboard";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnalyzerPageEnginePlan } from "../pages/AnalyzerPage/EnginePlan";
import {
  type ChessEngineLine,
  EngineEvaluationPriorities,
  type EngineEvaluationPriority,
  type EvaluationRequest,
  type FullMoveEvaluation,
  getChessEngine,
} from "../lib/ChessEngine.ts";
import {
  type GamePlayersInfo,
  type ImportedGameInfo,
  mergePlayersInfo,
  parsePgnPlayersInfo,
  type PlayerInfo,
} from "../lib/gameInfo";
import {
  areEvaluationsEqual,
  type EngineEvaluation,
  formatEvaluation,
  getTerminalEvaluation,
  START,
  START_FEN,
  toComparableEvaluationScore,
} from "../lib/evaluation";
import { classifyMoveMark, MoveMark, type MoveMarkResult, toMoveMarkEvaluation } from "../lib/moveMarks";
import { OpeningsBook } from "../lib/OpeningsBook";
import EvaluationThermometer from "./EvaluationThermometer";
import { createMoveMarkSquareRenderer } from "./MoveMarkSquareRenderer";
import RenderIcon from "./RenderIcon";

interface MoveNode {
  id: string;
  san: string;
  fen: string;
  parentId: string | null;
  children: string[];
}

interface DisplayEngineLine {
  /**
   * Suggested next move.
   * Example: "Bc2"
   */
  suggestedMove: string;
  /**
   * Suggested next move.
   * UCI = Universal Chess Interface notation
   * Example: "b3c2"
   */
  suggestedMoveUci: string;
  /**
   * Engine line.
   * example: ["b3c2","h7h6","c1e3"]
   */
  engineLineUci: string[];
  /**
   * Engine line.
   * like "Bc2 h6 Be3"
   */
  engineLine: string;
  score: EngineEvaluation;
  depth: number;
  /** rank of the line. 1 = suggestion*/
  lineRank: number;
}

interface NodeAnalysis {
  fen: string;
  evaluation: EngineEvaluation;
  depth: number;
  lines: DisplayEngineLine[];
  isFinal: boolean;
}

interface ScheduledTask {
  nodeId: string;
  fen: string;
  label: string;
  request: EvaluationRequest;
  priority: EngineEvaluationPriority;
}

interface AnalyzerLocationState {
  importedPgn?: string;
  importedGameInfo?: ImportedGameInfo;
  initialBoardOrientation?: "white" | "black";
}

const ROOT_ANALYSIS_NODE_ID = "__root__";
const PLAN_CAPTURE_SQUARE_STYLE = {
  backgroundColor: "rgba(220, 38, 38, 0.45)",
  boxShadow: "inset 0 0 0 3px rgba(185, 28, 28, 0.85)",
};

function ChessReplay() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pgnInput, setPgnInput] = useState("");
  const [tree, setTree] = useState<Record<string, MoveNode>>({});
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [positionAnalysisMap, setPositionAnalysisMap] = useState<Record<string, NodeAnalysis>>({});
  const [statusText, setStatusText] = useState("Interactive Mode");
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [playersInfo, setPlayersInfo] = useState<GamePlayersInfo | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [importedFullPgn, setImportedFullPgn] = useState("");

  const currentLinePgn = useMemo(() => {
    if (!currentNodeId) {
      return "";
    }

    return toLinePgn(currentNodeId, tree) ?? "";
  }, [currentNodeId, tree]);

  const [lastBookOpeningName, setLastBookOpeningName] = useState<string | null>(null);

  const engine = useMemo(() => getChessEngine(), []);

  const lastImportedRouteKeyRef = useRef<string | null>(null);
  const moveMarksBySquareRef = useRef<Record<string, MoveMark>>({});

  function goStart() {
    setCurrentNodeId(() => null);
  }

  function goBack() {
    setCurrentNodeId((previous) => {
      if (!previous || !tree[previous]) return previous;
      return tree[previous].parentId;
    });
  }

  function goForward() {
    setCurrentNodeId((previous) => getNextNodeId(previous, tree) ?? previous);
  }

  useEffect(() => {
    const locationState = location.state as AnalyzerLocationState | null;
    const importedPgn = locationState?.importedPgn?.trim();
    if (!importedPgn) return;
    if (lastImportedRouteKeyRef.current === location.key) return;

    lastImportedRouteKeyRef.current = location.key;
    importPgn(importedPgn, locationState?.importedGameInfo ?? null, locationState?.initialBoardOrientation ?? "white");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.key, location.pathname, location.state, navigate]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.key !== "ArrowLeft") return;
      goBack();
    }

    window.addEventListener("keydown", handleKeyDown);
    return function cleanup() {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [tree]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.key !== "ArrowRight") return;
      goForward();
    }

    window.addEventListener("keydown", handleKeyDown);
    return function cleanup() {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [tree]);

  const fullTreePgn = useMemo(() => {
    const roots = Object.values(tree).filter((node) => node.parentId === null);
    if (roots.length === 0) return "";

    let result = "";
    roots.forEach((root, index) => {
      result +=
        (index === 0 ? "" : "(") +
        generatePgnString(root.id, 1, true, index !== 0, tree).trim() +
        (index === 0 ? " " : ") ");
    });
    return result.trim();
  }, [tree]);

  const visiblePath = useMemo(
    function buildVisiblePath() {
      const path: MoveNode[] = [];
      let current = activeLineId;

      while (current) {
        const node = tree[current];
        if (!node) break;
        path.unshift(node);
        current = node.parentId;
      }

      return path;
    },
    [activeLineId, tree],
  );

  const currentAnalysis = currentNodeId ? (positionAnalysisMap[currentNodeId] ?? null) : null;
  const openingsReady = OpeningsBook.isReady();

  const moveMarksMap: Record<string, MoveMarkResult> = useMemo(() => {
    if (!openingsReady) return {};
    return buildMoveMarksByNodeId(tree, positionAnalysisMap);
  }, [openingsReady, positionAnalysisMap, tree]);

  useEffect(
    function resolveLastBookOpeningName() {
      const linePgn = currentLinePgn.trim();
      if (!linePgn) {
        setLastBookOpeningName(null);
        return;
      }

      void OpeningsBook.getOpeningByPgn(linePgn)
        .then((openingByPgn) => {
          setLastBookOpeningName(openingByPgn?.name ?? null);
        })
        .catch((error) => {
          console.error("Failed to resolve opening name for current line", error);
          setLastBookOpeningName(null);
        });
    },
    [currentLinePgn],
  );

  const currentMoveMark: MoveMarkResult = currentNodeId ? (moveMarksMap[currentNodeId] ?? null) : null;

  const currentMoveSquares: { from: string; to: string } = useMemo(
    function buildCurrentMoveSquares() {
      if (!currentNodeId) return null;

      const node = tree[currentNodeId];
      if (!node?.parentId) return null;

      const parent = tree[node.parentId];
      if (!parent) return null;

      return getMoveSquares(parent.fen, node.san);
    },
    [currentNodeId, tree],
  );

  const moveMarksBySquare = useMemo<Record<string, MoveMark>>(
    function buildMoveMarksBySquare() {
      if (!currentMoveMark || !currentMoveSquares?.to) return {};

      return {
        [currentMoveSquares.to]: currentMoveMark.mark,
      };
    },
    [currentMoveMark, currentMoveSquares],
  );
  moveMarksBySquareRef.current = moveMarksBySquare;
  const moveMarkSquareRenderer = useMemo(
    () =>
      createMoveMarkSquareRenderer({
        getMark(square: string) {
          return moveMarksBySquareRef.current[square];
        },
      }),
    [],
  );

  const currentFen = useMemo(
    () => (!currentNodeId ? START_FEN : (tree[currentNodeId]?.fen ?? START_FEN)),
    [currentNodeId, tree],
  );
  const planView = useMemo(
    function buildPlanView() {
      if (!showPlans) return AnalyzerPageEnginePlan.toPlanView(currentFen, []);
      if (!currentAnalysis || currentAnalysis.lines.length === 0) {
        return AnalyzerPageEnginePlan.toPlanView(currentFen, []);
      }

      const topLine = currentAnalysis.lines.find(function findTopLine(line) {
        return line.lineRank === 1;
      });
      if (!topLine || topLine.engineLineUci.length === 0) {
        return AnalyzerPageEnginePlan.toPlanView(currentFen, []);
      }

      return AnalyzerPageEnginePlan.toPlanView(currentFen, topLine.engineLineUci);
    },
    [currentAnalysis, currentFen, showPlans],
  );
  const boardSquareStyles = useMemo(
    function buildBoardSquareStyles() {
      if (planView.captureSquares.length === 0) return {};

      const planCaptureStyles = planView.captureSquares.reduce<Record<string, Record<string, string | number>>>(
        function collectCaptureStyles(result, square) {
          result[square] = PLAN_CAPTURE_SQUARE_STYLE;
          return result;
        },
        {},
      );

      return planCaptureStyles;
    },
    [planView.captureSquares],
  );
  const canGoForward = useMemo(
    function checkCanGoForward() {
      return getNextNodeId(currentNodeId, tree) !== null;
    },
    [currentNodeId, tree],
  );

  const displayedPlayersInfo = getDisplayedPlayersInfo(playersInfo, boardOrientation);

  useEffect(() => {
    if (!fullTreePgn) return;
    setPgnInput(fullTreePgn);
  }, [fullTreePgn]);

  useEffect(
    function keepActiveLineVisible() {
      if (!currentNodeId) return;
      if (visiblePath.some((node) => node.id === currentNodeId)) return;
      setActiveLineId(getDeepestLeaf(currentNodeId, tree));
    },
    [currentNodeId, tree, visiblePath],
  );

  useEffect(
    function hydrateSelectedNodeFromCache() {
      if (!currentNodeId) return;

      const node = tree[currentNodeId];
      if (!node) return;

      let cancelled = false;
      void (async () => {
        const cachedEvaluation = await engine.getEvaluation(node.fen, 0);
        if (cancelled) return;
        if (cachedEvaluation) {
          syncSingleNodeAnalysis(currentNodeId, toNodeAnalysis(node.fen, cachedEvaluation, true));
          return;
        }

        const terminalAnalysis = buildTerminalNodeAnalysis(node.fen);
        if (terminalAnalysis) syncSingleNodeAnalysis(currentNodeId, terminalAnalysis);
      })().catch((error) => {
        if (cancelled) return;
        console.error("Failed to hydrate selected node analysis", error);
      });

      return function cleanup() {
        cancelled = true;
      };
    },
    [currentNodeId, tree],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const tasks = buildAnalysisTasks(tree, currentNodeId);
      if (cancelled) return;
      if (tasks.length === 0) {
        setStatusText("Nothing to analyze");
        return;
      }

      setStatusText("Analyzing...");

      const results = await Promise.allSettled(
        tasks.map((task) =>
          engine
            .evaluate(task.fen, task.request, task.priority, (update) => {
              if (cancelled) return;
              syncSingleNodeAnalysis(task.nodeId, toNodeAnalysis(task.fen, update, update.isFinal));
              setStatusText(`Analyzing ${task.label} (d${task.request.minDepth})...`);
            })
            .then((finalEvaluation) => {
              if (cancelled) return;
              syncSingleNodeAnalysis(task.nodeId, toNodeAnalysis(task.fen, finalEvaluation, true));
            }),
        ),
      );

      if (cancelled) return;
      const hasFailures = results.some((result) => result.status === "rejected");
      if (hasFailures) {
        setStatusText(`Engine Error`);
        console.error(`Engine Error`, results.map((it) => (it as any).reason).filter(Boolean));
      } else {
        setStatusText("Analysis Complete");
      }
    })().catch((error) => {
      if (cancelled) return;
      setStatusText("Engine Error");
      console.error("Engine Error", error);
    });

    return () => {
      cancelled = true;
    };
  }, [tree, currentNodeId]);

  function syncSingleNodeAnalysis(nodeId: string, analysis: NodeAnalysis) {
    setPositionAnalysisMap((previous) => {
      const currentAnalysisEntry = previous[nodeId];
      const preferredAnalysis = pickPreferredAnalysis(currentAnalysisEntry, analysis);
      if (areNodeAnalysesEqual(currentAnalysisEntry, preferredAnalysis)) return previous;
      return {
        ...previous,
        [nodeId]: preferredAnalysis,
      };
    });
  }

  function runDeepAnalysis() {
    const target = getSelectedAnalysisTarget(tree, currentNodeId);
    if (!target) return;

    setStatusText(`Analyzing ${target.label} (d22)...`);

    void engine
      .evaluate(target.fen, { minDepth: 22, linesAmount: 3 }, EngineEvaluationPriorities.IMMEDIATE, (update) => {
        syncSingleNodeAnalysis(target.nodeId, toNodeAnalysis(target.fen, update, update.isFinal));
      })
      .then((result) => {
        syncSingleNodeAnalysis(target.nodeId, toNodeAnalysis(target.fen, result, true));
        setStatusText("Analysis Complete");
      })
      .catch((e) => {
        setStatusText("Engine Error");
        console.error("Engine Error", e);
      });
  }

  function makeMove(move: { from: string; to: string; promotion?: string }): { nodeId: string; fen: string } | null {
    const tempGame = new Chess(currentFen);

    try {
      const result = tempGame.move(move);
      if (!result) return null;

      const nextFen = tempGame.fen();
      const nextNodeId = currentNodeId ? `${currentNodeId}|${result.san}` : result.san;

      if (tree[nextNodeId]) {
        setCurrentNodeId(nextNodeId);
        setActiveLineId(nextNodeId);
        return {
          nodeId: nextNodeId,
          fen: nextFen,
        };
      }

      setTree(function updateTree(previous) {
        const nextTree: Record<string, MoveNode> = {
          ...previous,
          [nextNodeId]: {
            id: nextNodeId,
            san: result.san,
            fen: nextFen,
            parentId: currentNodeId,
            children: [],
          },
        };

        if (currentNodeId) {
          nextTree[currentNodeId] = {
            ...previous[currentNodeId],
            children: [...previous[currentNodeId].children, nextNodeId],
          };
        }

        return nextTree;
      });
      setCurrentNodeId(nextNodeId);
      setActiveLineId(nextNodeId);
      return {
        nodeId: nextNodeId,
        fen: nextFen,
      };
    } catch {
      return null;
    }
  }

  async function applyEngineMove(line: DisplayEngineLine, suggestedMoveUci: string): Promise<void> {
    const moveResult = makeMove({
      from: suggestedMoveUci.substring(0, 2),
      to: suggestedMoveUci.substring(2, 4),
      promotion: suggestedMoveUci[4] || "q",
    });
    if (!moveResult) return;

    try {
      const cachedEvaluation = await engine.getEvaluation(moveResult.fen, 0);
      if (cachedEvaluation) {
        syncSingleNodeAnalysis(moveResult.nodeId, toNodeAnalysis(moveResult.fen, cachedEvaluation, true));
        return;
      }

      const seededAnalysis = buildSeededNodeAnalysis(moveResult.fen, line, line.engineLineUci.slice(1));
      if (seededAnalysis) {
        syncSingleNodeAnalysis(moveResult.nodeId, seededAnalysis);
      }
    } catch (error) {
      console.error("Failed to seed analysis after applying engine move", error);
    }
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    return makeMove({ from: sourceSquare, to: targetSquare, promotion: "q" }) !== null;
  }

  function importPgn(
    pgn: string,
    importedGameInfo: ImportedGameInfo | null = null,
    initialBoardOrientation: "white" | "black" = "white",
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

      setTree(nextTree);
      setActiveLineId(lastNodeId);
      setPgnInput(pgn);
      setImportedFullPgn(pgn.trim());
      setPlayersInfo(mergedPlayersInfo);
      setPositionAnalysisMap({});
      setStatusText("PGN Imported");
      setBoardOrientation(initialBoardOrientation);
    } catch {
      setStatusText("Invalid PGN");
    }
  }

  function loadSample() {
    importPgn(
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7",
    );
  }

  function clearTree() {
    setTree({});
    setCurrentNodeId(null);
    setActiveLineId(null);
    setPgnInput("");
    setImportedFullPgn("");
    setPlayersInfo(null);
    setPositionAnalysisMap({});
    setStatusText("Interactive Mode");
    setBoardOrientation("white");
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 min-h-[700px]">
      <div className="flex-1 flex flex-col items-center gap-2">
        <div className="w-full max-w-120">
          <PlayerCard info={displayedPlayersInfo.top} />
        </div>
        <div className="w-full max-w-130 flex rounded-md items-stretch border-8 border-gray-800 bg-gray-800">
          <EvaluationThermometer
            evaluation={currentAnalysis?.evaluation ?? null}
            orientation={boardOrientation}
            className="w-6 self-stretch"
          />
          <div className="flex-1 min-w-0 shadow-2xl overflow-hidden">
            <Chessboard
              id="AnalysisBoard"
              position={currentNodeId ? tree[currentNodeId].fen : START_FEN}
              onPieceDrop={onDrop}
              boardOrientation={boardOrientation}
              animationDuration={200}
              customArrows={planView.arrows}
              customSquare={moveMarkSquareRenderer}
              customSquareStyles={boardSquareStyles}
            />
          </div>
        </div>
        <div className="w-full max-w-120">
          <PlayerCard info={displayedPlayersInfo.bottom} />
        </div>

        <div className="flex items-center gap-4 mt-6 flex-wrap justify-center">
          <button
            onClick={goStart}
            className="inline-flex items-center justify-center p-4 bg-gray-100 hover:bg-gray-200 rounded font-bold"
          >
            <RenderIcon iconType={FaAnglesLeft} className={"text-sm"} />
          </button>
          <button
            onClick={goBack}
            className="inline-flex items-center justify-center p-4 bg-gray-100 hover:bg-gray-200 rounded font-bold"
          >
            <RenderIcon iconType={FaChevronLeft} className="text-sm" />
          </button>
          <button
            disabled={!canGoForward}
            onClick={goForward}
            className="inline-flex items-center justify-center p-4 bg-gray-100 hover:bg-gray-200 rounded font-bold disabled:opacity-30"
          >
            <RenderIcon iconType={FaChevronRight} className="text-sm" />
          </button>
          <button
            onClick={function () {
              setBoardOrientation((previous) => (previous === "white" ? "black" : "white"));
            }}
            aria-label={boardOrientation === "white" ? "View board as black" : "View board as white"}
            title={boardOrientation === "white" ? "View board as Black" : "View board as White"}
            className="inline-flex items-center justify-center p-4 bg-gray-800 hover:bg-black text-white rounded font-bold"
          >
            <RenderIcon iconType={FaRotate} className="text-base" />
          </button>
        </div>
      </div>

      <div className="w-full lg:w-md flex flex-col gap-4">
        <div className="bg-gray-50 p-4 rounded-sm border border-gray-200">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Engine</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={function togglePlans() {
                  setShowPlans(function toggle(previous) {
                    return !previous;
                  });
                }}
                title={"Show engine plan arrows"}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded border ${showPlans ? "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100" : "text-gray-600 border-gray-300 bg-white hover:bg-gray-100"}`}
              >
                Show plans
              </button>
              <span className="text-xs uppercase text-gray-400 font-bold">Eval</span>
              <div className="text-sm font-mono text-indigo-500">
                {currentAnalysis ? formatEvaluation(currentAnalysis.evaluation) : "--"}
              </div>
              <button
                onClick={runDeepAnalysis}
                title={"Run deeper analysis"}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white bg-gray-800 rounded hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RenderIcon iconType={FaMagnifyingGlassPlus} className="text-xs" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {(!currentAnalysis || (currentAnalysis.lines.length === 0 && !currentAnalysis.isFinal)) && (
              <div className="text-xs text-gray-400 italic py-2">Calculating best moves...</div>
            )}
            {currentAnalysis?.lines.map(function renderLine(line, index) {
              const scoreValue = toComparableEvaluationScore(line.score);
              return (
                <button
                  key={index}
                  onClick={() => {
                    void applyEngineMove(line, line.suggestedMoveUci);
                  }}
                  className="flex flex-col gap-2 px-2 bg-white border border-gray-200 rounded hover:border-indigo-500 hover:shadow-sm transition-all text-left"
                >
                  <div className="flex items-baseline w-full gap-2">
                    <span className="text-xs font-bold text-gray-300">{line.lineRank}.</span>
                    <span className="font-bold text-gray-800 font-mono text-nowrap">{line.suggestedMove}</span>
                    <div className="text-xs text-gray-500 font-mono truncate grow opacity-70">
                      {line.engineLine.split(" ").slice(1).join(" ")}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm font-bold ${scoreValue > 0 ? "text-green-600" : scoreValue < 0 ? "text-red-600" : "text-gray-500"}`}
                      >
                        {formatEvaluation(line.score)}
                      </span>
                      <span className="text-xs text-gray-400">d{line.depth}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            <div className="text-xs text-gray-400 text-right">{statusText}</div>
          </div>
        </div>

        <div className="flex-1 bg-gray-50 p-6 rounded-lg border border-gray-200 flex flex-col overflow-hidden">
          <h3 className="font-bold text-gray-800 mb-4 flex justify-between items-center">
            <span className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">Move Tree</span>
              {lastBookOpeningName && (
                <span className="text-xs font-medium text-sky-700 truncate" title={lastBookOpeningName}>
                  {lastBookOpeningName}
                </span>
              )}
            </span>
            <button
              onClick={clearTree}
              className="inline-flex items-center gap-1.5 text-[10px] text-red-500 hover:underline"
            >
              <RenderIcon iconType={FaTrashCan} className="text-[9px]" />
              <span>Clear Tree</span>
            </button>
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {visiblePath
              .filter(function keepWhiteHalfMove(_, index) {
                return index % 2 === 0;
              })
              .map(function renderMoveRow(whiteNode, rowIndex) {
                const whiteIndex = rowIndex * 2;
                const blackNode = visiblePath[whiteIndex + 1] ?? null;
                const whiteVariations =
                  tree[whiteNode.parentId || "root"]?.children?.map(function toNode(id) {
                    return tree[id];
                  }) ||
                  Object.values(tree).filter(function findRoots(rootNode) {
                    return rootNode.parentId === null;
                  });
                const blackVariations = blackNode
                  ? tree[blackNode.parentId || "root"]?.children?.map(function toNode(id) {
                      return tree[id];
                    }) ||
                    Object.values(tree).filter(function findRoots(rootNode) {
                      return rootNode.parentId === null;
                    })
                  : [];
                const hasWhiteVariations = whiteVariations.length > 1;
                const hasBlackVariations = blackVariations.length > 1;
                return (
                  <div key={whiteNode.id} className="flex flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] font-bold text-gray-400 w-8 pt-2">{`${rowIndex + 1}.`}</span>
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        {[whiteNode, blackNode].map(function renderHalfMove(node, index) {
                          if (!node) {
                            return (
                              <div
                                key={`empty-${rowIndex}-${index}`}
                                className="w-full p-2 rounded border border-transparent"
                              />
                            );
                          }

                          const isFocus = node.id === currentNodeId;
                          const nodeAnalysis = positionAnalysisMap[node.id];
                          const moveMark = moveMarksMap[node.id];

                          return (
                            <button
                              key={node.id}
                              onClick={function selectNode() {
                                setCurrentNodeId(node.id);
                              }}
                              className={`w-full flex justify-between items-center p-2 rounded border transition-all ${isFocus ? "bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-300" : "bg-white hover:bg-indigo-50 border-gray-200"}`}
                            >
                              <span className="flex items-center gap-2">
                                <span className="font-bold font-mono text-sm">{node.san}</span>
                                {moveMark && (
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${getMoveMarkBadgeClass(moveMark.mark, isFocus)}`}
                                  >
                                    {moveMark.mark}
                                  </span>
                                )}
                              </span>
                              {nodeAnalysis && (
                                <span
                                  className={`text-[10px] font-bold ${isFocus ? "text-indigo-100" : "text-gray-500"}`}
                                >
                                  {formatEvaluation(nodeAnalysis.evaluation)}{" "}
                                  {nodeAnalysis.depth > 0 && <span className="opacity-50">d{nodeAnalysis.depth}</span>}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {(hasWhiteVariations || hasBlackVariations) && (
                      <div className="ml-10 grid grid-cols-2 gap-2">
                        <div className="min-h-0 border-l-2 border-indigo-100 pl-3 py-1 flex flex-wrap gap-1">
                          {hasWhiteVariations &&
                            whiteVariations.map(function renderWhiteVariation(variation) {
                              if (variation.id === whiteNode.id) return null;
                              return (
                                <button
                                  key={variation.id}
                                  onClick={function selectWhiteVariation() {
                                    setCurrentNodeId(variation.id);
                                    setActiveLineId(getDeepestLeaf(variation.id, tree));
                                  }}
                                  className="text-[9px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold transition-colors"
                                >
                                  alt: {variation.san}
                                </button>
                              );
                            })}
                        </div>
                        <div className="min-h-0 border-l-2 border-indigo-100 pl-3 py-1 flex flex-wrap gap-1">
                          {hasBlackVariations &&
                            blackVariations.map(function renderBlackVariation(variation) {
                              if (variation.id === blackNode?.id) return null;
                              return (
                                <button
                                  key={variation.id}
                                  onClick={function selectBlackVariation() {
                                    setCurrentNodeId(variation.id);
                                    setActiveLineId(getDeepestLeaf(variation.id, tree));
                                  }}
                                  className="text-[9px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold transition-colors"
                                >
                                  alt: {variation.san}
                                </button>
                              );
                            })}
                        </div>
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
              <Link to="/import/chess-com" className="text-[10px] text-indigo-600 font-bold hover:underline">
                Chess.com
              </Link>
              <button
                onClick={loadSample}
                className="inline-flex items-center gap-1.5 text-[10px] text-indigo-600 font-bold hover:underline"
              >
                <RenderIcon iconType={GiPerspectiveDiceSixFacesRandom} className="text-xs" />
                <span>Sample</span>
              </button>
            </div>
          </div>
          <form
            onSubmit={function submitPgn(event) {
              event.preventDefault();
              importPgn(pgnInput);
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              className="w-full h-32 p-2 text-xs font-mono border rounded outline-none bg-white"
              value={pgnInput}
              onChange={(event) => {
                setPgnInput(event.target.value);
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
}

function PlayerCard({ info }: { info: { side: "white" | "black"; player: PlayerInfo | null } }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-1 flex items-center justify-between gap-4">
      <div className={"flex items-center gap-2"}>
        <span className="text-sm font-bold text-gray-900">{info.player?.name ?? info?.side ?? "Unknown"}</span>
        {!!info.player?.rating && (
          <span className="text-sm font-mono font-bold text-gray-500">({info.player.rating})</span>
        )}
      </div>
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
  if (!node) return "";

  let pgn = isWhite ? `${moveNum}. ` : isFirstInVariation ? `${moveNum}... ` : "";
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
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (target.isContentEditable) return true;

  return Boolean(target.closest('[contenteditable="true"]'));
}

function getDisplayedPlayersInfo(
  playersInfo: GamePlayersInfo | null,
  orientation: "white" | "black",
): {
  top: { side: "white" | "black"; player: PlayerInfo | null };
  bottom: { side: "white" | "black"; player: PlayerInfo | null };
} {
  if (orientation === "black") {
    return {
      top: { side: "white", player: playersInfo?.white ?? null },
      bottom: { side: "black", player: playersInfo?.black ?? null },
    };
  }

  return {
    top: { side: "black", player: playersInfo?.black ?? null },
    bottom: { side: "white", player: playersInfo?.white ?? null },
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

function buildAnalysisTasks(tree: Record<string, MoveNode>, currentNodeId: string | null): ScheduledTask[] {
  const allNodeIds = Object.keys(tree);
  const tasks: ScheduledTask[] = [];
  const taskKeys = new Set<string>();

  function addTasksForNodes(
    nodeIds: string[],
    minDepth: number,
    linesAmount: number,
    priority: EngineEvaluationPriority,
  ): void {
    for (const nodeId of nodeIds) {
      if (!tree[nodeId]) continue;
      const fen = tree[nodeId].fen;
      const label = tree[nodeId].san || "___";
      const request = { minDepth, linesAmount };

      if (getTerminalEvaluation(fen)) continue;

      const key = [nodeId, fen, minDepth, linesAmount, priority].join("|");
      if (taskKeys.has(key)) continue;

      taskKeys.add(key);
      tasks.push({
        nodeId,
        fen: fen,
        label: label,
        request: request,
        priority,
      });
    }
  }

  if (currentNodeId) {
    addTasksForNodes([currentNodeId], 12, 3, EngineEvaluationPriorities.IMMEDIATE);
    addTasksForNodes([currentNodeId], 16, 3, EngineEvaluationPriorities.NEXT);
  }

  addTasksForNodes(allNodeIds, 12, 1, EngineEvaluationPriorities.BACKGROUND);

  return tasks;
}

function getSelectedAnalysisTarget(tree: Record<string, MoveNode>, currentNodeId: string | null): ScheduledTask | null {
  if (!currentNodeId) return null;
  const node = tree[currentNodeId];
  if (!node) return null;

  return {
    nodeId: node.id,
    fen: node.fen,
    label: node.san || "___",
    request: { minDepth: 22, linesAmount: 3 },
    priority: EngineEvaluationPriorities.IMMEDIATE,
  };
}

function uciToSanLine(uciString: string, baseFen: string): string[] {
  const tempGame = new Chess(baseFen);
  const uciMoves = uciString.split(" ");
  const sanMoves: string[] = [];

  for (const uciMove of uciMoves) {
    try {
      const move = tempGame.move({
        from: uciMove.substring(0, 2),
        to: uciMove.substring(2, 4),
        promotion: uciMove[4] || "q",
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
  const sanMoves = uciToSanLine(line.pv.join(" "), baseFen);
  if (sanMoves.length === 0) return null;

  return {
    suggestedMove: sanMoves[0],
    suggestedMoveUci: line.uci,
    engineLineUci: line.pv,
    engineLine: sanMoves.join(" "),
    score: line.evaluation,
    depth: line.depth,
    lineRank: line.multipv,
  };
}

function toDisplayLines(baseFen: string, lines: ChessEngineLine[]): DisplayEngineLine[] {
  return lines.map((line) => toDisplayLine(baseFen, line)).filter((line) => line !== null);
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

function buildSeededNodeAnalysis(
  childFen: string,
  line: DisplayEngineLine,
  lineNextMovesUci: string[],
): NodeAnalysis | null {
  const childLines =
    lineNextMovesUci.length > 0
      ? toSeededDisplayLines(
          lineNextMovesUci,
          line.score,
          line.depth,
          uciToSanLine(lineNextMovesUci.join(" "), childFen),
        )
      : [];

  return {
    fen: childFen,
    evaluation: line.score,
    depth: line.depth,
    lines: childLines,
    isFinal: false,
  };
}

function buildTerminalNodeAnalysis(fen: string): NodeAnalysis | null {
  const evaluation = getTerminalEvaluation(fen);
  if (!evaluation) return null;

  return {
    fen,
    evaluation,
    depth: 0,
    lines: [],
    isFinal: true,
  };
}

function toSeededDisplayLines(
  lineNextMovesUci: string[],
  score: EngineEvaluation,
  depth: number,
  lineNextMovesSan: string[],
): DisplayEngineLine[] {
  if (lineNextMovesSan.length === 0) return [];

  return [
    {
      suggestedMove: lineNextMovesSan[0],
      suggestedMoveUci: lineNextMovesUci[0],
      engineLineUci: lineNextMovesUci,
      engineLine: lineNextMovesSan.join(" "),
      score: score,
      depth: depth,
      lineRank: 1,
    },
  ];
}

function buildMoveMarksByNodeId(
  tree: Record<string, MoveNode>,
  analysesByNodeId: Record<string, NodeAnalysis>,
): Record<string, MoveMarkResult> {
  const marksByNodeId: Record<string, MoveMarkResult> = {};
  const pathKeyByNodeId = new Map<string, string | null>();

  Object.values(tree).forEach(function classifyNode(node) {
    const movePathKey = getPgnToPosition(node.id, tree, pathKeyByNodeId);
    const isKnownByFen = OpeningsBook.isKnownPositionByFen(node.fen);
    const isKnownByMovePath = movePathKey ? OpeningsBook.isKnownMovePathKey(movePathKey) : false;

    if (isKnownByFen || isKnownByMovePath) {
      marksByNodeId[node.id] = {
        mark: MoveMark.BOOK,
        evalLoss: 0,
        bestMoveUci: null,
      };
      return;
    }

    const parentAnalysis = node.parentId ? analysesByNodeId[node.parentId] : analysesByNodeId[ROOT_ANALYSIS_NODE_ID];
    const nodeAnalysis = analysesByNodeId[node.id];
    const parentFen = node.parentId ? tree[node.parentId]?.fen : START_FEN;
    if (!parentFen) return;
    if (!parentAnalysis?.isFinal || !nodeAnalysis?.isFinal) return;
    if (parentAnalysis.lines.length === 0) return;

    const mark = classifyMoveMark({
      parentFen,
      playedMoveSan: node.san,
      playedEvaluation: toMoveMarkEvaluation(nodeAnalysis.evaluation),
      parentLines: parentAnalysis.lines.map(function toEngineLine(line) {
        return {
          uci: line.suggestedMoveUci,
          evaluation: toMoveMarkEvaluation(line.score),
        };
      }),
    });

    if (mark) marksByNodeId[node.id] = mark;
  });

  return marksByNodeId;
}

function getPgnToPosition(
  nodeId: string,
  tree: Record<string, MoveNode>,
  cache: Map<string, string | null>,
): string | null {
  if (cache.has(nodeId)) {
    return cache.get(nodeId) ?? null;
  }

  const node = tree[nodeId];
  if (!node) {
    cache.set(nodeId, null);
    return null;
  }

  if (!node.parentId) {
    const rootPathKey = OpeningsBook.toMovePathKey([node.san]);
    cache.set(nodeId, rootPathKey);
    return rootPathKey;
  }

  const parentPathKey = getPgnToPosition(node.parentId, tree, cache);
  if (!parentPathKey) {
    const fallbackPathKey = OpeningsBook.toMovePathKey([node.san]);
    cache.set(nodeId, fallbackPathKey);
    return fallbackPathKey;
  }

  const nodePathKey = `${parentPathKey} ${node.san}`;
  cache.set(nodeId, nodePathKey);
  return nodePathKey;
}

function toLinePgn(nodeId: string, tree: Record<string, MoveNode>): string | null {
  const sanMoves: string[] = [];
  let currentNodeId: string | null = nodeId;

  while (currentNodeId) {
    const node = tree[currentNodeId];
    if (!node) break;
    sanMoves.unshift(node.san);
    currentNodeId = node.parentId;
  }

  if (sanMoves.length === 0) return null;
  return toPgnFromSanMoves(sanMoves);
}

function toPgnFromSanMoves(sanMoves: string[]): string {
  return sanMoves
    .map(function toPgnToken(sanMove, index) {
      if (index % 2 === 0) {
        return `${Math.floor(index / 2) + 1}. ${sanMove}`;
      }

      return sanMove;
    })
    .join(" ");
}

function getMoveSquares(baseFen: string, san: string): { from: string; to: string } | null {
  const tempGame = new Chess(baseFen === START ? undefined : baseFen);

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
    case MoveMark.BOOK:
      return isFocus ? "bg-sky-200 text-sky-900" : "bg-sky-100 text-sky-700";
    case MoveMark.BEST:
      return isFocus ? "bg-green-200 text-green-900" : "bg-green-100 text-green-700";
    case MoveMark.OK:
      return isFocus ? "bg-gray-200 text-gray-900" : "bg-gray-100 text-gray-700";
    case MoveMark.INACCURACY:
      return isFocus ? "bg-yellow-200 text-yellow-900" : "bg-yellow-100 text-yellow-800";
    case MoveMark.MISTAKE:
      return isFocus ? "bg-orange-200 text-orange-900" : "bg-orange-100 text-orange-800";
    case MoveMark.MISS:
      return isFocus ? "bg-cyan-200 text-cyan-900" : "bg-cyan-100 text-cyan-700";
    case MoveMark.BLUNDER:
      return isFocus ? "bg-red-200 text-red-900" : "bg-red-100 text-red-700";
    case MoveMark.ONLY_MOVE:
      return isFocus ? "bg-blue-200 text-blue-900" : "bg-blue-100 text-blue-700";
    case MoveMark.BRILLIANT:
      return isFocus ? "bg-teal-200 text-teal-900" : "bg-teal-100 text-teal-700";
    default:
      return isFocus ? "bg-gray-200 text-gray-900" : "bg-gray-100 text-gray-700";
  }
}

function areNodeAnalysesEqual(left?: NodeAnalysis, right?: NodeAnalysis): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  return (
    left.fen === right.fen &&
    areEvaluationsEqual(left.evaluation, right.evaluation) &&
    left.depth === right.depth &&
    left.isFinal === right.isFinal &&
    areDisplayLinesEqual(left.lines, right.lines)
  );
}

function areDisplayLinesEqual(left: DisplayEngineLine[], right: DisplayEngineLine[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftLine = left[index];
    const rightLine = right[index];
    if (
      leftLine.suggestedMove !== rightLine.suggestedMove ||
      leftLine.suggestedMoveUci !== rightLine.suggestedMoveUci ||
      leftLine.engineLineUci.join(" ") !== rightLine.engineLineUci.join(" ") ||
      leftLine.engineLine !== rightLine.engineLine ||
      !areEvaluationsEqual(leftLine.score, rightLine.score) ||
      leftLine.depth !== rightLine.depth ||
      leftLine.lineRank !== rightLine.lineRank
    ) {
      return false;
    }
  }

  return true;
}

function pickPreferredAnalysis(currentAnalysis: NodeAnalysis | undefined, nextAnalysis: NodeAnalysis): NodeAnalysis {
  const mergedNextAnalysis = mergeNodeAnalysisLines(currentAnalysis, nextAnalysis);
  if (!currentAnalysis) return nextAnalysis;
  if (mergedNextAnalysis.depth < currentAnalysis.depth) return currentAnalysis;
  if (mergedNextAnalysis.lines.length < currentAnalysis.lines.length) return currentAnalysis;
  if (!mergedNextAnalysis.isFinal && currentAnalysis.isFinal) return currentAnalysis;
  return mergedNextAnalysis;
}

function mergeNodeAnalysisLines(currentAnalysis: NodeAnalysis | undefined, nextAnalysis: NodeAnalysis): NodeAnalysis {
  if (!currentAnalysis) return nextAnalysis;
  if (currentAnalysis.fen !== nextAnalysis.fen) return nextAnalysis;
  if (nextAnalysis.lines.length >= currentAnalysis.lines.length) return nextAnalysis;

  const mergedByMultiPv = new Map<number, DisplayEngineLine>();
  nextAnalysis.lines.forEach(function addNext(line) {
    mergedByMultiPv.set(line.lineRank, line);
  });
  currentAnalysis.lines.forEach(function addMissing(line) {
    if (!mergedByMultiPv.has(line.lineRank)) mergedByMultiPv.set(line.lineRank, line);
  });

  return {
    ...nextAnalysis,
    lines: [...mergedByMultiPv.values()].sort(function sortByMultiPv(left, right) {
      return left.lineRank - right.lineRank;
    }),
  };
}

export default ChessReplay;
