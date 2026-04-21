import { Chess, type Move, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaAnglesLeft,
  FaChevronLeft,
  FaChevronRight,
  FaFileImport,
  FaMagnifyingGlassPlus,
  FaRotate,
  FaTrashCan,
} from "react-icons/fa6";
import { GiPerspectiveDiceSixFacesRandom, GiStrikingArrows } from "react-icons/gi";
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
  type AbsoluteNumericEvaluation,
  absoluteNumericEvaluationToEngineEvaluation,
  evalToNum,
  Evaluations,
  getAbsoluteTerminalEvaluation,
  getTerminalEvaluation,
  START,
  START_FEN,
} from "../lib/evaluation";
import { classifyMoveMark, type MoveMark, type MoveMarkResult, MoveMarks } from "../lib/moveMarks";
import { OpeningsBook } from "../lib/OpeningsBook";
import EvaluationThermometer from "./EvaluationThermometer";
import { createMoveMarkSquareRenderer } from "./MoveMarkSquareRenderer";
import RenderIcon from "./RenderIcon";
import { MoveList } from "../pages/AnalyzerPage/MoveList.tsx";
import absoluteNumericEvaluationOfEngineEvaluation = Evaluations.absoluteNumericEvaluationOfEngineEvaluation;

export interface MoveNode {
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
  evaluation: AbsoluteNumericEvaluation;
  depth: number;
  /** rank of the line. 1 = suggestion*/
  lineRank: number;
}

