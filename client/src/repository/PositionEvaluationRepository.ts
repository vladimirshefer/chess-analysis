import { ForsythEdwardsNotation } from "../lib/ForsythEdwardsNotation.ts";
import { type AbsoluteNumericEvaluation } from "../lib/evaluation.ts";

export interface PositionEvaluationRepository {
  getAllByPosition(positionFen: string): Promise<PositionEvaluationEntity[]>;
  getBestForRequest(
    positionFen: string,
    minimumDepth: number,
    minimumLineCount: number,
  ): Promise<PositionEvaluationEntity | null>;
  saveEvaluation(entity: PositionEvaluationEntity): Promise<void>;
  deleteAllForPosition(positionFen: string): Promise<void>;
}

export interface PositionEvaluationEntity {
  positionFen: string;
  engineId: string;
  searchDepth: number;
  evaluation: AbsoluteNumericEvaluation;
  variationLines: VariationLineEntity[];
}

export interface VariationLineEntity {
  /**
   * UCI moves in order from the current position.
   * Example: ["e2e4", "e7e5", "g1f3"]
   */
  principalVariationMoves: string[];
  evaluation: AbsoluteNumericEvaluation;
}

const DATABASE_NAME = "chess-analysis";
const DATABASE_VERSION = 2;
const LEGACY_STORE_NAME = "position_evaluations";
const STORE_NAME = "position_evaluations_v2";
const INDEX_BY_POSITION_FEN = "by_position_fen";

interface StoredPositionEvaluationEntity extends PositionEvaluationEntity {
  id: string;
}

export class IndexedDbPositionEvaluationRepository implements PositionEvaluationRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  async getAllByPosition(positionFen: string): Promise<PositionEvaluationEntity[]> {
    const database = await this.getDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(INDEX_BY_POSITION_FEN);

    const entities = await requestToPromise<StoredPositionEvaluationEntity[]>(
      index.getAll(IDBKeyRange.only(positionFen)),
    );

    return entities.map(toPositionEvaluationEntity);
  }

  async getBestForRequest(
    positionFen: string,
    minimumDepth: number,
    minimumLineCount: number,
  ): Promise<PositionEvaluationEntity | null> {
    const entities = await this.getAllByPosition(positionFen);
    const candidates = entities.filter(function filterByRequest(entity) {
      return entity.searchDepth >= minimumDepth && entity.variationLines.length >= minimumLineCount;
    });
    if (candidates.length === 0) return null;

    candidates.sort(compareBestEntityFirst);
    return clonePositionEvaluationEntity(candidates[0]);
  }

  async saveEvaluation(entity: PositionEvaluationEntity): Promise<void> {
    const existingEntities = await this.getAllByPosition(entity.positionFen);
    const existingForEngine = existingEntities.find(function matchEngine(existingEntity) {
      return existingEntity.engineId === entity.engineId;
    });
    if (existingForEngine && existingForEngine.searchDepth >= entity.searchDepth) return;

    const database = await this.getDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await requestToPromise(store.put(toStoredPositionEvaluationEntity(entity)));
    await transactionToPromise(transaction);
  }

  async deleteAllForPosition(positionFen: string): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(INDEX_BY_POSITION_FEN);
    const keys = await requestToPromise<IDBValidKey[]>(index.getAllKeys(IDBKeyRange.only(positionFen)));

    for (const key of keys) {
      await requestToPromise(store.delete(key));
    }

    await transactionToPromise(transaction);
  }

  private getDatabase(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = openDatabase();
    }
    return this.databasePromise;
  }
}

export const positionEvaluationsRepository: PositionEvaluationRepository = new IndexedDbPositionEvaluationRepository();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        database.deleteObjectStore(LEGACY_STORE_NAME);
      }
      if (database.objectStoreNames.contains(STORE_NAME)) return;

      const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex(INDEX_BY_POSITION_FEN, "positionFen", {
        unique: false,
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function toStoredPositionEvaluationEntity(entity: PositionEvaluationEntity): StoredPositionEvaluationEntity {
  return {
    ...clonePositionEvaluationEntity(entity),
    id: `${entity.positionFen}|${entity.engineId}`,
  };
}

function toPositionEvaluationEntity(stored: StoredPositionEvaluationEntity): PositionEvaluationEntity {
  return clonePositionEvaluationEntity({
    positionFen: stored.positionFen,
    engineId: stored.engineId,
    searchDepth: stored.searchDepth,
    evaluation: stored.evaluation,
    variationLines: stored.variationLines,
  });
}

function compareBestEntityFirst(left: PositionEvaluationEntity, right: PositionEvaluationEntity): number {
  const sideToMove = ForsythEdwardsNotation.getSideToMove(left.positionFen);
  const evaluationOrder = sideToMove === "w" ? right.evaluation - left.evaluation : left.evaluation - right.evaluation;
  if (evaluationOrder !== 0) return evaluationOrder;

  if (left.searchDepth !== right.searchDepth) {
    return right.searchDepth - left.searchDepth;
  }

  return right.variationLines.length - left.variationLines.length;
}

function clonePositionEvaluationEntity(entity: PositionEvaluationEntity): PositionEvaluationEntity {
  return {
    positionFen: entity.positionFen,
    engineId: entity.engineId,
    searchDepth: entity.searchDepth,
    evaluation: entity.evaluation,
    variationLines: entity.variationLines.map(function cloneLine(line) {
      return {
        principalVariationMoves: [...line.principalVariationMoves],
        evaluation: line.evaluation,
      };
    }),
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise(function onRequest(resolve, reject) {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = function onError() {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}
