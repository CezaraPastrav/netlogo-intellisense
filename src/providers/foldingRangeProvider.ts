import * as vscode from "vscode";
import { extractModelCode, modelKindForPath } from "../modelCode";
import { findEndLine, stripComment } from "../parser";

/**
 * Folding for NetLogo.
 *
 * Registering a folding provider replaces VS Code's indentation-based folding
 * for the language, so this has to cover everything indentation used to give -
 * procedures and bracket blocks - as well as the explicit region markers.
 *
 * Four kinds of range are produced:
 *
 *   `;#region Name` ... `;#endregion`   nestable, named, folds as a Region
 *   `to` / `to-report` ... `end`        one range per procedure
 *   `[` ... `]` spanning lines          `globals`, `ask ... [`, `if ... [`
 *   runs of two or more comment lines   folds as a Comment
 */

/** `;#region Name`, with any number of leading semicolons and optional spaces. */
const REGION_START = /^\s*;+\s*#region\b/i;
const REGION_END = /^\s*;+\s*#endregion\b/i;
const PROCEDURE = /^to(?:-report)?\b/i;

type AddRange = (
  start: number,
  end: number,
  kind?: vscode.FoldingRangeKind
) => void;

export class NetLogoFoldingRangeProvider
  implements vscode.FoldingRangeProvider
{
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const kind = modelKindForPath(document.uri.fsPath);
    const extracted = kind
      ? extractModelCode(document.getText(), kind)
      : undefined;

    // In a .nlogo the widget section is not NetLogo code, and in a .nlogox the
    // surrounding XML folds through its own provider, so only fold the code.
    const code = extracted
      ? extracted.code
      : document.getText().replace(/\r\n/g, "\n");
    const lineOffset = extracted ? extracted.line : 0;
    const lines = code.split("\n");

    // One range per start line: VS Code keeps only one anyway, so prefer the
    // outermost. Regions are collected first and win ties.
    const ranges = new Map<number, vscode.FoldingRange>();
    const add: AddRange = (start, end, foldKind) => {
      if (end <= start) return;
      const range = new vscode.FoldingRange(
        start + lineOffset,
        end + lineOffset,
        foldKind
      );
      const existing = ranges.get(range.start);
      if (!existing || existing.end < range.end) {
        ranges.set(range.start, range);
      }
    };

    collectRegions(lines, add);
    collectProcedures(lines, add);
    collectBracketBlocks(lines, add);
    collectCommentBlocks(lines, add);

    return [...ranges.values()];
  }
}

/**
 * Match `;#region` markers with a stack, so regions can nest.
 *
 * An unmatched `;#region` folds nothing, the same as in every other language.
 */
function collectRegions(lines: string[], add: AddRange): void {
  const open: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (REGION_START.test(lines[i])) {
      open.push(i);
    } else if (REGION_END.test(lines[i])) {
      const start = open.pop();
      if (start !== undefined) {
        add(start, i, vscode.FoldingRangeKind.Region);
      }
    }
  }
}

function collectProcedures(lines: string[], add: AddRange): void {
  for (let i = 0; i < lines.length; i++) {
    if (!PROCEDURE.test(stripComment(lines[i]).trim())) continue;
    const end = findEndLine(lines, i);
    add(i, end);
    i = Math.max(i, end);
  }
}

/** Every `[` that is not closed on its own line, up to its matching `]`. */
function collectBracketBlocks(lines: string[], add: AddRange): void {
  const open: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const code = stripStrings(stripComment(lines[i]));
    for (const character of code) {
      if (character === "[") {
        open.push(i);
      } else if (character === "]") {
        const start = open.pop();
        if (start !== undefined) {
          add(start, i);
        }
      }
    }
  }
}

/** Runs of two or more comment lines, so long headers can be collapsed. */
function collectCommentBlocks(lines: string[], add: AddRange): void {
  let start = -1;
  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i].trim() : "";
    const isComment =
      i < lines.length &&
      line.startsWith(";") &&
      !REGION_START.test(line) &&
      !REGION_END.test(line);

    if (isComment) {
      if (start < 0) start = i;
    } else {
      if (start >= 0) {
        add(start, i - 1, vscode.FoldingRangeKind.Comment);
      }
      start = -1;
    }
  }
}

/** Blank out string literals so brackets inside them are not counted. */
function stripStrings(line: string): string {
  let result = "";
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inString = !inString;
      result += " ";
    } else {
      result += inString ? " " : character;
    }
  }
  return result;
}
