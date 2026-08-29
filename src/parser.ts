import * as vscode from "vscode";

/** The kinds of symbol a NetLogo source file can declare. */
export type NetLogoSymbolKind =
  | "procedure"
  | "reporter"
  | "global"
  | "breed"
  | "link-breed"
  | "turtles-own"
  | "patches-own"
  | "links-own"
  | "breed-own";

export interface NetLogoSymbol {
  name: string;
  kind: NetLogoSymbolKind;
  parameters: string[];
  location: vscode.Location;
  documentation: string;
  /** Breed singular form, or the owning agent type for `*-own` variables. */
  extra?: string;
  /** For procedures/reporters: the line holding the closing `end`. */
  endLine?: number;
  /** For procedures/reporters: `let` variables declared in the body. */
  locals?: LocalVariable[];
}

export interface LocalVariable {
  name: string;
  /** Line the variable is declared on (a parameter uses the header line). */
  line: number;
  source: "parameter" | "let" | "lambda";
}

export interface ParseResult {
  symbols: NetLogoSymbol[];
  includes: string[];
  /** Names from the `extensions [ ... ]` declaration. */
  extensions: string[];
}

/**
 * Parse NetLogo source and extract all symbols.
 *
 * `lineOffset` shifts every reported line, so code extracted from a container
 * (the <code> block of a .nlogox) still points at real lines in the file.
 */
