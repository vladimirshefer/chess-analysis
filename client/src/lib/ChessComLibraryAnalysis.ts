import { AnalysisGame } from "./AnalysisGame.ts";
import { AnalysisPosition } from "./AnalysisPosition.ts";
import { ChessComClient } from "./ChessComClient.ts";
import { ChessComGameAnalysisStorage } from "./ChessComGameAnalysisStorage.ts";
import { ChessComGamesStorage } from "./ChessComGamesStorage.ts";
import { type ChessEngine, EngineEvaluationPriorities } from "./ChessEngine.ts";
import { GameAnalysisSummary } from "./GameAnalysisSummary.ts";
import { OpeningsBook } from "./OpeningsBook.ts";

export namespace ChessComLibraryAnalysis {
  export const TARGET_DEPTH = 12;
  const LINES_AMOUNT = 1;

  interface PreparedGame {
    activeLineNodes: ReturnType<typeof getActiveLineNodes>;
    positionAnalysisMap: Record<string, AnalysisGame.NodeAnalysis>;
    tree: ReturnType<typeof AnalysisGame.loadPgn>["tree"];
  }

  interface GameStepState {
    entity: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity;
    nextNodeFen: string | null;
  }

  export interface GlobalProgress {
    totalGames: number;
    doneGames: number;
    analyzedPositions: number;
    totalPositions: number;
    runningGameId: string | null;
  }

  export function loadLibraryGames(): ChessComClient.Dto.ChessComGameSummary[] {
    return ChessComGamesStorage.load().slice().sort(compareGamesByEndTimeDesc);
  }

  export function getGlobalProgress(
    games: ChessComClient.Dto.ChessComGameSummary[],
    entities: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity[],
  ): GlobalProgress {
    const relevantEntities = entities.filter(function keepEntity(entity) {
      return games.some(function matchGame(game) {
        return game.id === entity.gameId;
      });
    });

    return {
      totalGames: games.length,
      doneGames: relevantEntities.filter(function isDone(entity) {
        return entity.status === "done";
      }).length,
      analyzedPositions: relevantEntities.reduce(function sumDone(result, entity) {
        return result + entity.analyzedPositions;
      }, 0),
      totalPositions: relevantEntities.reduce(function sumTotal(result, entity) {
        return result + entity.totalPositions;
      }, 0),
      runningGameId:
        relevantEntities
          .filter(function isRunning(entity) {
            return entity.status === "running";
          })
          .sort(function compareRunning(left, right) {
            return right.updatedAt - left.updatedAt;
          })[0]?.gameId ?? null,
    };
  }

  export async function processNextStep(engine: ChessEngine): Promise<boolean> {
    const games = loadLibraryGames();
    if (games.length === 0) return false;

    await OpeningsBook.load();

    for (const game of games) {
      const stepState = await buildGameStepState(game, engine);
      const previousEntity = ChessComGameAnalysisStorage.get(game.id);
      if (stepState.nextNodeFen === null) {
        saveIfChanged(previousEntity, stepState.entity);
        continue;
      }

      saveIfChanged(previousEntity, {
        ...stepState.entity,
        status: "running",
        updatedAt: Date.now(),
      });

      try {
        const finalEvaluation = await engine.evaluate(
          stepState.nextNodeFen,
          { minDepth: TARGET_DEPTH, linesAmount: LINES_AMOUNT },
          EngineEvaluationPriorities.BACKGROUND,
        );
        const updatedState = await buildGameStepState(game, engine, {
          [finalEvaluation.fen]: AnalysisPosition.toNodeAnalysis(finalEvaluation.fen, finalEvaluation, true),
        });
        ChessComGameAnalysisStorage.save({
          ...updatedState.entity,
          status: updatedState.nextNodeFen ? "pending" : "done",
          lastAnalyzedFen: finalEvaluation.fen,
          updatedAt: Date.now(),
        });
      } catch (error) {
        ChessComGameAnalysisStorage.save({
          ...stepState.entity,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Failed to analyze game",
          updatedAt: Date.now(),
        });
      }

      return true;
    }

    return false;
  }

