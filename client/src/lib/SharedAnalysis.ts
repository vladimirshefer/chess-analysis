import { Chess } from "chess.js";
import type { GamePlayersInfo } from "./gameInfo.ts";
import { type AbsoluteNumericEvaluation, START_FEN } from "./evaluation.ts";

export namespace SharedAnalysis {
  export interface MoveNodeSnapshot {
    id: string;
    san: string;
    fen: string;
    parentId: string | null;
    children: string[];
  }

  export interface DisplayEngineLineSnapshot {
    suggestedMove: string;
    suggestedMoveUci: string;
    engineLineUci: string[];
    engineLine: string;
    evaluation: AbsoluteNumericEvaluation;
    depth: number;
    lineRank: number;
  }

  export interface NodeAnalysisSnapshot {
    fen: string;
    evaluation: AbsoluteNumericEvaluation;
    settledMaterialBalance: number | null;
    depth: number;
    lines: DisplayEngineLineSnapshot[];
    isFinal: boolean;
    opening?: null;
    openingLookupDone?: boolean;
  }

  export interface Snapshot {
    originalPgn: string;
    tree: Record<string, MoveNodeSnapshot>;
    currentNodeId: string;
    activeLineId: string;
    positionAnalysisMap: Record<string, NodeAnalysisSnapshot>;
    playersInfo: GamePlayersInfo | null;
    boardOrientation: "white" | "black";
  }

  const ROOT_NODE_ID = "__root__";
  const NODE_ID_DELIMITER = "|";
  const QUERY_PARAM_LINE = "line";
  const QUERY_PARAM_WHITE = "w";
  const QUERY_PARAM_BLACK = "b";
  const VALUE_DELIMITER = "_";
  const PLAYER_DELIMITER = "*";

  export async function buildUrl(snapshot: Snapshot, currentUrl: string): Promise<string> {
    const url = new URL(currentUrl);
    const lineNodeIds = collectPathNodeIds(snapshot.activeLineId, snapshot.tree);
    const line = lineNodeIds
      .slice(1)
      .map(function serializeNode(nodeId) {
        const node = snapshot.tree[nodeId];
        return serializeMove(stripSuffix(node.san), snapshot.positionAnalysisMap[node.fen]);
      })
      .join(" ");

    clearShareParams(url.searchParams);
    url.searchParams.set(QUERY_PARAM_LINE, line);
    setPlayerParams(url.searchParams, "white", snapshot.playersInfo?.white ?? null);
    setPlayerParams(url.searchParams, "black", snapshot.playersInfo?.black ?? null);
    url.hash = "";
    return url.toString();
  }

  export function readPayload(search: string): string | null {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return params.has(QUERY_PARAM_LINE) ? search : null;
  }

  export async function parseSnapshot(payload: string): Promise<Snapshot> {
    return deserializeSnapshot(payload);
  }

  function deserializeSnapshot(search: string): Snapshot {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const tree: Record<string, MoveNodeSnapshot> = {
      [ROOT_NODE_ID]: {
        id: ROOT_NODE_ID,
        san: "",
        fen: START_FEN,
        parentId: null,
        children: [],
      },
    };
    const lineNodeIds = [ROOT_NODE_ID];
    const positionAnalysisMap: Record<string, NodeAnalysisSnapshot> = {};

    const chess = new Chess();
    let parentId = ROOT_NODE_ID;

    splitMoveEntries(params.get(QUERY_PARAM_LINE)).forEach(function addMove(entry) {
      const [playedMove, bestMove, evaluationToken] = splitTuple(entry, 3);
      if (!playedMove) return;

      const move = chess.move(playedMove);
      if (!move) {
        throw new Error(`Shared analysis contains illegal move: ${playedMove}`);
      }

      const nodeId = parentId === ROOT_NODE_ID ? move.san : `${parentId}${NODE_ID_DELIMITER}${move.san}`;
      const node: MoveNodeSnapshot = {
        id: nodeId,
        san: move.san,
        fen: chess.fen(),
        parentId,
        children: [],
      };

      tree[nodeId] = node;
      tree[parentId] = {
        ...tree[parentId],
        children: [...tree[parentId].children, nodeId],
      };
      lineNodeIds.push(nodeId);
      parentId = nodeId;

      const nodeAnalysis = deserializeAnalysis(node.fen, [bestMove, evaluationToken].join(VALUE_DELIMITER));
      if (nodeAnalysis) {
        positionAnalysisMap[node.fen] = nodeAnalysis;
      }
    });

    const currentPly = lineNodeIds.length - 1;
    return {
      originalPgn: buildPgn(lineNodeIds, tree),
      tree,
      currentNodeId: lineNodeIds[currentPly],
      activeLineId: lineNodeIds[lineNodeIds.length - 1],
      positionAnalysisMap,
      playersInfo: {
        white: readPlayer(params, QUERY_PARAM_WHITE),
        black: readPlayer(params, QUERY_PARAM_BLACK),
      },
      boardOrientation: "white",
    };
  }

