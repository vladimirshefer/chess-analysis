import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaAnglesLeft, FaChevronLeft, FaChevronRight, FaFileImport, FaRotate, FaTrashCan } from "react-icons/fa6";
import { GiPerspectiveDiceSixFacesRandom } from "react-icons/gi";
import { Link, useLocation } from "react-router-dom";
import { AnalyzerPageEnginePlan } from "../pages/AnalyzerPage/EnginePlan";
import {
  type ChessEngine,
  type ChessEngineLine,
  EngineEvaluationPriorities,
  type EngineEvaluationPriority,
  type EvaluationRequest,
  type FullMoveEvaluation,
  getChessEngine,
} from "../lib/ChessEngine.ts";
import { Analytics } from "../lib/Analytics.ts";
import { type GamePlayersInfo, type ImportedGameInfo, mergePlayersInfo, type PlayerInfo } from "../lib/gameInfo";
import {
  type AbsoluteNumericEvaluation,
  absoluteNumericEvaluationToEngineEvaluation,
  evalToNum,
  Evaluations,
  START,
  START_FEN,
} from "../lib/evaluation";
import { classifyMoveMark, type MoveMark, type MoveMarkResult, MoveMarks } from "../lib/moveMarks";
import { OpeningsBook } from "../lib/OpeningsBook";
import EvaluationThermometer from "./EvaluationThermometer";
import RenderIcon from "./RenderIcon";
import ChessComLastGameSuggestionPane from "./ChessComLastGameSuggestionPane.tsx";
import { MoveList } from "../pages/AnalyzerPage/MoveList.tsx";
import { useLocalStorageNumericState } from "../lib/hooks/useLocalStorageNumericState.ts";
import { EnginePane } from "../pages/AnalyzerPage/EnginePane.tsx";
import { ExtendedChessBoard } from "./ExtendedChessBoard.tsx";
import { useQuery } from "@tanstack/react-query";
import absoluteNumericEvaluationOfEngineEvaluation = Evaluations.absoluteNumericEvaluationOfEngineEvaluation;

export interface MoveNode {
  id: string;
  san: string;
  fen: string;
  parentId: string | null;
  children: string[];
}

export interface DisplayEngineLine {
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
  opening?: OpeningsBook.Opening | null;
  openingLookupDone?: boolean;
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

const TREE_SEED: Record<string, MoveNode> = {
  [ROOT_ANALYSIS_NODE_ID]: {
    id: ROOT_ANALYSIS_NODE_ID,
    san: "",
    fen: START_FEN,
    parentId: null,
    children: [],
  },
};

const ENGINE_DEPTH_STORAGE_KEY = "analyzer-engine-selected-depth";
const NODE_ID_DELIMITER = `|`;

function ChessReplay() {
  const [originalPgn, setOriginalPgn] = useState("");
  const location = useLocation();
  const lastImportedRouteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const locationState = location.state as AnalyzerLocationState | null;
    const importedPgn = locationState?.importedPgn?.trim();
    if (!importedPgn) return;
    if (lastImportedRouteKeyRef.current === location.key) return;

    lastImportedRouteKeyRef.current = location.key;
    history.pushState(null, "", location.pathname);
    // eslint-disable-next-line
    setOriginalPgn(importedPgn);
  }, [location, location.key, location.pathname, location.state]);

  return <ChessReplayImpl originalPgn={originalPgn} setOriginalPgn={(pgn) => setOriginalPgn(pgn)} />;
}

