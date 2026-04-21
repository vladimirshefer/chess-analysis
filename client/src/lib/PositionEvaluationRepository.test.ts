import { beforeEach, describe, expect, it } from "vitest";
import { Evaluations } from "./evaluation.ts";

namespace IndexedDbTestMock {
  interface ObjectStoreDefinition {
    keyPath: string;
    recordsByKey: Map<string, unknown>;
    indexKeyPathByName: Map<string, string>;
  }

  interface DatabaseDefinition {
    storesByName: Map<string, ObjectStoreDefinition>;
  }

  interface KeyRangeOnly {
    value: unknown;
  }

  const databaseByName = new Map<string, IDBDatabase>();

  export function install(): void {
    databaseByName.clear();

    (globalThis as { indexedDB?: IDBFactory }).indexedDB = {
      open: (name: string): IDBOpenDBRequest => {
        const request = createOpenRequest();

        queueMicrotask(() => {
          const existing = databaseByName.get(name);
          const database = existing ?? createDatabase();
          const isNewDatabase = !existing;

          if (isNewDatabase) databaseByName.set(name, database);
          // Test mock: IDBOpenDBRequest.result is readonly in DOM types, but mock sets it manually.
          (request as unknown as { result: IDBDatabase }).result = database;

          if (isNewDatabase && request.onupgradeneeded) {
            request.onupgradeneeded(new Event("upgradeneeded") as IDBVersionChangeEvent);
          }
          if (request.onsuccess) request.onsuccess(new Event("success") as Event);
        });

        return request;
      },
      deleteDatabase: function deleteDatabase(): IDBOpenDBRequest {
        return createOpenRequest();
      },
      cmp: function cmp(): number {
        return 0;
      },
      databases: async function databases(): Promise<IDBDatabaseInfo[]> {
        return [];
      },
    } as IDBFactory;

    (globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = {
      // Test mock: only `value` is required by this fake IndexedDB implementation.
      only: (value: any): IDBKeyRange => ({ value }) as unknown as IDBKeyRange,
    } as typeof IDBKeyRange;
  }

  function createDatabase(): IDBDatabase {
    const definition: DatabaseDefinition = {
      storesByName: new Map<string, ObjectStoreDefinition>(),
    };

    const objectStoreNames = {
      contains: function contains(name: string): boolean {
        return definition.storesByName.has(name);
      },
      get length(): number {
        return definition.storesByName.size;
      },
      item: function item(): string | null {
        return null;
      },
    };

    const database = {
      objectStoreNames,
      createObjectStore: (name: string, options?: IDBObjectStoreParameters): IDBObjectStore => {
        const keyPath = String(options?.keyPath ?? "id");
        const storeDefinition: ObjectStoreDefinition = {
          keyPath,
          recordsByKey: new Map<string, unknown>(),
          indexKeyPathByName: new Map<string, string>(),
        };
        definition.storesByName.set(name, storeDefinition);
        return createObjectStore(storeDefinition);
      },
      transaction: function transaction(storeName: string): IDBTransaction {
        const storeDefinition = definition.storesByName.get(storeName);
        if (!storeDefinition) throw new Error(`Store not found: ${storeName}`);

        const transactionObject = {
          oncomplete: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
          onabort: null as ((event: Event) => void) | null,
          objectStore: function objectStore(): IDBObjectStore {
            return createObjectStore(storeDefinition);
          },
        };

        setTimeout(function completeTransaction() {
          if (transactionObject.oncomplete) {
            transactionObject.oncomplete(new Event("complete"));
          }
        }, 0);

        return transactionObject as unknown as IDBTransaction;
      },
      close: function close(): void {},
      addEventListener: function addEventListener(): void {},
      removeEventListener: function removeEventListener(): void {},
      dispatchEvent: function dispatchEvent(): boolean {
        return true;
      },
      name: "mock-db",
      version: 1,
      onabort: null,
      onclose: null,
      onerror: null,
      onversionchange: null,
    };

    return database as unknown as IDBDatabase;
  }

  function createObjectStore(definition: ObjectStoreDefinition): IDBObjectStore {
    const objectStore = {
      createIndex: (indexName: string, keyPath: string | string[]): IDBIndex => {
        definition.indexKeyPathByName.set(indexName, String(keyPath));
        return createIndex(definition, String(keyPath));
      },
      index: function index(indexName: string): IDBIndex {
        const keyPath = definition.indexKeyPathByName.get(indexName);
        if (!keyPath) throw new Error(`Index not found: ${indexName}`);
        return createIndex(definition, keyPath);
      },
      put: function put(value: unknown): IDBRequest<unknown> {
        const record = clone(value) as Record<string, unknown>;
        const key = String(record[definition.keyPath]);
        definition.recordsByKey.set(key, record);
        return createSuccessRequest(undefined);
      },
      delete: function remove(key: IDBValidKey): IDBRequest<unknown> {
        definition.recordsByKey.delete(String(key));
        return createSuccessRequest(undefined);
      },
    };

    return objectStore as unknown as IDBObjectStore;
  }

  function createIndex(definition: ObjectStoreDefinition, keyPath: string): IDBIndex {
    const index = {
      getAll: function getAll(range?: IDBKeyRange): IDBRequest<unknown[]> {
        const onlyValue = (range as unknown as KeyRangeOnly | undefined)?.value;
        const results = [...definition.recordsByKey.values()].filter(function matchByIndex(record) {
          const value = (record as Record<string, unknown>)[keyPath];
          return onlyValue === undefined ? true : value === onlyValue;
        });
        return createSuccessRequest(clone(results));
      },
      getAllKeys: function getAllKeys(range?: IDBKeyRange): IDBRequest<IDBValidKey[]> {
        const onlyValue = (range as unknown as KeyRangeOnly | undefined)?.value;
        const keys: IDBValidKey[] = [];

        definition.recordsByKey.forEach(function collect(record, key) {
          const value = (record as Record<string, unknown>)[keyPath];
          if (onlyValue === undefined || value === onlyValue) keys.push(key);
        });

        return createSuccessRequest(keys);
      },
    };

    return index as unknown as IDBIndex;
  }

  function createOpenRequest(): IDBOpenDBRequest {
    const request = {
      result: undefined as unknown as IDBDatabase,
      error: null as DOMException | null,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
      onblocked: null as ((event: Event) => void) | null,
    };

    return request as unknown as IDBOpenDBRequest;
  }

  function createSuccessRequest<T>(result: T): IDBRequest<T> {
    const request = {
      result,
      error: null as DOMException | null,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    };

    queueMicrotask(function triggerSuccess() {
      if (request.onsuccess) request.onsuccess(new Event("success"));
    });

    return request as unknown as IDBRequest<T>;
  }

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

describe("PositionEvaluations.IndexedDbRepository", function suite() {
  beforeEach(function setup() {
    IndexedDbTestMock.install();
  });

  it("saves and reads records by position", async function testCase() {
    const { PositionEvaluations } = await import("./PositionEvaluationRepository.ts");
    const repository = new PositionEvaluations.IndexedDbRepository();

    await repository.saveEvaluation({
      positionFen: "fen-a",
      engineId: "stockfish-16.1-lite",
      searchDepth: 12,
      evaluation: 35,
      variationLines: [
        {
          principalVariationMoves: ["e2e4", "e7e5"],
          evaluation: 35,
        },
      ],
    });

    const all = await repository.getAllByPosition("fen-a");

    expect(all).toHaveLength(1);
    expect(all[0]).toEqual({
      positionFen: "fen-a",
      engineId: "stockfish-16.1-lite",
      searchDepth: 12,
      evaluation: 35,
      variationLines: [
        {
          principalVariationMoves: ["e2e4", "e7e5"],
          evaluation: 35,
        },
      ],
    });
  });

  it("keeps only deepest record per position and engine", async function testCase() {
    const { PositionEvaluations } = await import("./PositionEvaluationRepository.ts");
    const repository = new PositionEvaluations.IndexedDbRepository();

    await repository.saveEvaluation({
      positionFen: "fen-b",
      engineId: "stockfish-16.1-lite",
      searchDepth: 12,
      evaluation: 120,
      variationLines: [
        {
          principalVariationMoves: ["e2e4"],
          evaluation: 120,
        },
      ],
    });

    await repository.saveEvaluation({
      positionFen: "fen-b",
      engineId: "stockfish-16.1-lite",
      searchDepth: 16,
      evaluation: 50,
      variationLines: [
        {
          principalVariationMoves: ["d2d4"],
          evaluation: 50,
        },
        {
          principalVariationMoves: ["c2c4"],
          evaluation: 30,
        },
      ],
    });

    await repository.saveEvaluation({
      positionFen: "fen-b",
      engineId: "stockfish-16.1-lite",
      searchDepth: 14,
      evaluation: Evaluations.absoluteNumericEvaluationOfMate({ mateInMoves: 4 }.mateInMoves),
      variationLines: [
        {
          principalVariationMoves: ["h7h8q"],
          evaluation: Evaluations.absoluteNumericEvaluationOfMate({ mateInMoves: 4 }.mateInMoves),
        },
      ],
    });

    const all = await repository.getAllByPosition("fen-b");
    const best = await repository.getBestForRequest("fen-b", 12, 1);
    const withTwoLines = await repository.getBestForRequest("fen-b", 12, 2);

    expect(all).toHaveLength(1);
    expect(all[0].searchDepth).toBe(16);
    expect(all[0].evaluation).toBe(50);
    expect(best?.searchDepth).toBe(16);
    expect(withTwoLines?.searchDepth).toBe(16);
    expect(withTwoLines?.variationLines).toHaveLength(2);
  });

  it("deletes all records for one position only", async function testCase() {
    const { PositionEvaluations } = await import("./PositionEvaluationRepository.ts");
    const repository = new PositionEvaluations.IndexedDbRepository();

    await repository.saveEvaluation({
      positionFen: "fen-c",
      engineId: "stockfish-16.1-lite",
      searchDepth: 12,
      evaluation: 10,
      variationLines: [
        {
          principalVariationMoves: ["g1f3"],
          evaluation: 10,
        },
      ],
    });
    await repository.saveEvaluation({
      positionFen: "fen-d",
      engineId: "stockfish-16.1-lite",
      searchDepth: 12,
      evaluation: 20,
      variationLines: [
        {
          principalVariationMoves: ["c2c4"],
          evaluation: 20,
        },
      ],
    });

    await repository.deleteAllForPosition("fen-c");

    expect(await repository.getAllByPosition("fen-c")).toHaveLength(0);
    expect(await repository.getAllByPosition("fen-d")).toHaveLength(1);
  });

  it("throws for mate 0 conversion", async function testCase() {
    expect(function throwForMateZero() {
      Evaluations.absoluteNumericEvaluationOfMate({ mateInMoves: 0 }.mateInMoves);
    }).toThrow("mateInMoves cannot be 0");
  });
});
