import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  writeJson(otherPath, buckets.other);
  writeJson(e4e5Nf3Path, e4Buckets["e5-nf3"]);
  writeJson(e4e5Path, e4Buckets.e5);
  writeJson(e4c5Path, e4Buckets.c5);
  writeJson(e4OtherPath, e4Buckets.other);
  writeJson(d4d5Path, d4Buckets.d5);
  writeJson(d4OtherPath, d4Buckets.other);

  console.log(
    `Wrote e4-e5-nf3=${e4Buckets["e5-nf3"].length}, e4-e5=${e4Buckets.e5.length}, e4-c5=${e4Buckets.c5.length}, e4-other=${e4Buckets.other.length}, d4-d5=${d4Buckets.d5.length}, d4-other=${d4Buckets.other.length}, other=${buckets.other.length}`,
  );
}

main();