  function serializeMove(playedMove: string, analysis: NodeAnalysisSnapshot | undefined): string {
    return [playedMove, stripSuffix(getTopSuggestedMove(analysis)), serializeEvaluation(analysis?.evaluation)].join(
      VALUE_DELIMITER,
    );
  }

  function deserializeAnalysis(fen: string, value: string | null): NodeAnalysisSnapshot | null {
    if (!value) return null;
    const [bestMove, evaluationToken] = splitTuple(value, 2);
    const evaluation = parseEvaluation(evaluationToken);
    if (evaluation === null) return null;

    return {
      fen,
      evaluation,
      settledMaterialBalance: null,
      depth: 0,
      lines: bestMove ? buildSharedLine(fen, bestMove, evaluation) : [],
      isFinal: true,
      openingLookupDone: false,
    };
  }

  function buildSharedLine(
    baseFen: string,
    bestMoveSan: string,
    evaluation: AbsoluteNumericEvaluation,
  ): DisplayEngineLineSnapshot[] {
    const chess = new Chess(baseFen);
    const move = chess.move(bestMoveSan);
    if (!move) return [];

    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const suggestedMove = stripSuffix(move.san);
    return [
      {
        suggestedMove,
        suggestedMoveUci: uci,
        engineLineUci: [uci],
        engineLine: suggestedMove,
        evaluation,
        depth: 0,
        lineRank: 1,
      },
    ];
  }

  function getTopSuggestedMove(analysis: NodeAnalysisSnapshot | undefined): string {
    return analysis?.lines.find(function findTopLine(line) {
      return line.lineRank === 1;
    })?.suggestedMove ?? "";
  }

  function collectPathNodeIds(nodeId: string, tree: Record<string, MoveNodeSnapshot>): string[] {
    const result: string[] = [];
    let currentId: string | null = nodeId;
    while (currentId && tree[currentId]) {
      result.push(currentId);
      currentId = tree[currentId].parentId;
    }
    if (result[result.length - 1] !== ROOT_NODE_ID) {
      result.push(ROOT_NODE_ID);
    }
    return result.reverse();
  }

  function buildPgn(lineNodeIds: string[], tree: Record<string, MoveNodeSnapshot>): string {
    const chess = new Chess();
    lineNodeIds.slice(1).forEach(function applyMove(nodeId) {
      chess.move(tree[nodeId].san);
    });
    return chess.pgn();
  }

  function serializeEvaluation(evaluation: AbsoluteNumericEvaluation | undefined): string {
    return typeof evaluation === "number" ? `${Math.trunc(evaluation)}` : "";
  }

  function parseEvaluation(value: string): AbsoluteNumericEvaluation | null {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  }

  function splitMoveEntries(value: string | null): string[] {
    return value?.trim() ? value.trim().split(/\s+/) : [];
  }

  function splitTuple(value: string, size: number): string[] {
    const parts = value.split(VALUE_DELIMITER);
    while (parts.length < size) {
      parts.push("");
    }
    return parts.slice(0, size);
  }

  function stripSuffix(san: string): string {
    return san.replace(/[+#]+$/g, "");
  }

  function clearShareParams(params: URLSearchParams): void {
    [
      QUERY_PARAM_LINE,
      QUERY_PARAM_WHITE,
      QUERY_PARAM_BLACK,
      "currentPly",
      "orientation",
      "start",
      "whiteName",
      "whiteRating",
      "blackName",
      "blackRating",
    ].forEach(function removeParam(name) {
      params.delete(name);
    });
  }

  function setPlayerParams(
    params: URLSearchParams,
    side: "white" | "black",
    player: GamePlayersInfo["white"],
  ): void {
    const paramName = side === "white" ? QUERY_PARAM_WHITE : QUERY_PARAM_BLACK;
    params.delete(paramName);

    if (!player) return;
    const name = player.name?.trim() ?? "";
    const rating = typeof player.rating === "number" ? `${Math.trunc(player.rating)}` : "";
    if (!name && !rating) return;
    params.set(paramName, `${name}${PLAYER_DELIMITER}${rating}`);
  }

  function readPlayer(params: URLSearchParams, paramName: string): GamePlayersInfo["white"] {
    const [nameValue, ratingValue] = splitValue(params.get(paramName) ?? "", PLAYER_DELIMITER, 2);
    const name = nameValue.trim() || undefined;
    const rating = ratingValue && Number.isFinite(Number(ratingValue)) ? Math.trunc(Number(ratingValue)) : undefined;
    if (!name && typeof rating !== "number") return null;
    return {
      name,
      rating,
    };
  }

  function splitValue(value: string, delimiter: string, size: number): string[] {
    const parts = value.split(delimiter);
    while (parts.length < size) {
      parts.push("");
    }
    return parts.slice(0, size);
  }
}
