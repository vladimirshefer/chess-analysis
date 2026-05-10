import { AnalysisGame } from "./AnalysisGame.ts";
import type { GamePlayersInfo } from "./gameInfo.ts";

export namespace SharedAnalysis {
  const QUERY_PARAM_LINE = "line";
  const QUERY_PARAM_WHITE = "w";
  const QUERY_PARAM_BLACK = "b";
  const VALUE_DELIMITER = "_";
  const PLAYER_DELIMITER = "*";

  export function buildUrl(
    analysis: {
      tree: Record<string, AnalysisGame.MoveNode>;
      activeLineId: string;
      positionAnalysisMap: Record<string, AnalysisGame.NodeAnalysis>;
      playersInfo: GamePlayersInfo | null;
    },
    currentUrl: string,
  ): string {
    const url = new URL(currentUrl);
    const params = new URLSearchParams(url.search);
    const line = AnalysisGame.getLineNodeIds(analysis.activeLineId, analysis.tree)
      .slice(1)
      .map(function serializeNode(nodeId) {
        const node = analysis.tree[nodeId];
        const topLine = analysis.positionAnalysisMap[node.fen]?.lines.find((line) => line.lineRank === 1);
        const evaluation = analysis.positionAnalysisMap[node.fen]?.evaluation;
        return [
          stripSuffix(node.san),
          stripSuffix(topLine?.suggestedMove ?? ""),
          typeof evaluation === "number" ? `${Math.trunc(evaluation)}` : "",
        ].join(VALUE_DELIMITER);
      })
      .join(" ");

    [
      QUERY_PARAM_LINE,
      QUERY_PARAM_WHITE,
      QUERY_PARAM_BLACK,
      "whiteName",
      "whiteRating",
      "blackName",
      "blackRating",
    ].forEach(function deleteParam(name) {
      params.delete(name);
    });

    params.set(QUERY_PARAM_LINE, line);
    const whiteName = analysis.playersInfo?.white?.name?.trim() ?? "";
    const whiteRating =
      typeof analysis.playersInfo?.white?.rating === "number" ? `${Math.trunc(analysis.playersInfo.white.rating)}` : "";
    const blackName = analysis.playersInfo?.black?.name?.trim() ?? "";
    const blackRating =
      typeof analysis.playersInfo?.black?.rating === "number" ? `${Math.trunc(analysis.playersInfo.black.rating)}` : "";

    if (whiteName || whiteRating) {
      params.set(QUERY_PARAM_WHITE, `${whiteName}${PLAYER_DELIMITER}${whiteRating}`);
    } else {
      params.delete(QUERY_PARAM_WHITE);
    }
    if (blackName || blackRating) {
      params.set(QUERY_PARAM_BLACK, `${blackName}${PLAYER_DELIMITER}${blackRating}`);
    } else {
      params.delete(QUERY_PARAM_BLACK);
    }

    const query = [...params.entries()]
      .map(function toEntry([key, value]) {
        return `${encodeURIComponent(key).replace(/%20/g, "+").replace(/%2A/gi, "*")}=${encodeURIComponent(value).replace(/%20/g, "+").replace(/%2A/gi, "*")}`;
      })
      .join("&");

    url.search = query ? `?${query}` : "";
    url.hash = "";
    return url.toString();
  }

  export function readPayload(search: string): string | null {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return params.has(QUERY_PARAM_LINE) ? search : null;
  }

  export function toPgn(search: string): string {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return AnalysisGame.buildPgn(
      (params.get(QUERY_PARAM_LINE)?.trim() ? params.get(QUERY_PARAM_LINE)!.trim().split(/\s+/) : []).map(function toMove(entry) {
        const [san = "", bestMoveSan = "", evaluationToken = ""] = entry.split(VALUE_DELIMITER);
        const evaluation = evaluationToken ? Number(evaluationToken) : null;
        if (!san || (evaluationToken && !Number.isFinite(evaluation))) {
          throw new Error("Invalid shared analysis entry");
        }
        return {
          san,
          bestMoveSan: bestMoveSan || undefined,
          evaluation,
        };
      }),
      {
        white: readPlayer(params.get(QUERY_PARAM_WHITE)),
        black: readPlayer(params.get(QUERY_PARAM_BLACK)),
      },
    );
  }

  function readPlayer(value: string | null): GamePlayersInfo["white"] {
    const [nameValue = "", ratingValue = ""] = (value ?? "").split(PLAYER_DELIMITER);
    const name = nameValue.trim() || undefined;
    const rating = ratingValue && Number.isFinite(Number(ratingValue)) ? Math.trunc(Number(ratingValue)) : undefined;
    if (!name && typeof rating !== "number") return null;
    return {
      name,
      rating,
    };
  }

  function stripSuffix(san: string): string {
    return san.replace(/[+#]+$/g, "");
  }
}
