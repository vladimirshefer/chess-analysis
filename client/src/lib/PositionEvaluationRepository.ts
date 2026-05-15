import { ForsythEdwardsNotation } from "./ForsythEdwardsNotation.ts";
import { type AbsoluteNumericEvaluation } from "./evaluation.ts";

export namespace PositionEvaluations {
  export interface Repository {
    getAllByPosition(positionFen: string): Promise<PositionEvaluationRecord[]>;
    getBestForRequest(
      positionFen: string,
      minimumDepth: number,
      minimumLineCount: number,
    ): Promise<PositionEvaluationRecord | null>;
    saveEvaluation(record: PositionEvaluationRecord): Promise<void>;
    deleteAllForPosition(positionFen: string): Promise<void>;
  }

  export interface PositionEvaluationRecord {
    positionFen: string;
    engineId: string;
    searchDepth: number;
    evaluation: AbsoluteNumericEvaluation;
    variationLines: VariationLine[];
  }

  export interface VariationLine {
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

  interface StoredPositionEvaluationRecord extends PositionEvaluationRecord {
    id: string;
  }

  export class IndexedDbRepository implements Repository {
    private databasePromise: Promise<IDBDatabase> | null = null;

    async getAllByPosition(positionFen: string): Promise<PositionEvaluationRecord[]> {
      const database = await this.getDatabase();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index(INDEX_BY_POSITION_FEN);

      const records = await requestToPromise<StoredPositionEvaluationRecord[]>(
        index.getAll(IDBKeyRange.only(positionFen)),
      );

      return records.map(toPositionEvaluationRecord);
    }

    async getBestForRequest(
      positionFen: string,
      minimumDepth: number,
      minimumLineCount: number,
    ): Promise<PositionEvaluationRecord | null> {
      const records = await this.getAllByPosition(positionFen);
      const candidates = records.filter(function filterByRequest(record) {
        return record.searchDepth >= minimumDepth && record.variationLines.length >= minimumLineCount;
      });
      if (candidates.length === 0) return null;

      candidates.sort(compareBestRecordFirst);
      return clonePositionEvaluationRecord(candidates[0]);
    }

    async saveEvaluation(record: PositionEvaluationRecord): Promise<void> {
      const existingRecords = await this.getAllByPosition(record.positionFen);
      const existingForEngine = existingRecords.find(function matchEngine(existingRecord) {
        return existingRecord.engineId === record.engineId;
      });
      if (existingForEngine && existingForEngine.searchDepth >= record.searchDepth) return;

      const database = await this.getDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      await requestToPromise(store.put(toStoredPositionEvaluationRecord(record)));
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

  export const sharedRepository: Repository = new IndexedDbRepository();

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

  function toStoredPositionEvaluationRecord(record: PositionEvaluationRecord): StoredPositionEvaluationRecord {
    return {
      ...clonePositionEvaluationRecord(record),
      id: `${record.positionFen}|${record.engineId}`,
    };
  }

  function toPositionEvaluationRecord(record: StoredPositionEvaluationRecord): PositionEvaluationRecord {
    return clonePositionEvaluationRecord({
      positionFen: record.positionFen,
      engineId: record.engineId,
      searchDepth: record.searchDepth,
      evaluation: record.evaluation,
      variationLines: record.variationLines,
    });
  }

  function compareBestRecordFirst(left: PositionEvaluationRecord, right: PositionEvaluationRecord): number {
    const sideToMove = ForsythEdwardsNotation.getSideToMove(left.positionFen);
    const evaluationOrder =
      sideToMove === "w" ? right.evaluation - left.evaluation : left.evaluation - right.evaluation;
    if (evaluationOrder !== 0) return evaluationOrder;

    if (left.searchDepth !== right.searchDepth) {
      return right.searchDepth - left.searchDepth;
    }

    return right.variationLines.length - left.variationLines.length;
  }

  function clonePositionEvaluationRecord(record: PositionEvaluationRecord): PositionEvaluationRecord {
    return {
      positionFen: record.positionFen,
      engineId: record.engineId,
      searchDepth: record.searchDepth,
      evaluation: record.evaluation,
      variationLines: record.variationLines.map(function cloneLine(line) {
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
}
