import { AnalysisGame } from "./AnalysisGame.ts";
import { AnalysisPosition } from "./AnalysisPosition.ts";
import type { ChessComClient } from "./ChessComClient.ts";
import {
  type ChessComGameAnalysisEntity,
  chessComGameAnalysisRepository,
  ChessComGameAnalysisStorage,
} from "../repository/ChessComGameAnalysisRepository.ts";
import { chessComGameRepository } from "../repository/ChessComGamesRepository.ts";
import { type ChessEngine, EngineEvaluationPriorities } from "./chess-engine/ChessEngine.ts";
import { GameAnalysisSummary } from "./GameAnalysisSummary.ts";
import { OpeningsBook } from "./OpeningsBook.ts";

export namespace ChessComLibraryAnalysis {
  export const TARGET_DEPTH = 12;
  const LINES_AMOUNT = 1;
  export const GAMES_QUERY_KEY = ["chess-com-library-games"];
  export const ANALYSIS_QUERY_KEY = ["chess-com-library-analysis"];
  export const REFETCH_INTERVAL_MS = 1_200;

  interface PreparedGame {
    activeLineNodes: ReturnType<typeof getActiveLineNodes>;
    positionAnalysisMap: Record<string, AnalysisGame.NodeAnalysis>;
    tree: ReturnType<typeof AnalysisGame.loadPgn>["tree"];
  }

  interface GameStepState {
    entity: ChessComGameAnalysisEntity;
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
    return chessComGameRepository.getAll().slice().sort(compareGamesByEndTimeDesc);
  }

  export function getGlobalProgress(
    games: ChessComClient.Dto.ChessComGameSummary[],
    entities: ChessComGameAnalysisEntity[],
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
      const previousEntity = chessComGameAnalysisRepository.get(game.id);
      if (isCompletedEntity(previousEntity)) continue;

      const stepState = await buildGameStepState(game, engine, previousEntity);
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
        const updatedState = await buildGameStepState(game, engine, previousEntity, {
          [finalEvaluation.fen]: AnalysisPosition.toNodeAnalysis(finalEvaluation.fen, finalEvaluation, true),
        });
        chessComGameAnalysisRepository.save({
          ...updatedState.entity,
          status: updatedState.nextNodeFen ? "pending" : "done",
          lastAnalyzedFen: finalEvaluation.fen,
          updatedAt: Date.now(),
        });
      } catch (error) {
        chessComGameAnalysisRepository.save({
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
    previousEntity: ChessComGameAnalysisEntity | null = null,
    seededAnalysesByFen: Record<string, AnalysisGame.NodeAnalysis> = {},
  ): Promise<GameStepState> {
    const preparedGame = prepareGame(game);
    const persistedAnalysesByFen = ChessComGameAnalysisStorage.toPositionAnalysisMap(previousEntity);
    const analysesByFen = {
      ...preparedGame.positionAnalysisMap,
      ...persistedAnalysesByFen,
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
        whiteMarks: summary.whiteMarks,
        blackMarks: summary.blackMarks,
        histogramValues: summary.histogramValues,
        materialValues: summary.materialValues,
        analysisByFen: ChessComGameAnalysisStorage.fromPositionAnalysisMap(analysesByFen),
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
    currentEntity: ChessComGameAnalysisEntity | null,
    nextEntity: ChessComGameAnalysisEntity,
  ): void {
    if (currentEntity && areEntitiesEquivalent(currentEntity, nextEntity)) return;
    chessComGameAnalysisRepository.save(nextEntity);
  }

  function areEntitiesEquivalent(left: ChessComGameAnalysisEntity, right: ChessComGameAnalysisEntity): boolean {
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
      JSON.stringify([left.whiteMarks, left.blackMarks]) === JSON.stringify([right.whiteMarks, right.blackMarks]) &&
      left.histogramValues.join(",") === right.histogramValues.join(",") &&
      left.materialValues.join(",") === right.materialValues.join(",") &&
      JSON.stringify(left.analysisByFen) === JSON.stringify(right.analysisByFen)
    );
  }

  function isCompletedEntity(entity: ChessComGameAnalysisEntity | null): boolean {
    if (!entity) return false;
    return (
      entity.status === "done" &&
      entity.targetDepth === TARGET_DEPTH &&
      !!entity.whiteMarks &&
      entity.totalPositions > 0 &&
      entity.analyzedPositions >= entity.totalPositions &&
      Object.keys(entity.analysisByFen).length > 0
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
