import { Chess } from "chess.js";
import { ForsythEdwardsNotation } from "./ForsythEdwardsNotation.ts";
import { type AbsoluteNumericEvaluation, Evaluations, START_FEN } from "./evaluation.ts";
import type { GamePlayersInfo, PlayerInfo } from "./gameInfo.ts";
import { OpeningsBook } from "./OpeningsBook.ts";

export namespace AnalysisGame {
  export interface MoveNode {
    id: string;
    san: string;
    fen: string;
    parentId: string | null;
    children: string[];
  }

  export interface DisplayEngineLine {
    suggestedMove: string;
    suggestedMoveUci: string;
    engineLineUci: string[];
    engineLine: string;
    evaluation: AbsoluteNumericEvaluation;
    depth: number;
    lineRank: number;
  }

  export interface NodeAnalysis {
    fen: string;
    evaluation: AbsoluteNumericEvaluation;
    settledMaterialBalance: number | null;
    depth: number;
    lines: DisplayEngineLine[];
    isFinal: boolean;
    source: "engine" | "pgn";
    opening?: OpeningsBook.Opening | null;
    openingLookupDone?: boolean;
  }

  export interface LoadedPgn {
    tree: Record<string, MoveNode>;
    currentNodeId: string;
    activeLineId: string;
    positionAnalysisMap: Record<string, NodeAnalysis>;
    playersInfo: GamePlayersInfo | null;
    isInvalidPgn: boolean;
  }

  export interface SharedPgnMove {
    san: string;
    bestMoveSan?: string;
    evaluation?: AbsoluteNumericEvaluation | null;
  }

  export const ROOT_NODE_ID = "__root__";
  const NODE_ID_DELIMITER = "|";

  export const TREE_SEED: Record<string, MoveNode> = {
    [ROOT_NODE_ID]: {
      id: ROOT_NODE_ID,
      san: "",
      fen: START_FEN,
      parentId: null,
      children: [],
    },
  };

  export function loadPgn(originalPgn: string): LoadedPgn {
    const chess = new Chess();
    let isInvalidPgn = false;

    try {
      chess.loadPgn(originalPgn);
    } catch {
      isInvalidPgn = true;
    }

    const comments = collectCommentMetadata(originalPgn);
    const tree: Record<string, MoveNode> = { ...TREE_SEED };
    const positionAnalysisMap: Record<string, NodeAnalysis> = {};
    const walker = new Chess();
    let lastNodeId = ROOT_NODE_ID;

    chess.history().forEach(function addMove(moveSan, index) {
      const result = walker.move(moveSan);
      const nodeId = lastNodeId === ROOT_NODE_ID ? result.san : `${lastNodeId}${NODE_ID_DELIMITER}${result.san}`;

      tree[nodeId] = {
        id: nodeId,
        san: result.san,
        fen: walker.fen(),
        parentId: lastNodeId,
        children: [],
      };
      tree[lastNodeId] = {
        ...tree[lastNodeId],
        children: [...tree[lastNodeId].children, nodeId],
      };

      const comment = comments[index];
      const evaluation = parseCommentEvaluation(comment?.evaluationToken, walker.fen());
      if (evaluation !== null || comment?.bestMoveSan) {
        positionAnalysisMap[walker.fen()] = {
          fen: walker.fen(),
          evaluation: evaluation ?? 0,
          settledMaterialBalance: null,
          depth: 0,
          lines: comment?.bestMoveSan ? toCommentLine(walker.fen(), comment.bestMoveSan, evaluation ?? 0) : [],
          isFinal: evaluation !== null,
          source: "pgn",
          openingLookupDone: false,
        };
      }

      lastNodeId = nodeId;
    });

    const headers = chess.getHeaders();
    const white = toPlayerInfo(headers.White, headers.WhiteElo);
    const black = toPlayerInfo(headers.Black, headers.BlackElo);

    return {
      tree,
      currentNodeId: lastNodeId,
      activeLineId: lastNodeId,
      positionAnalysisMap,
      playersInfo: white || black ? { white, black } : null,
      isInvalidPgn,
    };
  }