export function parseNetLogoSource(
  text: string,
  uri: vscode.Uri,
  lineOffset = 0
): ParseResult {
  const symbols: NetLogoSymbol[] = [];
  const includes: string[] = [];
  const extensions: string[] = [];
  const lines = text.split(/\r?\n/);

  const loc = (line: number) =>
    new vscode.Location(uri, new vscode.Position(line + lineOffset, 0));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match against the code only; a trailing comment must not hide the
    // opening bracket of a declaration block.
    const trimmed = stripComment(line).trim();

    // Skip pure comment lines for matching (but we collect them as docs)
    if (line.trim().startsWith(";")) {
      continue;
    }

    // __includes ["file1.nls" "file2.nls"]
    if (/^__includes\b/i.test(trimmed)) {
      const block = extractBracketBlock(lines, i);
      for (const fm of block.content.matchAll(/"([^"]+)"/g)) {
        includes.push(fm[1]);
      }
      continue;
    }

    // extensions [table csv profiler]
    if (/^extensions\s*(\[|$)/i.test(trimmed)) {
      const block = extractBracketBlock(lines, i);
      for (const v of parseIdentifierList(block.content)) {
        extensions.push(v.name);
      }
      continue;
    }

    // to <name> [param1 param2 ...]
    const procMatch = trimmed.match(/^to\s+([\w\-?!#%]+)(?:\s*\[([^\]]*)\])?/i);
    if (procMatch && !/^to-report/i.test(trimmed)) {
      symbols.push(
        buildProcedure(procMatch, "procedure", lines, i, loc, lineOffset)
      );
      continue;
    }

    // to-report <name> [param1 param2 ...]
    const reporterMatch = trimmed.match(
      /^to-report\s+([\w\-?!#%]+)(?:\s*\[([^\]]*)\])?/i
    );
    if (reporterMatch) {
      symbols.push(
        buildProcedure(reporterMatch, "reporter", lines, i, loc, lineOffset)
      );
      continue;
    }

    // globals [var1 var2 ...]
    if (/^globals\s*(\[|$)/i.test(trimmed)) {
      const block = extractBracketBlock(lines, i);
      for (const v of parseIdentifierList(block.content)) {
        symbols.push({
          name: v.name,
          kind: "global",
          parameters: [],
          location: loc(v.line + block.bracketLine),
          documentation: "",
        });
      }
      continue;
    }

    // breed [plural singular]
    const breedMatch = trimmed.match(
      /^breed\s*\[\s*([\w\-?!#%]+)\s+([\w\-?!#%]+)\s*\]/i
    );
    if (breedMatch) {
      symbols.push({
        name: breedMatch[1],
        kind: "breed",
        parameters: [],
        location: loc(i),
        documentation: collectDocComment(lines, i),
        extra: breedMatch[2], // singular form
      });
      continue;
    }

    // directed-link-breed [plural singular]
    const linkBreedMatch = trimmed.match(
      /^(?:directed-link-breed|undirected-link-breed)\s*\[\s*([\w\-?!#%]+)\s+([\w\-?!#%]+)\s*\]/i
    );
    if (linkBreedMatch) {
      symbols.push({
        name: linkBreedMatch[1],
        kind: "link-breed",
        parameters: [],
        location: loc(i),
        documentation: collectDocComment(lines, i),
        extra: linkBreedMatch[2],
      });
      continue;
    }

    // turtles-own / patches-own / links-own [var1 var2 ...]
    const ownMatch = trimmed.match(/^(turtles|patches|links)-own\s*(\[|$)/i);
    if (ownMatch) {
      const owner = ownMatch[1].toLowerCase();
      parseOwnBlock(
        lines,
        i,
        `${owner}-own` as NetLogoSymbolKind,
        owner,
        symbols,
        loc
      );
      continue;
    }

    // <breed>-own [var1 var2 ...]
    const breedOwnMatch = trimmed.match(/^([\w\-]+)-own\s*(\[|$)/i);
    if (breedOwnMatch) {
      parseOwnBlock(lines, i, "breed-own", breedOwnMatch[1], symbols, loc);
      continue;
    }
  }

  return { symbols, includes, extensions };
}

function buildProcedure(
  match: RegExpMatchArray,
  kind: "procedure" | "reporter",
  lines: string[],
  headerLine: number,
  loc: (line: number) => vscode.Location,
  lineOffset: number
): NetLogoSymbol {
  const name = match[1];
  const parameters = match[2] ? match[2].trim().split(/\s+/).filter(Boolean) : [];
  const endLine = findEndLine(lines, headerLine);

  const locals: LocalVariable[] = parameters.map((p) => ({
    name: p,
    line: headerLine + lineOffset,
    source: "parameter" as const,
  }));
  for (const l of collectLocals(lines, headerLine, endLine)) {
    locals.push({ name: l.name, line: l.line + lineOffset, source: l.source });
  }

  return {
    name,
    kind,
    parameters,
    location: loc(headerLine),
    documentation: collectDocComment(lines, headerLine),
    endLine: endLine + lineOffset,
    locals,
  };
}

/** Find the line holding the `end` that closes a procedure starting at `startLine`. */
export function findEndLine(lines: string[], startLine: number): number {
  for (let i = startLine + 1; i < lines.length; i++) {
    const trimmed = stripComment(lines[i]).trim();
    if (/^end\b/i.test(trimmed)) {
      return i;
    }
  }
  return lines.length - 1;
}

/**
 * Collect names bound inside a procedure body: `let` declarations and the
 * arguments of anonymous procedures (`[ x -> ... ]`, `[ [x y] -> ... ]`).
 */
function collectLocals(
  lines: string[],
  startLine: number,
  endLine: number
): Array<{ name: string; line: number; source: "let" | "lambda" }> {
  const found: Array<{ name: string; line: number; source: "let" | "lambda" }> =
    [];
  for (let i = startLine; i <= endLine && i < lines.length; i++) {
    const code = stripComment(lines[i]);

    for (const m of code.matchAll(/\blet\s+([a-zA-Z_#][\w\-?!#%]*)/gi)) {
      found.push({ name: m[1], line: i, source: "let" });
    }

    // `[ [x y] -> ... ]` - an explicitly bracketed argument list.
    for (const m of code.matchAll(/\[\s*\[([^\]]*)\]\s*->/g)) {
      for (const name of m[1].trim().split(/\s+/).filter(Boolean)) {
        if (/^[a-zA-Z_#][\w\-?!#%]*$/.test(name)) {
          found.push({ name, line: i, source: "lambda" });
        }
      }
    }

    // `[ x -> ... ]` and `[ x y -> ... ]` - bare argument list.
    for (const m of code.matchAll(
      /\[\s*((?:[a-zA-Z_#][\w\-?!#%]*\s+)*[a-zA-Z_#][\w\-?!#%]*)\s*->/g
    )) {
      for (const name of m[1].trim().split(/\s+/).filter(Boolean)) {
        if (/^[a-zA-Z_#][\w\-?!#%]*$/.test(name)) {
          found.push({ name, line: i, source: "lambda" });
        }
      }
    }
  }
  return found;
}

function parseOwnBlock(
  lines: string[],
  startLine: number,
  kind: NetLogoSymbolKind,
  owner: string,
  symbols: NetLogoSymbol[],
  loc: (line: number) => vscode.Location
): void {
  const block = extractBracketBlock(lines, startLine);
  for (const v of parseIdentifierList(block.content)) {
    symbols.push({
      name: v.name,
      kind,
      parameters: [],
      location: loc(v.line + block.bracketLine),
      documentation: "",
      extra: owner,
    });
  }
}

/** Remove a trailing `;` comment, respecting string literals. */
export function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inString = !inString;
    } else if (c === ";" && !inString) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Collect comment lines immediately preceding a definition line.
 */
function collectDocComment(lines: string[], defLine: number): string {
  const commentLines: string[] = [];
  let j = defLine - 1;
  while (j >= 0) {
    const trimmed = lines[j].trim();
    if (trimmed.startsWith(";")) {
      commentLines.unshift(trimmed.replace(/^;+\s?/, ""));
      j--;
    } else if (trimmed === "") {
      // Allow one blank line within comment block
      if (j > 0 && lines[j - 1].trim().startsWith(";")) {
        commentLines.unshift("");
        j--;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return commentLines.join("\n").trim();
}

interface BracketBlock {
  content: string;
  /**
   * Line the opening `[` was found on. NetLogo permits it on a line of its
   * own, so this is not always the line the keyword is on, and identifier
   * line numbers must be measured from here.
   */
  bracketLine: number;
}

/**
 * Extract the content inside a bracket block at or after the given line.
 */
function extractBracketBlock(
  lines: string[],
  startLine: number
): BracketBlock {
  let depth = 0;
  let content = "";
  let started = false;
  let bracketLine = startLine;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      if (line[c] === ";") break; // rest of line is comment
      if (line[c] === "[") {
        if (started) {
          content += line[c];
        } else {
          bracketLine = i;
        }
        depth++;
        started = true;
      } else if (line[c] === "]") {
        depth--;
        if (depth === 0) {
          return { content, bracketLine };
        }
        content += line[c];
      } else if (started) {
        content += line[c];
      }
    }
    if (started) {
      content += "\n";
    }
  }
  return { content, bracketLine };
}

/**
 * Parse a whitespace-separated list of identifiers from bracket block content.
 */
function parseIdentifierList(
  content: string
): Array<{ name: string; line: number }> {
  const result: Array<{ name: string; line: number }> = [];
  const lines = content.split("\n");
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    // Remove comments
    const line = lines[lineIdx].replace(/;.*$/, "").trim();
    const tokens = line.split(/\s+/).filter((t) => t.length > 0);
    for (const token of tokens) {
      // Skip nested brackets content
      if (token.includes("[") || token.includes("]")) continue;
      result.push({ name: token, line: lineIdx });
    }
  }
  return result;
}