function ChessReplayImpl({
  originalPgn,
  setOriginalPgn,
}: {
  originalPgn: string;
  setOriginalPgn: (pgn: string) => void;
}) {
  const [pgnInputText, setPgnInputText] = useState(originalPgn);
  const [tree, setTree] = useState<Record<string, MoveNode>>({ ...TREE_SEED });

  const [currentNodeId, setCurrentNodeId] = useState<string>(ROOT_ANALYSIS_NODE_ID);
  const [activeLineId, setActiveLineId] = useState<string>(ROOT_ANALYSIS_NODE_ID);
  const [positionAnalysisMap, setPositionAnalysisMap] = useState<Record<string, NodeAnalysis>>({});
  const [statusText, setStatusText] = useState("Welcome");
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [playersInfo, setPlayersInfo] = useState<GamePlayersInfo | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [selectedDepth, setSelectedDepth] = useLocalStorageNumericState(ENGINE_DEPTH_STORAGE_KEY, 12);
  const deepAnalysisDepth = Math.max(selectedDepth + 4, 22);
  const hasExistingAnalysis = tree[ROOT_ANALYSIS_NODE_ID].children.length > 0;
  const currentFen: string = useMemo(() => tree[currentNodeId]?.fen ?? START_FEN, [currentNodeId, tree]);

  const engineQuery = useQuery({
    queryKey: ["engine"],
    queryFn: async () => getChessEngine(),
  });

  const engine = useMemo(() => engineQuery.data as ChessEngine | undefined, [engineQuery.data]);

  const openingsBookQuery = useQuery({
    queryKey: ["openingsBook"],
    queryFn: async () => {
      await OpeningsBook.getKnownPositionEpds();
      return true;
    },
  });

  const openingsReady = useMemo(() => !!openingsBookQuery.data, [openingsBookQuery.data]);

  useEffect(() => {
    const tempGame = new Chess();

    try {
      tempGame.loadPgn(originalPgn);
    } catch {
      console.error("Invalid PGN", originalPgn);
      setStatusText("Invalid PGN");
    }

    const headers = tempGame.getHeaders();

    function toInt(rating: string | number | undefined) {
      return rating ? parseInt(rating + "", 10) : undefined;
    }

    const parsedPlayersInfo = {
      white: {
        name: headers.White,
        rating: toInt(headers.WhiteElo),
      },
      black: {
        name: headers.Black,
        rating: toInt(headers.BlackElo),
      },
    };

    const mergedPlayersInfo = mergePlayersInfo(parsedPlayersInfo, null);
    const moves = tempGame.history();
    let lastNodeId: string | null = null;
    const nextTree: Record<string, MoveNode> = { ...TREE_SEED };
    const walker = new Chess();

    moves.forEach(function addMove(moveSan) {
      const result = walker.move(moveSan);
      const nodeId = lastNodeId ? `${lastNodeId}${NODE_ID_DELIMITER}${result.san}` : result.san;
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
    setCurrentNodeId(lastNodeId);
    setPlayersInfo(mergedPlayersInfo);
  }, [originalPgn]);

  function goStart() {
    setCurrentNodeId(ROOT_ANALYSIS_NODE_ID);
  }

  const goBack = useCallback(() => {
    setCurrentNodeId((previous) => tree[previous]?.parentId ?? ROOT_ANALYSIS_NODE_ID);
  }, [tree]);

  const goForward = useCallback(() => {
    setCurrentNodeId((previous) => getNextNodeId(previous, tree) ?? previous);
  }, [tree]);

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
  }, [goBack]);

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
  }, [goForward]);

  const activeLineNodeIds = useMemo(() => getLineNodeIds(activeLineId, tree), [activeLineId, tree]);

  const activeLineNodes: MoveNode[] = useMemo(() => {
    return activeLineNodeIds.map((id) => tree[id]);
  }, [activeLineNodeIds, tree]);

  const currentAnalysis: NodeAnalysis | undefined = useMemo(
    () => positionAnalysisMap[currentFen],
    [currentFen, positionAnalysisMap],
  );

  const moveMarksMap: Record<string, MoveMarkResult> = useMemo(() => {
    if (!openingsReady) return {};
    return buildMoveMarks(tree, positionAnalysisMap);
  }, [openingsReady, positionAnalysisMap, tree]);

  const lastBookOpeningName = useMemo(
    () => findClosestOpeningName(currentNodeId, tree, positionAnalysisMap),
    [currentNodeId, positionAnalysisMap, tree],
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

  const currentPositionGame: Chess = useMemo(() => new Chess(currentFen), [currentFen]);

  const planView: AnalyzerPageEnginePlan.PlanView = useMemo(
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

      return stylesBySquare;
    },
    [planView.captureSquares],
  );

  const canGoForward = useMemo(() => tree[currentNodeId]?.children?.[0] ?? false, [currentNodeId, tree]);

  const displayedPlayersInfo = getDisplayedPlayersInfo(playersInfo, boardOrientation);

  useEffect(
    function calculateActiveLineId() {
      const previousActiveLineIds = getLineNodeIds(activeLineId, tree);
      if (previousActiveLineIds.includes(currentNodeId)) return;
      const newActiveLineIds = getLineNodeIds(currentNodeId, tree);
      setActiveLineId(newActiveLineIds[newActiveLineIds.length - 1]);
    },
    [currentNodeId, tree, activeLineId],
  );

  useEffect(() => {
    async function scheduleAnalysisForNodes() {
      if (!engine) return;
      const nodeId = activeLineNodeIds.find((it) => {
        const positionAnalysisMapElement = positionAnalysisMap[tree[it].fen];
        return (
          (positionAnalysisMapElement?.depth ?? -1) < selectedDepth || !(positionAnalysisMapElement?.isFinal ?? false)
        );
      });

      if (!nodeId) {
        setStatusText("Analysis complete");
        return;
      }

      const task = {
        nodeId,
        fen: tree[nodeId].fen,
        label: tree[nodeId].san,
        request: { minDepth: selectedDepth, linesAmount: 1 },
        priority: EngineEvaluationPriorities.BACKGROUND,
      };
      console.log("Evaluating", task.label, task.fen, task.request.minDepth);
      const finalEvaluation = await engine.evaluate(task.fen, task.request, task.priority, (update) => {
        syncSingleNodeAnalysis(task.fen, toNodeAnalysis(task.fen, update, update.isFinal));
        setStatusText(`Analyzing ${task.label} (d${task.request.minDepth})...`);
      });
      syncSingleNodeAnalysis(task.fen, toNodeAnalysis(task.fen, finalEvaluation, true));
    }
    void scheduleAnalysisForNodes();
  }, [tree, activeLineNodeIds, engine, selectedDepth, positionAnalysisMap]);

  function syncSingleNodeAnalysis(fen: string, analysis: NodeAnalysis) {
    setPositionAnalysisMap((previous: Record<string, NodeAnalysis>): Record<string, NodeAnalysis> => {
      const currentAnalysisEntry = previous[fen];
      const preferredAnalysis = pickPreferredAnalysis(currentAnalysisEntry, analysis);
      if (areNodeAnalysesEqual(currentAnalysisEntry, preferredAnalysis)) return previous;
      return {
        ...previous,
        [fen]: preferredAnalysis,
      };
    });
  }

  function runDeepAnalysis() {
    if (!engine) return;
    const target = getSelectedAnalysisTarget(tree, currentNodeId, deepAnalysisDepth);
    if (!target) return;

    void engine
      .evaluate(target.fen, target.request, EngineEvaluationPriorities.IMMEDIATE, (update) => {
        syncSingleNodeAnalysis(target.fen, toNodeAnalysis(target.fen, update, update.isFinal));
        setStatusText(`Analyzing ${target.label} (d${deepAnalysisDepth})...`);
      })
      .then((result) => {
        syncSingleNodeAnalysis(target.fen, toNodeAnalysis(target.fen, result, true));
        setStatusText("Analysis Complete");
      })
      .catch((e) => {
        setStatusText("Engine Error");
        console.error("Engine Error", e);
      });
  }

  function makeMove(
    move: { from: string; to: string; promotion?: string },
    source: "board_click" | "engine_suggestion",
  ): { nodeId: string; fen: string } | null {
    const tempGame = new Chess(currentFen);

    try {
      const result = tempGame.move(move);
      if (!result) {
        console.log("Illegal move!", move);
        return null;
      }

      const nextFen = tempGame.fen();
      const nextNodeId =
        currentNodeId !== ROOT_ANALYSIS_NODE_ID ? `${currentNodeId}${NODE_ID_DELIMITER}${result.san}` : result.san;

      Analytics.trackEvent("move", {
        source,
        from: move.from,
        to: move.to,
      });

      if (!tree[nextNodeId]) {
        setTree((previous) =>
          addNode(previous, currentNodeId, {
            id: nextNodeId,
            san: result.san,
            fen: nextFen,
            parentId: currentNodeId,
            children: [],
          }),
        );
      }

      setCurrentNodeId(nextNodeId);

      return {
        nodeId: nextNodeId,
        fen: nextFen,
      };
    } catch {
      return null;
    }
  }

  useEffect(() => console.log(activeLineNodeIds), [activeLineNodeIds]);

  async function applyEngineMove(line: DisplayEngineLine): Promise<void> {
    const suggestedMoveUci = line.suggestedMoveUci;
    const moveResult = makeMove(
      {
        from: suggestedMoveUci.substring(0, 2),
        to: suggestedMoveUci.substring(2, 4),
        promotion: suggestedMoveUci[4] || "q",
      },
      "engine_suggestion",
    );
    if (!moveResult) return;

    const seededAnalysis = buildSeededNodeAnalysis(moveResult.fen, line, line.engineLineUci.slice(1));
    if (seededAnalysis) {
      syncSingleNodeAnalysis(moveResult.fen, seededAnalysis);
    }
  }

  function loadSample() {
    setOriginalPgn(
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7",
    );
  }

  function clearTree() {
    setOriginalPgn("");
  }

  const activeLineMovesAnalyzed = useMemo(
    () => activeLineNodeIds.filter((id) => !!positionAnalysisMap[tree[id].fen]?.isFinal).length,
    [activeLineNodeIds, positionAnalysisMap, tree],
  );

  const analysisFinishedRatio = activeLineMovesAnalyzed / activeLineNodeIds.length;

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto bg-white shadow-lg border border-gray-100 min-h-175">
      <div className="flex-1 flex flex-col items-center gap-2">
        <div className="w-full">
          <PlayerCard info={displayedPlayersInfo.top} />
        </div>
        <div className="w-full max-w-180 flex rounded-md items-stretch border-8 border-gray-800 bg-gray-800">
          <EvaluationThermometer
            evaluation={
              currentAnalysis?.evaluation != null
                ? absoluteNumericEvaluationToEngineEvaluation(currentAnalysis.evaluation)
                : null
            }
            orientation={boardOrientation}
            className="w-6 self-stretch"
          />
          <div className="flex-1 min-w-0 shadow-2xl overflow-hidden">
            <ExtendedChessBoard
              id="AnalysisBoard"
              position={currentFen}
              boardOrientation={boardOrientation}
              animationDuration={300}
              customArrows={planView.arrows}
              customSquareStyles={boardSquareStyles}
              makeMove={(move) => makeMove(move, "board_click")}
              currentPositionGame={currentPositionGame}
              moveMarksBySquare={moveMarksBySquare}
            />
          </div>
        </div>
        <div className="w-full">
          <PlayerCard info={displayedPlayersInfo.bottom} />
        </div>
      </div>

      <div className="w-full lg:w-md flex flex-col gap-4 shrink-0 lg:overflow-y-auto ">
        {!hasExistingAnalysis && <ChessComLastGameSuggestionPane />}
        <div className="flex items-center gap-4 flex-wrap justify-center">
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
        <EnginePane
          currentAnalysis={currentAnalysis}
          showPlans={showPlans}
          setShowPlans={(it) => setShowPlans(it)}
          selectedDepth={selectedDepth}
          setSelectedDepth={(it) => setSelectedDepth(it)}
          statusText={statusText}
          runDeepAnalysis={() => runDeepAnalysis()}
          applyLine={(line) => applyEngineMove(line)}
        />

        {activeLineNodeIds.length > 1 && (
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

            {analysisFinishedRatio < 1 && activeLineNodeIds.length > 1 && (
              <div className="w-full h-2  rounded-full mb-4">
                <div
                  style={{
                    width: `${analysisFinishedRatio * 100}%`,
                  }}
                  className="h-full bg-green-500 rounded-full"
                ></div>
              </div>
            )}
            <MoveList
              visiblePath={activeLineNodes.slice(1)}
              tree={tree}
              currentNodeId={currentNodeId}
              positionAnalysisMap={positionAnalysisMap}
              moveMarksMap={moveMarksMap}
              setCurrentNodeId={setCurrentNodeId}
            />
          </div>
        )}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-800">PGN</h3>
            <div className="flex items-center gap-3">
              <Link to="/import/chess-com" className="text-[10px] text-olive-600 font-bold hover:underline">
                Chess.com
              </Link>
              <button
                onClick={loadSample}
                className="inline-flex items-center gap-1.5 text-[10px] text-olive-600 font-bold hover:underline"
              >
                <RenderIcon iconType={GiPerspectiveDiceSixFacesRandom} className="text-xs" />
                <span>Sample</span>
              </button>
            </div>
          </div>
          <form
            onSubmit={function submitPgn(event) {
              event.preventDefault();
              setOriginalPgn(pgnInputText.trim());
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              className="w-full h-32 p-2 text-xs font-mono border rounded outline-none bg-white"
              value={pgnInputText}
              onChange={(event) => {
                setPgnInputText(event.target.value);
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

function getLineNodeIds(currentNodeId: string, tree: Record<string, MoveNode>): string[] {
  if (!tree[currentNodeId]) return [ROOT_ANALYSIS_NODE_ID];

  while (tree[currentNodeId].children.length > 0) {
    currentNodeId = tree[currentNodeId].children[0];
  }

  const result: string[] = [];
  for (let id = currentNodeId; id && tree[id]; id = tree[id].parentId) {
    result.push(id);
  }

  return result.reverse();
}

function getSelectedAnalysisTarget(
  tree: Record<string, MoveNode>,
  currentNodeId: string | null,
  deepAnalysisDepth: number,
): ScheduledTask | null {
  if (!currentNodeId) return null;
  const node = tree[currentNodeId];
  if (!node) return null;

  return {
    nodeId: node.id,
    fen: node.fen,
    label: node.san,
    request: { minDepth: deepAnalysisDepth, linesAmount: 3 },
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

function buildMoveMarks(
  tree: Record<string, MoveNode>,
  analysesByFen: Record<string, NodeAnalysis>,
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

    const nodeAnalysis = analysesByFen[node.fen];
    const parentFen = node.parentId ? tree[node.parentId]?.fen : START_FEN;
    const parentAnalysis = analysesByFen[parentFen];
    if (!parentFen) return;
    if (!parentAnalysis?.isFinal || !nodeAnalysis?.isFinal) return;
    if (parentAnalysis.lines.length === 0) return;

    const mark = classifyMoveMark({
      parentFen,
      playedMoveSan: node.san,
      playedEvaluation: nodeAnalysis.evaluation,
      parentLines: parentAnalysis.lines.map((line: DisplayEngineLine) => ({
        uci: line.suggestedMoveUci,
        evaluation: line.evaluation,
      })),
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

function findClosestOpeningName(
  startNodeId: string,
  tree: Record<string, MoveNode>,
  analysisByFen: Record<string, NodeAnalysis>,
): string | null {
  let nodeId: string | null = startNodeId;

  while (nodeId) {
    const nodeAnalysis = analysisByFen[tree[nodeId].fen];
    if (nodeAnalysis?.opening?.name) return nodeAnalysis.opening.name;
    nodeId = tree[nodeId]?.parentId ?? null;
  }

  return null;
}

function areNodeAnalysesEqual(left?: NodeAnalysis, right?: NodeAnalysis): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  return (
    left.fen === right.fen &&
    left.evaluation === right.evaluation &&
    left.depth === right.depth &&
    left.isFinal === right.isFinal &&
    left.openingLookupDone === right.openingLookupDone &&
    areOpeningsEqual(left.opening, right.opening) &&
    areDisplayLinesEqual(left.lines, right.lines)
  );
}

function areOpeningsEqual(left?: OpeningsBook.Opening | null, right?: OpeningsBook.Opening | null): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  return (
    left.name === right.name && left.epd === right.epd && left.pgn === right.pgn && left.plyCount === right.plyCount
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
  const mergedNextAnalysis = preserveOpeningLookup(
    currentAnalysis,
    mergeNodeAnalysisLines(currentAnalysis, nextAnalysis),
  );
  if (!currentAnalysis) return nextAnalysis;
  if (mergedNextAnalysis.depth < currentAnalysis.depth) return currentAnalysis;
  if (mergedNextAnalysis.lines.length < currentAnalysis.lines.length) return currentAnalysis;
  if (!mergedNextAnalysis.isFinal && currentAnalysis.isFinal) return currentAnalysis;
  return mergedNextAnalysis;
}

function preserveOpeningLookup(currentAnalysis: NodeAnalysis | undefined, nextAnalysis: NodeAnalysis): NodeAnalysis {
  if (!currentAnalysis) return nextAnalysis;
  if (!currentAnalysis.openingLookupDone) return nextAnalysis;
  if (nextAnalysis.openingLookupDone) return nextAnalysis;

  return {
    ...nextAnalysis,
    opening: currentAnalysis.opening ?? null,
    openingLookupDone: true,
  };
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

function addNode(
  tree: Record<string, MoveNode>,
  parentId: string | null,
  newChild: MoveNode,
): Record<string, MoveNode> {
  const nextTree: Record<string, MoveNode> = {
    ...tree,
    [newChild.id]: newChild,
  };

  if (parentId) {
    nextTree[parentId] = {
      ...tree[parentId],
      children: [...tree[parentId].children, newChild.id],
    };
  }

  return nextTree;
}

export default ChessReplay;