  export function buildPgn(moves: SharedPgnMove[], playersInfo: GamePlayersInfo | null): string {
    const headers: string[] = [];
    const whiteName = playersInfo?.white?.name?.trim();
    const blackName = playersInfo?.black?.name?.trim();
    const whiteRating = typeof playersInfo?.white?.rating === "number" ? `${Math.trunc(playersInfo.white.rating)}` : "";
    const blackRating = typeof playersInfo?.black?.rating === "number" ? `${Math.trunc(playersInfo.black.rating)}` : "";

    if (whiteName) headers.push(`[White "${escapeHeaderValue(whiteName)}"]`);
    if (blackName) headers.push(`[Black "${escapeHeaderValue(blackName)}"]`);
    if (whiteRating) headers.push(`[WhiteElo "${whiteRating}"]`);
    if (blackRating) headers.push(`[BlackElo "${blackRating}"]`);

    const chess = new Chess();
    const tokens: string[] = [];

    moves.forEach(function appendMove(move, index) {
      if (chess.turn() === "w") {
        tokens.push(`${Math.floor(index / 2) + 1}.`);
      }

      const appliedMove = chess.move(move.san);
      if (!appliedMove) {
        throw new Error(`Invalid shared move: ${move.san}`);
      }
      tokens.push(appliedMove.san);

      if (move.evaluation !== null || move.bestMoveSan) {
        const commentTokens: string[] = [];
        if (move.evaluation !== null && move.evaluation !== undefined) {
          commentTokens.push(`[%eval ${toCommentEvaluation(move.evaluation, chess.fen())}]`);
        }
        if (move.bestMoveSan) {
          commentTokens.push(`[%best ${stripSuffix(move.bestMoveSan)}]`);
        }
        if (commentTokens.length > 0) {
          tokens.push(`{ ${commentTokens.join(" ")} }`);
        }
      }
    });

    const movetext = `${tokens.join(" ")} *`.trim();
    return headers.length > 0 ? `${headers.join("\n")}\n\n${movetext}` : movetext;
  }

  export function withPlayers(pgn: string, playersInfo: GamePlayersInfo | null): string {
    if (!playersInfo?.white && !playersInfo?.black) return pgn;

    const lines = pgn.replace(/\r/g, "").split("\n");
    const orderedNames: string[] = [];
    const headerByName = new Map<string, string>();
    let index = 0;

    while (index < lines.length && lines[index].trim().startsWith("[")) {
      const line = lines[index].trim();
      const match = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/);
      if (match) {
        const name = match[1];
        if (!headerByName.has(name)) orderedNames.push(name);
        headerByName.set(name, match[2]);
      }
      index += 1;
    }

    while (index < lines.length && !lines[index].trim()) {
      index += 1;
    }

    const whiteName = playersInfo?.white?.name?.trim();
    const blackName = playersInfo?.black?.name?.trim();
    const whiteRating = typeof playersInfo?.white?.rating === "number" ? `${Math.trunc(playersInfo.white.rating)}` : "";
    const blackRating = typeof playersInfo?.black?.rating === "number" ? `${Math.trunc(playersInfo.black.rating)}` : "";

    upsertHeader("White", whiteName);
    upsertHeader("Black", blackName);
    upsertHeader("WhiteElo", whiteRating);
    upsertHeader("BlackElo", blackRating);

    const headerLines = orderedNames.map(function toHeaderLine(name) {
      return `[${name} "${escapeHeaderValue(headerByName.get(name) ?? "")}"]`;
    });
    const movetext = lines.slice(index).join("\n").trim();
    if (headerLines.length === 0) return movetext;
    return movetext ? `${headerLines.join("\n")}\n\n${movetext}` : `${headerLines.join("\n")}\n`;

