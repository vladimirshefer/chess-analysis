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
    /** `depth <n>` */
    depth?: number;

    /** `seldepth <n>` */
    selectiveDepth?: number;

    /** `multipv <n>` */
    multiPrincipalVariation?: number;

    /** `score cp <n>` */
    scoreCentipawn?: number;

    /** `score mate <n>` */
    mateInMoves?: number;

    /** `score ... lowerbound|upperbound` */
    scoreBound?: "lowerbound" | "upperbound";

    /** `nodes <n>` */
    nodes?: number;

    /** `nps <n>` */
    nodesPerSecond?: number;

    /** `hashfull <n>` (permille) */
    hashFull?: number;

    /** `tbhits <n>` */
    tablebaseHits?: number;

    /** `time <n>` (milliseconds) */
    timeMs?: number;

    /** `currmove <uci>` */
    currentMove?: string;

    /** `currmovenumber <n>` */
    currentMoveNumber?: number;

    /** `pv <uci...>` */
    principalVariation?: string[];
  }

  export interface BestMoveLineDto {
    /** `bestmove <uci>` */
    bestMove: string;

    /** `bestmove ... ponder <uci>` */
    ponderMove?: string;
  }

  export interface IdLineDto {
    /** `id name ...` or `id author ...` */
    field: "name" | "author";

    /** Remaining text of the id field. */
    value: string;
  }

  export interface OptionLineDto {
    /** `option name <text...>` */
    name: string;

    /** `option ... type <check|spin|combo|button|string>` */
    optionType: string;

    /** `option ... default <text...>` */
    defaultValue?: string;

    /** `option ... min <n>` */
    min?: number;

    /** `option ... max <n>` */
    max?: number;

    /** `option ... var <text...>` (may repeat) */
    variables?: string[];
  }

  export interface UciOkLineDto {
    marker: "uciok";
  }

  export interface ReadyOkLineDto {
    marker: "readyok";
  }

  export type EngineLineDto =
    | { type: "info"; data: InfoLineDto }
    | { type: "bestmove"; data: BestMoveLineDto }
    | { type: "id"; data: IdLineDto }
    | { type: "option"; data: OptionLineDto }
    | { type: "uciok"; data: UciOkLineDto }
    | { type: "readyok"; data: ReadyOkLineDto };

  /**
   * Convert any known UCI line into a typed DTO.
   * Returns null when line type is unknown.
   */
  export function parseEngineLine(uciLine: string): EngineLineDto | null {
    const tokens = LineReaderUtil.tokenizeByWhitespace(uciLine.trim());
    if (tokens.length === 0) return null;

    switch (tokens[0]) {
      case "info": {
        const infoLine = parseInfoLineTokens(tokens);
        return infoLine ? { type: "info", data: infoLine } : null;
      }
      case "bestmove": {
        const bestMoveLine = parseBestMoveLineTokens(tokens);
        return bestMoveLine ? { type: "bestmove", data: bestMoveLine } : null;
      }
      case "id": {
        const idLine = parseIdLineTokens(tokens);
        return idLine ? { type: "id", data: idLine } : null;
      }
      case "option": {
        const optionLine = parseOptionLineTokens(tokens);
        return optionLine ? { type: "option", data: optionLine } : null;
      }
      case "uciok":
        return { type: "uciok", data: { marker: "uciok" } };
      case "readyok":
        return { type: "readyok", data: { marker: "readyok" } };
      default:
        return null;
    }
  }

  /**
   * Convert a UCI `info ...` line into a structured DTO.
   * Returns null when the input is not an `info` line.
   */
  export function parseInfoLine(uciLine: string): InfoLineDto | null {
    const parsedLine = parseEngineLine(uciLine);
    if (!parsedLine || parsedLine.type !== "info") return null;
    return parsedLine.data;
  }

  /**
   * Convert a UCI `bestmove ...` line into a structured DTO.
   * Returns null when the input is not a `bestmove` line.
   */
  export function parseBestMoveLine(uciLine: string): BestMoveLineDto | null {
    const parsedLine = parseEngineLine(uciLine);
    if (!parsedLine || parsedLine.type !== "bestmove") return null;
    return parsedLine.data;
  }

  /**
   * Convert a UCI `id ...` line into a structured DTO.
   * Returns null when the input is not an `id` line.
   */
  export function parseIdLine(uciLine: string): IdLineDto | null {
    const parsedLine = parseEngineLine(uciLine);
    if (!parsedLine || parsedLine.type !== "id") return null;
    return parsedLine.data;
  }

  /**
   * Convert a UCI `option ...` line into a structured DTO.
   * Returns null when the input is not an `option` line.
   */
  export function parseOptionLine(uciLine: string): OptionLineDto | null {
    const parsedLine = parseEngineLine(uciLine);
    if (!parsedLine || parsedLine.type !== "option") return null;
    return parsedLine.data;
  }

  function parseInfoLineTokens(tokens: string[]): InfoLineDto | null {
    if (tokens.length === 0 || tokens[0] !== "info") return null;

    const dto: InfoLineDto = {};
    let index = 1;

    while (index < tokens.length) {
      const token = tokens[index];

      switch (token) {
        case "depth": {
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.depth = value;
          index += 2;
          break;
        }
        case "seldepth": {
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.selectiveDepth = value;
          index += 2;
          break;
        }
        case "multipv": {
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.multiPrincipalVariation = value;
          index += 2;
          break;
        }
        case "nodes": {
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.nodes = value;
          index += 2;
          break;
        }
        case "nps": {
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.nodesPerSecond = value;
          index += 2;
          break;
        }
        case "hashfull": {
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.hashFull = value;
          index += 2;
          break;
        }
        case "tbhits": {
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.tablebaseHits = value;
          index += 2;
          break;
        }
        case "time": {
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.timeMs = value;
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
          const value = parseIntegerToken(tokens[index + 1]);
          if (value !== undefined) dto.currentMoveNumber = value;
          index += 2;
          break;
        }
        case "score": {
          const scoreKind = tokens[index + 1];
          const scoreValue = parseIntegerToken(tokens[index + 2]);

          if (scoreValue !== undefined) {
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

  function parseBestMoveLineTokens(tokens: string[]): BestMoveLineDto | null {
    if (tokens.length < 2 || tokens[0] !== "bestmove") return null;

    const bestMove = tokens[1];
    if (!bestMove) return null;

    const dto: BestMoveLineDto = { bestMove };

    for (let index = 2; index < tokens.length; index += 1) {
      if (tokens[index] !== "ponder") continue;
      const ponderMove = tokens[index + 1];
      if (ponderMove) dto.ponderMove = ponderMove;
      break;
    }

    return dto;
  }

  function parseIdLineTokens(tokens: string[]): IdLineDto | null {
    if (tokens.length < 3 || tokens[0] !== "id") return null;

    const fieldToken = tokens[1];
    if (fieldToken !== "name" && fieldToken !== "author") return null;

    const value = tokens.slice(2).join(" ").trim();
    if (value.length === 0) return null;

    return {
      field: fieldToken,
      value,
    };
  }

  function parseOptionLineTokens(tokens: string[]): OptionLineDto | null {
    if (tokens.length < 5 || tokens[0] !== "option") return null;

    const nameIndex = indexOfToken(tokens, "name", 1);
    const typeIndex = indexOfToken(tokens, "type", 1);
    if (nameIndex < 0 || typeIndex < 0 || typeIndex <= nameIndex + 1) {
      return null;
    }

    const nameTokens = tokens.slice(nameIndex + 1, typeIndex);
    if (nameTokens.length === 0) return null;

    const optionType = tokens[typeIndex + 1];
    if (!optionType) return null;

    const dto: OptionLineDto = {
      name: nameTokens.join(" "),
      optionType,
    };

    const markers = ["default", "min", "max", "var"];
    let index = typeIndex + 2;

    while (index < tokens.length) {
      const marker = tokens[index];

      if (marker === "default") {
        const segment = readSegment(tokens, index + 1, markers);
        if (segment.value.length > 0) {
          dto.defaultValue = segment.value.join(" ");
        }
        index = segment.nextIndex;
        continue;
      }

      if (marker === "min") {
        const value = parseIntegerToken(tokens[index + 1]);
        if (value !== undefined) dto.min = value;
        index += 2;
        continue;
      }

      if (marker === "max") {
        const value = parseIntegerToken(tokens[index + 1]);
        if (value !== undefined) dto.max = value;
        index += 2;
        continue;
      }

      if (marker === "var") {
        const segment = readSegment(tokens, index + 1, markers);
        if (segment.value.length > 0) {
          if (!dto.variables) dto.variables = [];
          dto.variables.push(segment.value.join(" "));
        }
        index = segment.nextIndex;
        continue;
      }

      index += 1;
    }

    return dto;
  }

  function parseIntegerToken(token: string | undefined): number | undefined {
    if (!token) return undefined;
    const parsed = Number.parseInt(token, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  function indexOfToken(
    tokens: string[],
    token: string,
    startIndex: number,
  ): number {
    for (let index = startIndex; index < tokens.length; index += 1) {
      if (tokens[index] === token) return index;
    }
    return -1;
  }

  function readSegment(
    tokens: string[],
    startIndex: number,
    stopTokens: string[],
  ): { value: string[]; nextIndex: number } {
    const value: string[] = [];
    let index = startIndex;

    while (index < tokens.length) {
      if (stopTokens.includes(tokens[index])) break;
      value.push(tokens[index]);
      index += 1;
    }

    return { value, nextIndex: index };
  }
}
