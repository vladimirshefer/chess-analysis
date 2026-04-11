export namespace UniversalChessInterface {
  export namespace LineReaderUtil {
    export function tokenizeByWhitespace(line: string): string[] {
      const tokens: string[] = [];
      let current = "";

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const isWhitespace =
          char === " " || char === "\t" || char === "\n" || char === "\r";

        if (isWhitespace) {
          if (current.length > 0) {
            tokens.push(current);
            current = "";
          }
          continue;
        }

        current += char;
      }

      if (current.length > 0) tokens.push(current);
      return tokens;
    }
  }

  /**
   * Parsed payload of a single UCI `info ...` line.
   * Includes only fields that are represented directly in that line.
   */
  export interface InfoLineDto {
    /**
     * `depth <n>`
     */
    depth?: number;

    /**
     * `seldepth <n>`
     */
    selectiveDepth?: number;

    /**
     * `multipv <n>`
     */
    multiPrincipalVariation?: number;

    /**
     * `score cp <n>`
     */
    scoreCentipawn?: number;

    /**
     * `score mate <n>`
     */
    mateInMoves?: number;

    /**
     * `score ... lowerbound|upperbound`
     */
    scoreBound?: "lowerbound" | "upperbound";

    /**
     * `nodes <n>`
     */
    nodes?: number;

    /**
     * `nps <n>`
     */
    nodesPerSecond?: number;

    /**
     * `hashfull <n>` (permille)
     */
    hashFull?: number;

    /**
     * `tbhits <n>`
     */
    tablebaseHits?: number;

    /**
     * `time <n>` (milliseconds)
     */
    timeMs?: number;

    /**
     * `currmove <uci>`
     */
    currentMove?: string;

    /**
     * `currmovenumber <n>`
     */
    currentMoveNumber?: number;

    /**
     * `pv <uci...>`
     */
    principalVariation?: string[];
  }

  /**
   * Convert a UCI `info ...` line into a structured DTO.
   * Returns null when the input is not an `info` line.
   */
  export function parseInfoLine(uciLine: string): InfoLineDto | null {
    const tokens = LineReaderUtil.tokenizeByWhitespace(uciLine.trim());
    if (tokens.length === 0 || tokens[0] !== "info") return null;

    const dto: InfoLineDto = {};
    let index = 1;

    while (index < tokens.length) {
      const token = tokens[index];

      switch (token) {
        case "depth": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.depth = value;
          index += 2;
          break;
        }
        case "seldepth": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.selectiveDepth = value;
          index += 2;
          break;
        }
        case "multipv": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.multiPrincipalVariation = value;
          index += 2;
          break;
        }
        case "nodes": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.nodes = value;
          index += 2;
          break;
        }
        case "nps": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.nodesPerSecond = value;
          index += 2;
          break;
        }
        case "hashfull": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.hashFull = value;
          index += 2;
          break;
        }
        case "tbhits": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.tablebaseHits = value;
          index += 2;
          break;
        }
        case "time": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.timeMs = value;
          index += 2;
          break;
        }
        case "currmove": {
          const value = tokens[index + 1];
          if (value !== undefined) dto.currentMove = value;
          index += 2;
          break;
        }
        case "currmovenumber": {
          const value = Number.parseInt(tokens[index + 1], 10);
          if (!Number.isNaN(value)) dto.currentMoveNumber = value;
          index += 2;
          break;
        }
        case "score": {
          const scoreKind = tokens[index + 1];
          const scoreValue = Number.parseInt(tokens[index + 2], 10);

          if (!Number.isNaN(scoreValue)) {
            if (scoreKind === "cp") dto.scoreCentipawn = scoreValue;
            if (scoreKind === "mate") dto.mateInMoves = scoreValue;
          }

          const maybeBound = tokens[index + 3];
          if (maybeBound === "lowerbound") dto.scoreBound = "lowerbound";
          if (maybeBound === "upperbound") dto.scoreBound = "upperbound";

          index += 3;
          if (maybeBound === "lowerbound" || maybeBound === "upperbound") {
            index += 1;
          }
          break;
        }
        case "pv": {
          const variation = tokens.slice(index + 1);
          if (variation.length > 0) dto.principalVariation = variation;
          index = tokens.length;
          break;
        }
        default: {
          index += 1;
          break;
        }
      }
    }

    return dto;
  }
}