export interface NodeAnalysis {
  fen: string;
  evaluation: AbsoluteNumericEvaluation;
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

export const ROOT_ANALYSIS_NODE_ID = "__root__";
const PLAN_CAPTURE_SQUARE_STYLE = {
  backgroundColor: "rgba(220, 38, 38, 0.45)",
  boxShadow: "inset 0 0 0 3px rgba(185, 28, 28, 0.85)",
};

const TREE_SEED = {
  __root__: {
    id: ROOT_ANALYSIS_NODE_ID,
    san: "",
    fen: START_FEN,
    parentId: null,
    children: [],
  },
};

function ChessReplay() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pgnInput, setPgnInput] = useState("");
  const [tree, setTree] = useState<Record<string, MoveNode>>({ ...TREE_SEED });

  const [currentNodeId, setCurrentNodeId] = useState<string>(ROOT_ANALYSIS_NODE_ID);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [positionAnalysisMap, setPositionAnalysisMap] = useState<Record<string, NodeAnalysis>>({});
  const [statusText, setStatusText] = useState("Interactive Mode");
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [playersInfo, setPlayersInfo] = useState<GamePlayersInfo | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [importedFullPgn, setImportedFullPgn] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const currentLinePgn = useMemo(() => {
    return toLinePgn(currentNodeId, tree) ?? "";
  }, [currentNodeId, tree]);

  const [lastBookOpeningName, setLastBookOpeningName] = useState<string | null>(null);

  const engine = useMemo(() => getChessEngine(), []);

  const lastImportedRouteKeyRef = useRef<string | null>(null);
  const moveMarksBySquareRef = useRef<Record<string, MoveMark>>({});

  function goStart() {
    setCurrentNodeId(ROOT_ANALYSIS_NODE_ID);
  }

  const goBack = useCallback(() => {
    setCurrentNodeId((previous) => {
      return tree[previous]?.parentId ?? ROOT_ANALYSIS_NODE_ID;
    });
  }, [tree]);

  const goForward = useCallback(() => {
    setCurrentNodeId((previous) => getNextNodeId(previous, tree) ?? previous);
  }, [tree]);

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
  }, [goBack, tree]);

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
  }, [goForward, tree]);

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

  const visiblePath: MoveNode[] = useMemo(() => {
    const path: MoveNode[] = [];
    let current = activeLineId;

    while (current) {
      const node = tree[current];
      if (!node) break;
      if (node.parentId === null) break;
      path.unshift(node);
      current = node.parentId;
    }

    console.log("visiblePath", path);
    return path;
  }, [activeLineId, tree]);

  const currentAnalysis = positionAnalysisMap[currentNodeId || ROOT_ANALYSIS_NODE_ID];
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

  const currentMoveMark: MoveMarkResult = moveMarksMap[currentNodeId ?? ROOT_ANALYSIS_NODE_ID];

  const currentMoveSquares: { from: string; to: string } = useMemo(
    function buildCurrentMoveSquares() {
      const node = tree[currentNodeId];
      if (!node?.parentId) return null;

      const parent = tree[node.parentId];
      if (!parent) return null;

      return getMoveSquares(parent.fen, node.san);
    },
    [currentNodeId, tree],
  );

  const moveMarksBySquare = useMemo<Record<string, MoveMark>>(() => {
    if (!currentMoveMark || !currentMoveSquares?.to) return {};

    return {
      [currentMoveSquares.to]: currentMoveMark.mark,
    };
  }, [currentMoveMark, currentMoveSquares]);

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

  const currentFen: string = useMemo(() => tree[currentNodeId].fen, [currentNodeId, tree]);

  const currentPositionGame = useMemo(() => new Chess(currentFen), [currentFen]);
  const selectedSquareMoves = useMemo<Move[]>(
    function buildSelectedSquareMoves() {
      if (!selectedSquare) return [];

      try {
        return currentPositionGame.moves({ square: selectedSquare, verbose: true });
      } catch {
        return [];
      }
    },
    [currentPositionGame, selectedSquare],
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
      const stylesBySquare: Record<string, Record<string, string | number>> = {};

      function mergeSquareStyle(square: string, style: Record<string, string | number>) {
        const current = stylesBySquare[square];
        if (!current) {
          stylesBySquare[square] = style;
          return;
        }

        const currentBoxShadow = typeof current.boxShadow === "string" ? current.boxShadow : "";
        const nextBoxShadow = typeof style.boxShadow === "string" ? style.boxShadow : "";
        const mergedBoxShadow =
          currentBoxShadow && nextBoxShadow
            ? `${currentBoxShadow}, ${nextBoxShadow}`
            : nextBoxShadow || currentBoxShadow || undefined;

        stylesBySquare[square] = {
          ...current,
          ...style,
          ...(mergedBoxShadow ? { boxShadow: mergedBoxShadow } : {}),
        };
      }

      planView.captureSquares.forEach(function applyCaptureSquareStyle(square) {
        mergeSquareStyle(square, PLAN_CAPTURE_SQUARE_STYLE);
      });

      if (selectedSquare) {
        mergeSquareStyle(selectedSquare, {
          backgroundColor: "#fff6",
          boxShadow: "inset 0 0 0 3px #fff6",
        });
      }

      selectedSquareMoves.forEach(function applyLegalTargetStyle(move) {
        const isCapture = move.isCapture();
        mergeSquareStyle(move.to, {
          ...(isCapture
            ? {
                boxShadow: "inset 0 0 0 4px #fff6",
              }
            : {
                background: "radial-gradient(circle, #fff6 0%, #fff6 22%, #fff0 26%)",
              }),
        });
      });

      return stylesBySquare;
    },
    [planView.captureSquares, selectedSquare, selectedSquareMoves],
  );
  const canGoForward = useMemo(() => tree[currentNodeId]?.children?.[0] ?? false, [currentNodeId, tree]);

  const displayedPlayersInfo = getDisplayedPlayersInfo(playersInfo, boardOrientation);

  useEffect(() => {
    if (!fullTreePgn) return;
    setPgnInput(fullTreePgn);
  }, [fullTreePgn]);

  useEffect(
    function keepActiveLineVisible() {
      if (!currentNodeId || currentNodeId === ROOT_ANALYSIS_NODE_ID) return;
      if (visiblePath.some((node) => node.id === currentNodeId)) return;
      setActiveLineId(getDeepestLeaf(currentNodeId, tree));
    },
    [currentNodeId, tree, visiblePath],
  );

  useEffect(
    function getCurrentMoveCachedAnalysis() {
      const terminalAnalysis = buildTerminalNodeAnalysis(currentFen);
      if (terminalAnalysis) {
        syncSingleNodeAnalysis(currentNodeId, terminalAnalysis);
        return;
      }

      void (async () => {
        const cachedEvaluation = await engine.getEvaluation(currentFen, 0);
        if (cachedEvaluation) {
          syncSingleNodeAnalysis(currentNodeId, {
            fen: cachedEvaluation.fen,
            evaluation: absoluteNumericEvaluationOfEngineEvaluation(cachedEvaluation.evaluation),
            depth: cachedEvaluation.depth,
            lines: toDisplayLines(currentFen, cachedEvaluation.lines),
            isFinal: true,
          });
          return;
        }
      })().catch((error) => {
        console.error("Failed to hydrate selected node analysis", error);
      });
    },
    [currentFen, currentNodeId, engine, tree],
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
  }, [tree, currentNodeId, engine]);

  useEffect(
    function clearSelectedSquareOnPositionChange() {
      setSelectedSquare(null);
    },
    [currentFen],
  );

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

    void engine
      .evaluate(target.fen, { minDepth: 22, linesAmount: 3 }, EngineEvaluationPriorities.IMMEDIATE, (update) => {
        syncSingleNodeAnalysis(target.nodeId, toNodeAnalysis(target.fen, update, update.isFinal));
        setStatusText(`Analyzing ${target.label} (d22)...`);
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
      const nextNodeId =
        currentNodeId && currentNodeId !== ROOT_ANALYSIS_NODE_ID ? `${currentNodeId}|${result.san}` : result.san;

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
    const moveResult = makeMove({ from: sourceSquare, to: targetSquare, promotion: "q" });
    if (!moveResult) return false;
    setSelectedSquare(null);
    return true;
  }

  function onSquareClick(square: string) {
    const clickedSquare = square as Square;

    function isMovableOwnPiece(targetSquare: Square) {
      const piece = currentPositionGame.get(targetSquare);
      if (!piece) return false;
      if (piece.color !== currentPositionGame.turn()) return false;
      return currentPositionGame.moves({ square: targetSquare, verbose: true }).length > 0;
    }

    if (!selectedSquare) {
      if (isMovableOwnPiece(clickedSquare)) setSelectedSquare(clickedSquare);
      return;
    }

    if (selectedSquare === clickedSquare) {
      setSelectedSquare(null);
      return;
    }

    const moveResult = makeMove({ from: selectedSquare, to: clickedSquare, promotion: "q" });
    if (moveResult) {
      setSelectedSquare(null);
      return;
    }

    if (isMovableOwnPiece(clickedSquare)) {
      setSelectedSquare(clickedSquare);
      return;
    }

    setSelectedSquare(null);
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
      const nextTree: Record<string, MoveNode> = { ...TREE_SEED };
      const walker = new Chess();

      moves.forEach(function addMove(moveSan) {
        const result = walker.move(moveSan);
        const nodeId = lastNodeId ? `${lastNodeId}|${result.san}` : result.san;
        const parent = lastNodeId || ROOT_ANALYSIS_NODE_ID;

        if (!nextTree[nodeId]) {
          nextTree[nodeId] = {
            id: nodeId,
            san: result.san,
            fen: walker.fen(),
            parentId: parent,
            children: [],
          };
          if (parent) {
            nextTree[parent] = {
              ...nextTree[parent],
              children: [...nextTree[parent].children, nodeId],
            };
          }
        }

        lastNodeId = nodeId;
      });

      setTree(nextTree);
      setActiveLineId(lastNodeId);
      setCurrentNodeId(lastNodeId);
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
    setTree({ ...TREE_SEED });
    setCurrentNodeId(ROOT_ANALYSIS_NODE_ID);
    setActiveLineId(ROOT_ANALYSIS_NODE_ID);
    setPgnInput("");
    setImportedFullPgn("");
    setPlayersInfo(null);
    setPositionAnalysisMap({});
    setStatusText("Interactive Mode");
    setBoardOrientation("white");
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-4 max-w-7xl mx-auto bg-white shadow-lg border border-gray-100 min-h-175">
      <div className="flex-1 flex flex-col items-center gap-2">
        <div className="w-full">
          <PlayerCard info={displayedPlayersInfo.top} />
        </div>
        <div className="w-full max-w-180 flex rounded-md items-stretch border-8 border-gray-800 bg-gray-800">
          <EvaluationThermometer
            evaluation={currentAnalysis?.evaluation != null ? absoluteNumericEvaluationToEngineEvaluation(currentAnalysis.evaluation) : null}
            orientation={boardOrientation}
            className="w-6 self-stretch"
          />
          <div className="flex-1 min-w-0 shadow-2xl overflow-hidden">
            <Chessboard
              id="AnalysisBoard"
              position={currentNodeId ? tree[currentNodeId].fen : START_FEN}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              boardOrientation={boardOrientation}
              animationDuration={300}
              customArrows={planView.arrows}
              customSquare={moveMarkSquareRenderer}
              customSquareStyles={boardSquareStyles}
            />
          </div>
        </div>
        <div className="w-full">
          <PlayerCard info={displayedPlayersInfo.bottom} />
        </div>
      </div>

      <div className="w-full lg:w-md flex flex-col gap-4 shrink-0 lg:overflow-y-auto ">
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
        <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Engine</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPlans((it) => !it)}
                title={"Show engine plan arrows"}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded border ${showPlans ? "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100" : "text-gray-600 border-gray-300 bg-white hover:bg-gray-100"}`}
              >
                <RenderIcon iconType={GiStrikingArrows} className="text-xs" />
              </button>
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
              const scoreValue = line.evaluation;
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
                        {Evaluations.toString(line.evaluation)}
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

        <div className="flex-1 bg-gray-50 p-4 rounded-md border border-gray-200 flex flex-col overflow-hidden">
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
          <MoveList
            visiblePath={visiblePath}
            tree={tree}
            currentNodeId={currentNodeId}
            positionAnalysisMap={positionAnalysisMap}
            moveMarksMap={moveMarksMap}
            setCurrentNodeId={setCurrentNodeId}
            setActiveLineId={setActiveLineId}
          />
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

function getNextNodeId(currentNodeId: string, tree: Record<string, MoveNode>): string | null {
  return tree[currentNodeId]?.children?.[0] ?? null;
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

  function addTask(
    nodeId: string,
    fen: string,
    label: string,
    minDepth: number,
    linesAmount: number,
    priority: EngineEvaluationPriority,
  ): void {
    if (getTerminalEvaluation(fen)) return;

    const key = [nodeId, fen, minDepth, linesAmount, priority].join("|");
    if (taskKeys.has(key)) return;

    taskKeys.add(key);
    tasks.push({
      nodeId,
      fen,
      label,
      request: { minDepth, linesAmount },
      priority,
    });
  }

  function addTasksForNodes(
    nodeIds: string[],
    minDepth: number,
    linesAmount: number,
    priority: EngineEvaluationPriority,
  ): void {
    for (const nodeId of nodeIds) {
      if (!tree[nodeId]) continue;
      const fen = tree[nodeId].fen;
      const label = tree[nodeId].san;
      addTask(nodeId, fen, label, minDepth, linesAmount, priority);
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

function toDisplayLines(baseFen: string, lines: ChessEngineLine[]): DisplayEngineLine[] {
  return lines
    .map((line) => {
      const sanMoves = uciToSanLine(line.pv.join(" "), baseFen);
      if (sanMoves.length === 0) return null;

      const displayEngineLine: DisplayEngineLine = {
        suggestedMove: sanMoves[0],
        suggestedMoveUci: line.uci,
        engineLineUci: line.pv,
        engineLine: sanMoves.join(" "),
        evaluation: evalToNum(line.evaluation),
        depth: line.depth,
        lineRank: line.multipv,
      };

      return displayEngineLine;
    })
    .filter((line) => line !== null);
}

function toNodeAnalysis(baseFen: string, evaluation: FullMoveEvaluation, isFinal: boolean): NodeAnalysis {
  return {
    fen: evaluation.fen,
    evaluation: absoluteNumericEvaluationOfEngineEvaluation(evaluation.evaluation),
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
          line.evaluation,
          line.depth - 1,
          uciToSanLine(lineNextMovesUci.join(" "), childFen),
        )
      : [];

  return {
    fen: childFen,
    evaluation: line.evaluation,
    depth: line.depth - 1,
    lines: childLines,
    isFinal: false,
  };
}

function buildTerminalNodeAnalysis(fen: string): NodeAnalysis | null {
  const absoluteTerminalEvaluation = getAbsoluteTerminalEvaluation(fen);
  if (absoluteTerminalEvaluation === null || absoluteTerminalEvaluation === undefined) {
    return null
  }

  return {
    fen,
    evaluation: absoluteTerminalEvaluation,
    depth: 0,
    lines: [],
    isFinal: true,
  };
}

function toSeededDisplayLines(
  lineNextMovesUci: string[],
  score: AbsoluteNumericEvaluation,
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
      evaluation: score,
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
        mark: MoveMarks.BOOK,
        evalLoss: 0,
        bestMoveUci: null,
      };
      return;
    }

    const parentAnalysis = analysesByNodeId[node.parentId ?? ROOT_ANALYSIS_NODE_ID];
    const nodeAnalysis = analysesByNodeId[node.id];
    const parentFen = node.parentId ? tree[node.parentId]?.fen : START_FEN;
    if (!parentFen) return;
    if (!parentAnalysis?.isFinal || !nodeAnalysis?.isFinal) return;
    if (parentAnalysis.lines.length === 0) return;

    const mark = classifyMoveMark({
      parentFen,
      playedMoveSan: node.san,
      playedEvaluation: nodeAnalysis.evaluation,
      parentLines: parentAnalysis.lines.map(function toEngineLine(line: DisplayEngineLine) {
        return {
          uci: line.suggestedMoveUci,
          evaluation: line.evaluation,
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

function areNodeAnalysesEqual(left?: NodeAnalysis, right?: NodeAnalysis): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  return (
    left.fen === right.fen &&
    left.evaluation === right.evaluation &&
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
      leftLine.evaluation !== rightLine.evaluation ||
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
