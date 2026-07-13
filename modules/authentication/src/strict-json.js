import { authenticationError } from "./security-utils.js";

const NUMBER_PATTERN = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

function scanJson(source, { maximumDepth, maximumKeys }) {
  let cursor = 0;
  let keyCount = 0;

  function fail() {
    throw authenticationError("invalid_compact_jwt", "JWT JSON is invalid");
  }

  function whitespace() {
    while (/[\t\n\r ]/.test(source[cursor] ?? "")) cursor += 1;
  }

  function stringToken() {
    if (source[cursor] !== '"') fail();
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '"') {
        cursor += 1;
        const raw = source.slice(start, cursor);
        try {
          return JSON.parse(raw);
        } catch {
          fail();
        }
      }
      if (character === "\\") {
        cursor += 1;
        const escape = source[cursor];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(cursor + 1, cursor + 5))) fail();
          cursor += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escape)) fail();
        cursor += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail();
      cursor += 1;
    }
    fail();
  }

  function value(depth) {
    if (depth > maximumDepth) fail();
    whitespace();
    const character = source[cursor];
    if (character === "{") return object(depth + 1);
    if (character === "[") return array(depth + 1);
    if (character === '"') return void stringToken();
    for (const literal of ["true", "false", "null"]) {
      if (source.startsWith(literal, cursor)) {
        cursor += literal.length;
        return;
      }
    }
    NUMBER_PATTERN.lastIndex = cursor;
    const match = NUMBER_PATTERN.exec(source);
    if (!match) fail();
    cursor = NUMBER_PATTERN.lastIndex;
  }

  function object(depth) {
    cursor += 1;
    whitespace();
    const keys = new Set();
    if (source[cursor] === "}") {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      whitespace();
      const key = stringToken();
      keyCount += 1;
      if (keyCount > maximumKeys || keys.has(key)) fail();
      keys.add(key);
      whitespace();
      if (source[cursor] !== ":") fail();
      cursor += 1;
      value(depth);
      whitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") fail();
      cursor += 1;
    }
    fail();
  }

  function array(depth) {
    cursor += 1;
    whitespace();
    if (source[cursor] === "]") {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      value(depth);
      whitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") fail();
      cursor += 1;
    }
    fail();
  }

  whitespace();
  value(0);
  whitespace();
  if (cursor !== source.length) fail();
}
export function parseStrictJson(source, { maximumBytes = 16_384, maximumDepth = 12, maximumKeys = 128 } = {}) {
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > maximumBytes) {
    throw authenticationError("invalid_compact_jwt", "JWT JSON is invalid");
  }
  scanJson(source, { maximumDepth, maximumKeys });
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw authenticationError("invalid_compact_jwt", "JWT JSON is invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw authenticationError("invalid_compact_jwt", "JWT JSON must be an object");
  }
  return parsed;
}
