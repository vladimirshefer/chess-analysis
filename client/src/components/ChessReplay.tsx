import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaAnglesLeft,
  FaChevronLeft,
  FaChevronRight,
  FaFileImport,
  FaLink,
  FaRotate,
  FaTrashCan,
} from "react-icons/fa6";
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
import { type GamePlayersInfo, type PlayerInfo } from "../lib/gameInfo";
import { type AbsoluteNumericEvaluation, START, START_FEN } from "../lib/evaluation";
import { classifyMoveMark, type MoveMark, type MoveMarkResult, MoveMarks } from "../lib/moveMarks";
import { OpeningsBook } from "../lib/OpeningsBook";
import EvaluationThermometer from "./EvaluationThermometer";
import RenderIcon from "./RenderIcon";
import ChessComLastGameSuggestionPane from "./ChessComLastGameSuggestionPane.tsx";
import GameAnalysisOverview from "./GameAnalysisOverview.tsx";
import { MoveList } from "../pages/AnalyzerPage/MoveList.tsx";
import { useLocalStorageNumericState } from "../lib/hooks/useLocalStorageNumericState.ts";
import { EnginePane } from "../pages/AnalyzerPage/EnginePane.tsx";
import { ExtendedChessBoard } from "./ExtendedChessBoard.tsx";
import { useQuery } from "@tanstack/react-query";
import { SharedAnalysis } from "../lib/SharedAnalysis.ts";
import { AnalysisGame } from "../lib/AnalysisGame.ts";
import { type GameTree, GameTreeUtils, type MoveNode } from "../lib/GameTree.ts";

export type DisplayEngineLine = AnalysisGame.DisplayEngineLine;
type NodeAnalysis = AnalysisGame.NodeAnalysis;

interface ScheduledTask {
  nodeId: string;
  fen: string;
  label: string;
  request: EvaluationRequest;
  priority: EngineEvaluationPriority;
}

interface AnalyzerLocationState {
  importedPgn?: string;
  initialBoardOrientation?: "white" | "black";
}

const ROOT_ANALYSIS_NODE_ID = AnalysisGame.ROOT_NODE_ID;
const PLAN_CAPTURE_SQUARE_STYLE = {
  backgroundColor: "rgba(220, 38, 38, 0.45)",
  boxShadow: "inset 0 0 0 3px rgba(185, 28, 28, 0.85)",
};

const ENGINE_DEPTH_STORAGE_KEY = "analyzer-engine-selected-depth";