  async function buildGameStepState(
    game: ChessComClient.Dto.ChessComGameSummary,
    engine: ChessEngine,
    seededAnalysesByFen: Record<string, AnalysisGame.NodeAnalysis> = {},
  ): Promise<GameStepState> {
    const preparedGame = prepareGame(game);
    const analysesByFen = {
      ...preparedGame.positionAnalysisMap,
      ...seededAnalysesByFen,
    };
    let nextNodeFen: string | null = null;
    let analyzedPositions = 0;

    for (const node of preparedGame.activeLineNodes) {
      const seededAnalysis = analysesByFen[node.fen];
      if (seededAnalysis?.isFinal && seededAnalysis.depth >= TARGET_DEPTH) {
        analyzedPositions += 1;
        continue;
      }

      const persistedEvaluation = await engine.getEvaluation(node.fen, TARGET_DEPTH);
      if (persistedEvaluation) {
        analysesByFen[node.fen] = AnalysisPosition.toNodeAnalysis(node.fen, persistedEvaluation, true);
        analyzedPositions += 1;
        continue;
      }

      if (!nextNodeFen) nextNodeFen = node.fen;
    }

    const moveMarks = GameAnalysisSummary.buildMoveMarks(preparedGame.tree, analysesByFen);
    const summary = GameAnalysisSummary.buildGameSummary(preparedGame.activeLineNodes, analysesByFen, moveMarks);

    return {
      entity: {
        gameId: game.id,
        status: nextNodeFen ? "pending" : "done",
        targetDepth: TARGET_DEPTH,
        analyzedPositions,
        totalPositions: preparedGame.activeLineNodes.length,
        lastAnalyzedFen: null,
        whiteAccuracy: summary.whiteAccuracy,
        blackAccuracy: summary.blackAccuracy,
        histogramValues: summary.histogramValues,
        materialValues: summary.materialValues,
        updatedAt: Date.now(),
      },
      nextNodeFen,
    };
  }

  function prepareGame(game: ChessComClient.Dto.ChessComGameSummary): PreparedGame {
    const loadedGame = AnalysisGame.loadPgn(game.pgn);
    return {
      tree: loadedGame.tree,
      positionAnalysisMap: loadedGame.positionAnalysisMap,
      activeLineNodes: getActiveLineNodes(loadedGame),
    };
  }

  function getActiveLineNodes(loadedGame: AnalysisGame.LoadedPgn) {
    return AnalysisGame.getLineNodeIds(loadedGame.activeLineId, loadedGame.tree).map(function toNode(nodeId) {
      return loadedGame.tree[nodeId];
    });
  }

  function saveIfChanged(
    currentEntity: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity | null,
    nextEntity: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity,
  ): void {
    if (currentEntity && areEntitiesEquivalent(currentEntity, nextEntity)) return;
    ChessComGameAnalysisStorage.save(nextEntity);
  }

  function areEntitiesEquivalent(
    left: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity,
    right: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity,
  ): boolean {
    return (
      left.gameId === right.gameId &&
      left.status === right.status &&
      left.targetDepth === right.targetDepth &&
      left.analyzedPositions === right.analyzedPositions &&
      left.totalPositions === right.totalPositions &&
      left.lastAnalyzedFen === right.lastAnalyzedFen &&
      left.whiteAccuracy === right.whiteAccuracy &&
      left.blackAccuracy === right.blackAccuracy &&
      left.errorMessage === right.errorMessage &&
      left.histogramValues.join(",") === right.histogramValues.join(",") &&
      left.materialValues.join(",") === right.materialValues.join(",")
    );
  }

  function compareGamesByEndTimeDesc(
    left: ChessComClient.Dto.ChessComGameSummary,
    right: ChessComClient.Dto.ChessComGameSummary,
  ): number {
    const leftEndTime = left.endTime ?? 0;
    const rightEndTime = right.endTime ?? 0;
    if (leftEndTime !== rightEndTime) return rightEndTime - leftEndTime;
    return right.id.localeCompare(left.id);
  }
}
