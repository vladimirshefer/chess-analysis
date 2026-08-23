import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, "openings.csv");
const otherPath = path.join(__dirname, "openings-other.json");
const e4e5Nf3Path = path.join(__dirname, "openings-e4-e5-nf3.json");
const e4e5Path = path.join(__dirname, "openings-e4-e5.json");
const e4c5Path = path.join(__dirname, "openings-e4-c5.json");
const e4OtherPath = path.join(__dirname, "openings-e4-other.json");
const d4d5Path = path.join(__dirname, "openings-d4-d5.json");
const d4OtherPath = path.join(__dirname, "openings-d4-other.json");

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function stripVariations(pgn) {
  let depth = 0;
  let result = "";

  for (let index = 0; index < pgn.length; index += 1) {
    const char = pgn[index];
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) {
      result += char;
    }
  }

  return result;
}

function tryParseMovesWithChess(pgn) {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history();
  } catch {
    return [];
  }
}

function tokenizeSanMoves(pgn) {
  return pgn
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n\r]*/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.(?:\.\.)?/g, " ")
    .replace(/\b(?:1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
    .split(/\s+/)
    .map(function cleanToken(token) {
      return token.replace(/[!?]+/g, "");
    })
    .filter(Boolean);
}

function toMainlineMoves(pgn) {
  const value = pgn.trim();
  if (!value) return [];

  const withoutVariations = stripVariations(value);
  const directMoves = tryParseMovesWithChess(withoutVariations);
  if (directMoves.length > 0) return directMoves;

  const fallbackTokens = tokenizeSanMoves(withoutVariations);
  if (fallbackTokens.length === 0) return [];

  const chess = new Chess();
  const moves = [];
  for (const token of fallbackTokens) {
    try {
      const move = chess.move(token);
      if (!move) break;
      moves.push(move.san);
    } catch {
      break;
    }
  }

  return moves;
}

function getE4Bucket(pgn) {
  if (typeof pgn !== "string") {
    return "other";
  }

  const normalizedPgn = pgn.trim();

  if (normalizedPgn.startsWith("1. e4 e5 2. Nf3")) {
    return "e5-nf3";
  }

  if (normalizedPgn.startsWith("1. e4 e5")) {
    return "e5";
  }

  if (normalizedPgn.startsWith("1. e4 c5")) {
    return "c5";
  }

  return "other";
}

function getD4Bucket(pgn) {
  if (typeof pgn !== "string") {
    return "other";
  }

  const normalizedPgn = pgn.trim();

  if (normalizedPgn.startsWith("1. d4 d5")) {
    return "d5";
  }

  return "other";
}

function toShardEntry(opening) {
  return {
    name: opening.name,
    sanMoves: toMainlineMoves(opening.pgn),
  };
}

function main() {
  const csv = fs.readFileSync(inputPath, "utf8");
  const lines = csv.split(/\r?\n/).filter(Boolean);

  if (lines.length === 0) {
    throw new Error("openings.csv is empty");
  }

  const header = parseCsvLine(lines[0]);
  const nameIndex = header.indexOf("name");
  const pgnIndex = header.indexOf("pgn");
  const epdIndex = header.indexOf("epd");

  if (nameIndex === -1 || pgnIndex === -1 || epdIndex === -1) {
    throw new Error("CSV must contain name, pgn and epd headers");
  }

  const buckets = {
    other: [],
  };
  const e4Buckets = {
    "e5-nf3": [],
    e5: [],
    c5: [],
    other: [],
  };
  const d4Buckets = {
    d5: [],
    other: [],
  };

  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const opening = {
      name: row[nameIndex] ?? "",
      pgn: row[pgnIndex] ?? "",
      epd: row[epdIndex] ?? "",
    };
    const normalizedPgn = opening.pgn.trim();

    if (normalizedPgn.startsWith("1. e4")) {
      e4Buckets[getE4Bucket(normalizedPgn)].push(opening);
      continue;
    }

    if (normalizedPgn.startsWith("1. d4")) {
      d4Buckets[getD4Bucket(normalizedPgn)].push(opening);
      continue;
    }

    buckets.other.push(opening);
  }

  writeJson(otherPath, buckets.other.map(toShardEntry));
  writeJson(e4e5Nf3Path, e4Buckets["e5-nf3"].map(toShardEntry));
  writeJson(e4e5Path, e4Buckets.e5.map(toShardEntry));
  writeJson(e4c5Path, e4Buckets.c5.map(toShardEntry));
  writeJson(e4OtherPath, e4Buckets.other.map(toShardEntry));
  writeJson(d4d5Path, d4Buckets.d5.map(toShardEntry));
  writeJson(d4OtherPath, d4Buckets.other.map(toShardEntry));

  console.log(
    `Wrote e4-e5-nf3=${e4Buckets["e5-nf3"].length}, e4-e5=${e4Buckets.e5.length}, e4-c5=${e4Buckets.c5.length}, e4-other=${e4Buckets.other.length}, d4-d5=${d4Buckets.d5.length}, d4-other=${d4Buckets.other.length}, other=${buckets.other.length}`,
  );
}

main();
