import { AnalysisGame } from "../lib/AnalysisGame.ts";

export type ChessComGameAnalysisStatus = "pending" | "running" | "done" | "failed";

export interface ChessComGameAnalysisEntity {
  gameId: string;
  status: ChessComGameAnalysisStatus;
  targetDepth: number;
  analyzedPositions: number;
  totalPositions: number;
  lastAnalyzedFen: string | null;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  whiteMarks?: Record<string, number>;
  blackMarks?: Record<string, number>;
  histogramValues: number[];
  materialValues: number[];
  analysisByFen: Record<string, PersistedNodeAnalysisEntity>;
  updatedAt: number;
  errorMessage?: string;
}

export interface PersistedDisplayEngineLineEntity {
  suggestedMove: string;
  suggestedMoveUci: string;
  engineLineUci: string[];
  engineLine: string;
  evaluation: number;
  depth: number;
  lineRank: number;
}

export interface PersistedNodeAnalysisEntity {
  fen: string;
  evaluation: number;
  settledMaterialBalance: number | null;
  depth: number;
  lines: PersistedDisplayEngineLineEntity[];
  isFinal: boolean;
  source: "engine" | "pgn";
}

export interface ChessComGameAnalysisRepository {
  get(id: string): ChessComGameAnalysisEntity | null;
  save(entity: ChessComGameAnalysisEntity): ChessComGameAnalysisEntity;
  update(entity: ChessComGameAnalysisEntity): ChessComGameAnalysisEntity;
  getAll(): ChessComGameAnalysisEntity[];
  delete(id: string): void;
  deleteAll(): Promise<void>;
}

export namespace ChessComGameAnalysisStorage {
  /** Bump the version to invalidate stored analysis. Keys of older versions are dropped on first access. */
  const STORAGE_KEY_BASE = "chess-com-game-analysis";
  const KEY_PREFIX = `${STORAGE_KEY_BASE}-v2:`;

  export class LocalStorageChessComGameAnalysisRepository implements ChessComGameAnalysisRepository {
    private outdatedDropped = false;

    get(id: string): ChessComGameAnalysisEntity | null {
      if (!id) return null;
      this.dropOutdatedOnce();
      return readEntity(id);
    }

    save(entity: ChessComGameAnalysisEntity): ChessComGameAnalysisEntity {
      this.dropOutdatedOnce();
      return upsertEntity(entity);
    }

    update(entity: ChessComGameAnalysisEntity): ChessComGameAnalysisEntity {
      return this.save(entity);
    }

    getAll(): ChessComGameAnalysisEntity[] {
      this.dropOutdatedOnce();
      return listStorageKeys().flatMap(function readByKey(key) {
        return readEntity(key.slice(KEY_PREFIX.length)) ?? [];
      });
    }

    delete(id: string): void {
      if (!id) return;
      globalThis.localStorage.removeItem(KEY_PREFIX + id);
    }

    async deleteAll(): Promise<void> {
      dropOutdatedStorage();
      listStorageKeys().forEach(function removeKey(key) {
        globalThis.localStorage.removeItem(key);
      });
    }

    private dropOutdatedOnce(): void {
      if (this.outdatedDropped) return;
      this.outdatedDropped = true;
      dropOutdatedStorage();
    }
  }

  export function toPositionAnalysisMap(
    entity: ChessComGameAnalysisEntity | null,
  ): Record<string, AnalysisGame.NodeAnalysis> {
    if (!entity) return {};

    return Object.entries(entity.analysisByFen).reduce(
      function collectAnalysis(result, [fen, analysis]) {
        result[fen] = {
          fen: analysis.fen,
          evaluation: analysis.evaluation,
          settledMaterialBalance: analysis.settledMaterialBalance,
          depth: analysis.depth,
          lines: analysis.lines.map(cloneDisplayEngineLine),
          isFinal: analysis.isFinal,
          source: analysis.source,
        };
        return result;
      },
      {} as Record<string, AnalysisGame.NodeAnalysis>,
    );
  }

  export function fromPositionAnalysisMap(
    analysesByFen: Record<string, AnalysisGame.NodeAnalysis>,
  ): Record<string, PersistedNodeAnalysisEntity> {
    return Object.entries(analysesByFen).reduce(
      function collectAnalysis(result, [fen, analysis]) {
        result[fen] = {
          fen: analysis.fen,
          evaluation: analysis.evaluation,
          settledMaterialBalance: analysis.settledMaterialBalance,
          depth: analysis.depth,
          lines: analysis.lines.map(cloneDisplayEngineLine),
          isFinal: analysis.isFinal,
          source: analysis.source,
        };
        return result;
      },
      {} as Record<string, PersistedNodeAnalysisEntity>,
    );
  }

  function upsertEntity(entity: ChessComGameAnalysisEntity): ChessComGameAnalysisEntity {
    const entityId = entity.gameId;
    if (!entityId) return entity;

    writeEntity(entity);
    return entity;
  }

  function listStorageKeys(): string[] {
    const keys: string[] = [];
    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
    return keys;
  }

  function readEntity(id: string): ChessComGameAnalysisEntity | null {
    const rawValue = globalThis.localStorage.getItem(KEY_PREFIX + id);
    if (!rawValue) return null;

    try {
      return parseEntity(JSON.parse(rawValue) as unknown);
    } catch {
      return null;
    }
  }

  function writeEntity(entity: ChessComGameAnalysisEntity): void {
    globalThis.localStorage.setItem(KEY_PREFIX + entity.gameId, JSON.stringify(cloneEntity(entity)));
  }