function ChessReplay() {
  const location = useLocation();
  const [originalPgn, setOriginalPgnState] = useState("");
  const [initialBoardOrientation, setInitialBoardOrientation] = useState<"white" | "black" | null>(null);
  const lastImportedRouteKeyRef = useRef<string | null>(null);
  const sharedAnalysisPayload = useMemo(
    function readSharedAnalysisPayload() {
      return SharedAnalysis.readPayload(location.search);
    },
    [location.search],
  );

  useEffect(
    function loadSharedAnalysisFromUrl() {
      if (!sharedAnalysisPayload) return;

      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInitialBoardOrientation(null);
        setOriginalPgnState(SharedAnalysis.toPgn(sharedAnalysisPayload));
      } catch (error) {
        console.error("Invalid shared analysis payload", error);
      }
    },
    [sharedAnalysisPayload],
  );

  useEffect(
    function loadImportedPgnFromRoute() {
      if (sharedAnalysisPayload) return;

      const locationState = location.state as AnalyzerLocationState | null;
      const importedPgn = locationState?.importedPgn?.trim();
      if (!importedPgn) return;
      if (lastImportedRouteKeyRef.current === location.key) return;

      lastImportedRouteKeyRef.current = location.key;
      history.pushState(null, "", `${location.pathname}${location.search}${location.hash}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitialBoardOrientation(locationState?.initialBoardOrientation ?? null);
      setOriginalPgnState(importedPgn);
    },
    [location, location.key, location.pathname, location.search, location.state, sharedAnalysisPayload],
  );

  function setOriginalPgn(pgn: string) {
    setInitialBoardOrientation(null);
    setOriginalPgnState(pgn);
  }

  return (
    <ChessReplayImpl
      originalPgn={originalPgn}
      setOriginalPgn={setOriginalPgn}
      initialBoardOrientation={initialBoardOrientation}
      isSharedLink={Boolean(sharedAnalysisPayload)}
    />
  );
}

function ChessReplayImpl({
  originalPgn,
  setOriginalPgn,
  initialBoardOrientation,
  isSharedLink,
}: {
  originalPgn: string;
  setOriginalPgn: (pgn: string) => void;
  initialBoardOrientation: "white" | "black" | null;
  isSharedLink: boolean;
}) {
  const [pgnInputText, setPgnInputText] = useState(originalPgn);
  const [tree, setTree] = useState<GameTree>({ ...AnalysisGame.TREE_SEED });

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
      await OpeningsBook.load();
      return true;
    },
  });

  const openingsReady = useMemo(() => !!openingsBookQuery.data, [openingsBookQuery.data]);

  useEffect(
    function syncPgnEditorText() {
      setPgnInputText(originalPgn);
    },
    [originalPgn],
  );

  useEffect(
    function loadPgnIntoTree() {
      const loadedGame = AnalysisGame.loadPgn(originalPgn);
      if (loadedGame.isInvalidPgn) {
        console.error("Invalid PGN", originalPgn);
      }

      setTree(loadedGame.tree);
      setPositionAnalysisMap(loadedGame.positionAnalysisMap);
      setCurrentNodeId(loadedGame.currentNodeId);
      setActiveLineId(loadedGame.activeLineId);
      setPlayersInfo(loadedGame.playersInfo);
      setBoardOrientation(initialBoardOrientation ?? "white");
      setStatusText(
        loadedGame.isInvalidPgn
          ? "Invalid PGN"
          : isSharedLink
            ? "Shared analysis loaded"
            : originalPgn
              ? "Game loaded"
              : "Welcome",
      );
    },
    [initialBoardOrientation, isSharedLink, originalPgn],
  );

  function goStart() {
    setCurrentNodeId(ROOT_ANALYSIS_NODE_ID);
  }

  const goBack = useCallback(() => {
    setCurrentNodeId((previous) => tree[previous]?.parentId ?? ROOT_ANALYSIS_NODE_ID);
  }, [tree]);

  const goForward = useCallback(() => {
    setCurrentNodeId((previous) => tree[previous]?.children?.[0] ?? previous);
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

  const activeLineNodeIds = useMemo(() => AnalysisGame.getLineNodeIds(activeLineId, tree), [activeLineId, tree]);

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

  const canGoForward = useMemo(() => Boolean(tree[currentNodeId]?.children?.[0]), [currentNodeId, tree]);

  const displayedPlayersInfo = getDisplayedPlayersInfo(playersInfo, boardOrientation);
  const nextNodeIdToAnalyze = useMemo(
    function getNextNodeIdToAnalyze() {
      return (
        activeLineNodeIds.find((nodeId) => {
          const fen = tree[nodeId].fen;
          const positionAnalysis = positionAnalysisMap[fen];
          if (positionAnalysis?.source === "pgn" && positionAnalysis.isFinal) return false;
          return (positionAnalysis?.depth ?? -1) < selectedDepth || !(positionAnalysis?.isFinal ?? false);
        }) ?? null
      );
    },
    [activeLineNodeIds, positionAnalysisMap, selectedDepth, tree],
  );

  useEffect(
    function calculateActiveLineId() {
      if (activeLineNodeIds.includes(currentNodeId)) return;
      const newActiveLineIds = AnalysisGame.getLineNodeIds(currentNodeId, tree);
      setActiveLineId(newActiveLineIds[newActiveLineIds.length - 1]);
    },
    [currentNodeId, tree, activeLineId, activeLineNodeIds],
  );

  const nextNodeToAnalyze = useMemo(() => tree[nextNodeIdToAnalyze], [tree, nextNodeIdToAnalyze]);

  useEffect(() => {
    async function scheduleAnalysts() {
      if (!engine) return;
      if (!nextNodeToAnalyze) {
        setStatusText("Analysis complete");
        return;
      }

      const task = {
        nodeId: nextNodeToAnalyze.id,
        fen: nextNodeToAnalyze.fen,
        label: nextNodeToAnalyze.san,
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
    void scheduleAnalysts();
  }, [engine, nextNodeToAnalyze, selectedDepth]);

  useEffect(
    function loadOpeningForVisibleAnalysis() {
      if (!openingsReady) return;

      const nodeId = activeLineNodeIds.find((nodeId) => {
        const node = tree[nodeId];
        if (!node?.parentId) return false;
        const movePathKey = GameTreeUtils.getPgnToPosition(nodeId, tree);
        if (!movePathKey) return false;
        return !positionAnalysisMap[node.fen]?.openingLookupDone;
      });
      if (!nodeId) return;

      const movePathKey = GameTreeUtils.getPgnToPosition(nodeId, tree);
      if (!movePathKey) return;

      const fen = tree[nodeId].fen;
      let isCancelled = false;

      void OpeningsBook.getOpeningBySanMoves(movePathKey.split(" ")).then(function applyOpening(opening) {
        if (isCancelled) return;
        syncSingleNodeAnalysis(fen, {
          ...(positionAnalysisMap[fen] ?? {
            fen,
            evaluation: 0,
            settledMaterialBalance: null,
            depth: 0,
            lines: [],
            isFinal: false,
            source: "engine",
          }),
          opening: opening ?? null,
          openingLookupDone: true,
        });
      });

      return function cleanup() {
        isCancelled = true;
      };
    },
    [activeLineNodeIds, openingsReady, positionAnalysisMap, tree],
  );

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
      const nextNodeId = currentNodeId !== ROOT_ANALYSIS_NODE_ID ? `${currentNodeId}|${result.san}` : result.san;

      Analytics.trackEvent("move", {
        source,
        from: move.from,
        to: move.to,
      });

      if (!tree[nextNodeId]) {
        setTree((previous) =>
          GameTreeUtils.addNode(previous, currentNodeId, {
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

  async function shareAnalysis() {
    try {
      const shareUrl = SharedAnalysis.buildUrl(
        {
          tree,
          activeLineId,
          positionAnalysisMap,
          playersInfo,
        },
        window.location.href,
      );

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setStatusText("Share link copied");
        return;
      }

      window.prompt("Copy share link", shareUrl);
      setStatusText("Share link ready");
    } catch (error) {
      console.error("Failed to create share link", error);
      setStatusText("Share failed");
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto bg-white shadow-lg border border-gray-100 min-h-175">
      <div className="flex-1 flex flex-col items-center gap-2">
        <div className="w-full">
          <PlayerCard info={displayedPlayersInfo.top} />
        </div>
        <div className="w-full max-w-180 flex rounded-md items-stretch border-8 border-gray-800 bg-gray-800">
          <EvaluationThermometer
            evaluation={currentAnalysis?.evaluation ?? null}
            settledMaterialBalance={currentAnalysis?.settledMaterialBalance}
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
          <button
            disabled={!hasExistingAnalysis}
            onClick={function handleShareClick() {
              void shareAnalysis();
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-4 bg-sky-700 hover:bg-sky-800 text-white rounded font-bold disabled:opacity-30"
          >
            <RenderIcon iconType={FaLink} className="text-sm" />
            <span>Share</span>
          </button>
        </div>

        {!hasExistingAnalysis ? (
          <ChessComLastGameSuggestionPane />
        ) : (
          <GameAnalysisOverview
            activeLine={activeLineNodes.slice(1)}
            positionEvaluations={positionAnalysisMap}
            moveMarks={moveMarksMap}
            currentNodeId={currentNodeId}
            selectNode={(id) => setCurrentNodeId(id)}
            reviewAsWhite={boardOrientation === "white"}
          />
        )}

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

function getSelectedAnalysisTarget(
  tree: GameTree,
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
        evaluation: line.evaluation,
        depth: line.depth,
        lineRank: line.multipv,
      };

      return displayEngineLine;
    })
    .filter((line) => line !== null);
}

function toNodeAnalysis(baseFen: string, evaluation: FullMoveEvaluation, isFinal: boolean): NodeAnalysis {
  let settledMaterialBalance: number | null = null;

  if (isFinal) {
    const topLine = evaluation.lines[0];
    const tempGame = new Chess(baseFen);
    const pieceValueByType = {
      p: 100,
      n: 300,
      b: 300,
      r: 500,
      q: 900,
      k: 0,
    } as const;

    function getMaterialBalance(): number {
      let materialBalance = 0;

      tempGame.board().forEach(function scanRank(rank) {
        rank.forEach(function scanSquare(piece) {
          if (!piece) return;
          const value = pieceValueByType[piece.type];
          materialBalance += piece.color === "w" ? value : -value;
        });
      });

      return materialBalance;
    }

    if (topLine) {
      for (const uciMove of topLine.pv) {
        const move = tempGame.move({
          from: uciMove.substring(0, 2),
          to: uciMove.substring(2, 4),
          promotion: uciMove[4] || "q",
        });
        if (!move) break;
        if (typeof move.captured !== "string") {
          settledMaterialBalance = getMaterialBalance();
          break;
        }
      }
    }
  }

  return {
    fen: evaluation.fen,
    evaluation: evaluation.evaluation,
    settledMaterialBalance,
    depth: evaluation.depth,
    lines: toDisplayLines(baseFen, evaluation.lines),
    isFinal,
    source: "engine",
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
    settledMaterialBalance: null,
    isFinal: false,
    source: "engine",
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

function buildMoveMarks(tree: GameTree, analysesByFen: Record<string, NodeAnalysis>): Record<string, MoveMarkResult> {
  const marksByNodeId: Record<string, MoveMarkResult> = {};

  Object.values(tree).forEach(function classifyNode(node) {
    const movePathKey = GameTreeUtils.getPgnToPosition(node.id, tree);
    const isKnownByMovePath = movePathKey ? OpeningsBook.isKnownMovePath(movePathKey.split(" ")) : false;

    if (isKnownByMovePath) {
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
  tree: GameTree,
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
    left.settledMaterialBalance === right.settledMaterialBalance &&
    left.depth === right.depth &&
    left.isFinal === right.isFinal &&
    left.source === right.source &&
    left.openingLookupDone === right.openingLookupDone &&
    areOpeningsEqual(left.opening, right.opening) &&
    areDisplayLinesEqual(left.lines, right.lines)
  );
}

function areOpeningsEqual(left?: OpeningsBook.Opening | null, right?: OpeningsBook.Opening | null): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  return left.name === right.name && left.pgn === right.pgn && left.plyCount === right.plyCount;
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

export default ChessReplay;