    function upsertHeader(name: string, value: string): void {
      if (!value) return;
      if (!headerByName.has(name)) orderedNames.push(name);
      headerByName.set(name, value);
    }
  }

  export function getNextNodeId(currentNodeId: string, tree: Record<string, MoveNode>): string | null {
    return tree[currentNodeId]?.children?.[0] ?? null;
  }

  export function getLineNodeIds(currentNodeId: string, tree: Record<string, MoveNode>): string[] {
    if (!tree[currentNodeId]) return [ROOT_NODE_ID];

    while (tree[currentNodeId].children.length > 0) {
      currentNodeId = tree[currentNodeId].children[0];
    }

    const result: string[] = [];
    for (let id = currentNodeId; id && tree[id]; id = tree[id].parentId) {
      result.push(id);
    }

    return result.reverse();
  }

  export function filterAnalysesForTree(
    tree: Record<string, MoveNode>,
    positionAnalysisMap: Record<string, NodeAnalysis>,
  ): Record<string, NodeAnalysis> {
    const relevantFens = new Set(Object.values(tree).map((node) => node.fen));
    const result: Record<string, NodeAnalysis> = {};

    Object.entries(positionAnalysisMap).forEach(function addAnalysis([fen, analysis]) {
      if (relevantFens.has(fen)) result[fen] = analysis;
    });

    return result;
  }

  export function addNode(
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

  function collectCommentMetadata(pgn: string): { evaluationToken?: string; bestMoveSan?: string }[] {
    const result: { evaluationToken?: string; bestMoveSan?: string }[] = [];
    const movetext = pgn
      .replace(/\r/g, "")
      .replace(/^\s*(?:\[[^\]]*\]\s*\n)*/u, "")
      .trim();

    let lastMoveIndex = -1;

    for (let index = 0; index < movetext.length; ) {
      const char = movetext[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (char === "{") {
        const endIndex = movetext.indexOf("}", index + 1);
        const comment = movetext.slice(index + 1, endIndex >= 0 ? endIndex : undefined);
        const evaluationToken = comment.match(/\[%eval\s+([^\]]+)\]/)?.[1]?.trim();
        const bestMoveSan = comment.match(/\[%best\s+([^\]]+)\]/)?.[1]?.trim();

        if (lastMoveIndex >= 0 && (evaluationToken || bestMoveSan)) {
          result[lastMoveIndex] = {
            evaluationToken,
            bestMoveSan: bestMoveSan ? stripSuffix(bestMoveSan) : undefined,
          };
        }

        index = endIndex >= 0 ? endIndex + 1 : movetext.length;
        continue;
      }

      if (char === ";") {
        while (index < movetext.length && movetext[index] !== "\n") {
          index += 1;
        }
        continue;
      }

      if (char === "(") {
        let depth = 1;
        index += 1;
        while (index < movetext.length && depth > 0) {
          if (movetext[index] === "(") depth += 1;
          if (movetext[index] === ")") depth -= 1;
          index += 1;
        }
        continue;
      }

      let endIndex = index + 1;
      while (endIndex < movetext.length && !/[\s{}()]/.test(movetext[endIndex])) {
        endIndex += 1;
      }

      const token = movetext.slice(index, endIndex);
      if (
        !/^\d+\.(\.\.)?$/.test(token) &&
        !/^\$\d+$/.test(token) &&
        !/^[!?]+$/.test(token) &&
        token !== "*" &&
        token !== "1-0" &&
        token !== "0-1" &&
        token !== "1/2-1/2"
      ) {
        lastMoveIndex = result.push({}) - 1;
      }
      index = endIndex;
    }

    return result;
  }

  function parseCommentEvaluation(value: string | undefined, fen: string): AbsoluteNumericEvaluation | null {
    if (!value) return null;

    const normalized = value.trim();
    if (/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
      return fromWhitePerspective(Math.round(Number(normalized) * 100), fen);
    }
    if (/^[+-]?M\d+$/i.test(normalized)) {
      return fromWhitePerspective(toMateScore(normalized.replace(/m/i, "")), fen);
    }
    if (/^#-?\d+$/.test(normalized)) {
      return fromWhitePerspective(toMateScore(normalized.slice(1)), fen);
    }
    if (/^-#\d+$/.test(normalized)) {
      return fromWhitePerspective(toMateScore(`-${normalized.slice(2)}`), fen);
    }
    if (normalized === "1-0") return fromWhitePerspective(Evaluations.absoluteNumericEvaluationOfWhiteWin(), fen);
    if (normalized === "0-1") return fromWhitePerspective(-Evaluations.absoluteNumericEvaluationOfWhiteWin(), fen);
    if (normalized === "1/2-1/2") return 0;
    return null;
  }

  function toCommentEvaluation(evaluation: AbsoluteNumericEvaluation, fen: string): string {
    const whitePerspective = toWhitePerspective(evaluation, fen);
    if (whitePerspective === Evaluations.absoluteNumericEvaluationOfWhiteWin()) return "1-0";
    if (whitePerspective === -Evaluations.absoluteNumericEvaluationOfWhiteWin()) return "0-1";

    const absoluteValue = Math.abs(whitePerspective);
    if (absoluteValue >= 1_000_000) {
      const encodedDistance = absoluteValue - 1_000_000;
      const distance = Math.max(1, 999_999 - encodedDistance);
      return `#${whitePerspective < 0 ? "-" : ""}${distance}`;
    }

    const sign = whitePerspective > 0 ? "+" : whitePerspective < 0 ? "-" : "";
    return `${sign}${(Math.abs(whitePerspective) / 100).toFixed(1)}`;
  }

  function toCommentLine(
    baseFen: string,
    bestMoveSan: string,
    evaluation: AbsoluteNumericEvaluation,
  ): DisplayEngineLine[] {
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

  function toPlayerInfo(name: string | undefined, rating: string | number | undefined): PlayerInfo | null {
    const parsedName = name?.trim() || undefined;
    const parsedRating = rating ? parseInt(`${rating}`, 10) : undefined;
    if (!parsedName && typeof parsedRating !== "number") return null;
    return {
      name: parsedName,
      rating: parsedRating,
    };
  }

  function stripSuffix(san: string): string {
    return san.replace(/[+#]+$/g, "");
  }

  function toMateScore(value: string): AbsoluteNumericEvaluation {
    const distance = Math.trunc(Number(value));
    return Evaluations.absoluteNumericEvaluationOfMate(distance < 0 ? Math.min(distance, -1) : Math.max(distance, 1));
  }

  function toWhitePerspective(value: AbsoluteNumericEvaluation, fen: string): AbsoluteNumericEvaluation {
    return ForsythEdwardsNotation.getSideToMove(fen) === "w" ? value : -value;
  }

  function fromWhitePerspective(value: AbsoluteNumericEvaluation, fen: string): AbsoluteNumericEvaluation {
    return ForsythEdwardsNotation.getSideToMove(fen) === "w" ? value : -value;
  }

  function escapeHeaderValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
}