  function dropOutdatedStorage(): void {
    const outdatedKeys: string[] = [];
    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index);
      if (key?.startsWith(STORAGE_KEY_BASE) && !key.startsWith(KEY_PREFIX)) outdatedKeys.push(key);
    }
    outdatedKeys.forEach(function removeKey(key) {
      globalThis.localStorage.removeItem(key);
    });
  }

  function parseEntity(value: unknown): ChessComGameAnalysisEntity | null {
    if (!isObjectRecord(value)) return null;
    if (typeof value.gameId !== "string" || !value.gameId) return null;
    if (typeof value.targetDepth !== "number") return null;
    if (typeof value.analyzedPositions !== "number") return null;
    if (typeof value.totalPositions !== "number") return null;
    if (typeof value.updatedAt !== "number") return null;
    if (!isStatus(value.status)) return null;
    if (value.lastAnalyzedFen !== null && typeof value.lastAnalyzedFen !== "string") return null;
    if (value.whiteAccuracy !== null && typeof value.whiteAccuracy !== "number") return null;
    if (value.blackAccuracy !== null && typeof value.blackAccuracy !== "number") return null;
    if (!Array.isArray(value.histogramValues) || !value.histogramValues.every((item) => typeof item === "number"))
      return null;
    if (!Array.isArray(value.materialValues) || !value.materialValues.every((item) => typeof item === "number"))
      return null;
    const analysisByFen = value.analysisByFen;
    if (analysisByFen !== undefined && !isPersistedAnalysisByFen(analysisByFen)) return null;
    if (value.errorMessage !== undefined && typeof value.errorMessage !== "string") return null;

    return cloneEntity({
      ...(value as unknown as ChessComGameAnalysisEntity),
      analysisByFen: isPersistedAnalysisByFen(analysisByFen) ? analysisByFen : {},
    });
  }

  function cloneEntity(entity: ChessComGameAnalysisEntity): ChessComGameAnalysisEntity {
    return {
      gameId: entity.gameId,
      status: entity.status,
      targetDepth: entity.targetDepth,
      analyzedPositions: entity.analyzedPositions,
      totalPositions: entity.totalPositions,
      lastAnalyzedFen: entity.lastAnalyzedFen,
      whiteAccuracy: entity.whiteAccuracy,
      blackAccuracy: entity.blackAccuracy,
      ...(entity.whiteMarks ? { whiteMarks: { ...entity.whiteMarks } } : {}),
      ...(entity.blackMarks ? { blackMarks: { ...entity.blackMarks } } : {}),
      histogramValues: [...entity.histogramValues],
      materialValues: [...entity.materialValues],
      analysisByFen: Object.entries(entity.analysisByFen).reduce(
        function collectAnalysis(result, [fen, analysis]) {
          result[fen] = cloneNodeAnalysisEntity(analysis);
          return result;
        },
        {} as Record<string, PersistedNodeAnalysisEntity>,
      ),
      updatedAt: entity.updatedAt,
      ...(entity.errorMessage ? { errorMessage: entity.errorMessage } : {}),
    };
  }

  function isStatus(value: unknown): value is ChessComGameAnalysisStatus {
    return value === "pending" || value === "running" || value === "done" || value === "failed";
  }

  function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function isPersistedAnalysisByFen(value: unknown): value is Record<string, PersistedNodeAnalysisEntity> {
    if (!isObjectRecord(value)) return false;

    return Object.values(value).every(function isValidAnalysis(analysis) {
      return isPersistedNodeAnalysisEntity(analysis);
    });
  }

  function isPersistedNodeAnalysisEntity(value: unknown): value is PersistedNodeAnalysisEntity {
    if (!isObjectRecord(value)) return false;
    if (typeof value.fen !== "string" || !value.fen) return false;
    if (typeof value.evaluation !== "number") return false;
    if (value.settledMaterialBalance !== null && typeof value.settledMaterialBalance !== "number") return false;
    if (typeof value.depth !== "number") return false;
    if (typeof value.isFinal !== "boolean") return false;
    if (value.source !== "engine" && value.source !== "pgn") return false;
    if (!Array.isArray(value.lines) || !value.lines.every((line) => isPersistedDisplayEngineLineEntity(line)))
      return false;
    return true;
  }

  function isPersistedDisplayEngineLineEntity(value: unknown): value is PersistedDisplayEngineLineEntity {
    if (!isObjectRecord(value)) return false;
    if (typeof value.suggestedMove !== "string") return false;
    if (typeof value.suggestedMoveUci !== "string") return false;
    if (!Array.isArray(value.engineLineUci) || !value.engineLineUci.every((item) => typeof item === "string"))
      return false;
    if (typeof value.engineLine !== "string") return false;
    if (typeof value.evaluation !== "number") return false;
    if (typeof value.depth !== "number") return false;
    if (typeof value.lineRank !== "number") return false;
    return true;
  }

  function cloneNodeAnalysisEntity(entity: PersistedNodeAnalysisEntity): PersistedNodeAnalysisEntity {
    return {
      fen: entity.fen,
      evaluation: entity.evaluation,
      settledMaterialBalance: entity.settledMaterialBalance,
      depth: entity.depth,
      lines: entity.lines.map(cloneDisplayEngineLine),
      isFinal: entity.isFinal,
      source: entity.source,
    };
  }

  function cloneDisplayEngineLine(
    line: PersistedDisplayEngineLineEntity | AnalysisGame.DisplayEngineLine,
  ): PersistedDisplayEngineLineEntity {
    return {
      suggestedMove: line.suggestedMove,
      suggestedMoveUci: line.suggestedMoveUci,
      engineLineUci: [...line.engineLineUci],
      engineLine: line.engineLine,
      evaluation: line.evaluation,
      depth: line.depth,
      lineRank: line.lineRank,
    };
  }
}

export const chessComGameAnalysisRepository: ChessComGameAnalysisRepository =
  new ChessComGameAnalysisStorage.LocalStorageChessComGameAnalysisRepository();
