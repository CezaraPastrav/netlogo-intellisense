import * as vscode from "vscode";
import { SymbolStore } from "../symbolStore";
import { ALL_BUILTINS } from "../builtins";
import { DICT_ENTRIES } from "../dictionary";
import { stripComment } from "../parser";

export const SOURCE_STATIC = "netlogo";

/** Names that are always legal but are not primitives or user symbols. */
const ALWAYS_KNOWN = new Set<string>([
  // anonymous procedure arguments
  "?", "?1", "?2", "?3", "?4", "?5", "?6", "?7", "?8",
  // structural keywords the parser consumes rather than reports
  "to", "to-report", "end", "globals", "breed", "extensions", "__includes",
  "turtles-own", "patches-own", "links-own",
  "directed-link-breed", "undirected-link-breed",
  // built-in agent variables
  "who", "color", "heading", "xcor", "ycor", "shape", "label", "label-color",
  "breed", "hidden?", "size", "pen-size", "pen-mode",
  "pxcor", "pycor", "pcolor", "plabel", "plabel-color",
  "end1", "end2", "thickness", "tie-mode",
]);

const BUILTIN_NAMES = new Set<string>([
  ...ALL_BUILTINS.map((b) => b.name.toLowerCase()),
  ...DICT_ENTRIES.map((d) => d.name.toLowerCase()),
]);

export interface StaticCheckOptions {
  checkUndefinedNames: boolean;
}

/**
 * Fast, parser-only checks that can run on every keystroke.
 *
 * Deliberately excludes argument-count checking: getting that right needs the
 * arity of every reporter in the expression, and guessing produces noise. The
 * headless compiler reports arity errors correctly, so that check lives there.
 */
export function runStaticChecks(
  document: vscode.TextDocument,
  store: SymbolStore,
  options: StaticCheckOptions
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const code = store.getCode(document.uri);
  if (code === undefined) return diagnostics;

  // The extracted code may start partway into the file (.nlogox), so work out
  // how many lines to add to map back onto the document.
  const lineOffset = lineOfOffset(document.getText(), store.getCodeOffset(document.uri));

  checkBrackets(code, lineOffset, diagnostics);
  // Only claim a duplicate when we actually know the file's scope. For an
  // .nls no model includes, the scope is a guess that may pull in two
  // alternative implementations that are never loaded together.
  if (store.hasOwningModel(document.uri)) {
    checkDuplicateProcedures(document, store, diagnostics);
  }
  if (options.checkUndefinedNames) {
    checkUndefinedNames(document, store, code, lineOffset, diagnostics);
  }
  return diagnostics;
}

function lineOfOffset(text: string, offset: number): number {
  let line = 0;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function checkBrackets(
  code: string,
  lineOffset: number,
  out: vscode.Diagnostic[]
): void {
  const stack: Array<{ char: string; line: number; col: number }> = [];
  const lines = code.split("\n");

  for (let l = 0; l < lines.length; l++) {
    const line = stripComment(lines[l]);
    let inString = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === "[" || ch === "(") {
        stack.push({ char: ch, line: l, col: c });
      } else if (ch === "]" || ch === ")") {
        const expected = ch === "]" ? "[" : "(";
        const top = stack.pop();
        if (!top) {
          out.push(
            diag(
              new vscode.Range(l + lineOffset, c, l + lineOffset, c + 1),
              `Unmatched closing '${ch}'.`,
              vscode.DiagnosticSeverity.Error
            )
          );
        } else if (top.char !== expected) {
          out.push(
            diag(
              new vscode.Range(l + lineOffset, c, l + lineOffset, c + 1),
              `Mismatched '${ch}' - '${top.char}' opened at line ${
                top.line + lineOffset + 1
              } is still open.`,
              vscode.DiagnosticSeverity.Error
            )
          );
        }
      }
    }
  }

  for (const open of stack) {
    out.push(
      diag(
        new vscode.Range(
          open.line + lineOffset,
          open.col,
          open.line + lineOffset,
          open.col + 1
        ),
        `Unclosed '${open.char}'.`,
        vscode.DiagnosticSeverity.Error
      )
    );
  }
}

function checkDuplicateProcedures(
  document: vscode.TextDocument,
  store: SymbolStore,
  out: vscode.Diagnostic[]
): void {
  const byName = new Map<string, Array<{ uri: string; line: number }>>();
  for (const sym of store.getVisibleSymbols(document.uri)) {
    if (sym.kind !== "procedure" && sym.kind !== "reporter") continue;
    const key = sym.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push({
      uri: sym.location.uri.toString(),
      line: sym.location.range.start.line,
    });
    byName.set(key, list);
  }

  const docKey = document.uri.toString();
  for (const [name, defs] of byName) {
    if (defs.length < 2) continue;
    for (const def of defs) {
      if (def.uri !== docKey) continue;
      const others = defs.filter((d) => d !== def);
      const where = others
        .map((d) => `${shortName(d.uri)}:${d.line + 1}`)
        .join(", ");
      const lineText = document.lineAt(
        Math.min(def.line, document.lineCount - 1)
      ).text;
      const col = Math.max(0, lineText.toLowerCase().indexOf(name));
      out.push(
        diag(
          new vscode.Range(def.line, col, def.line, col + name.length),
          `Procedure '${name}' is defined more than once (also at ${where}).`,
          vscode.DiagnosticSeverity.Error
        )
      );
    }
  }
}

function shortName(uriString: string): string {
  return uriString.split("/").pop() ?? uriString;
}

function checkUndefinedNames(
  document: vscode.TextDocument,
  store: SymbolStore,
  code: string,
  lineOffset: number,
  out: vscode.Diagnostic[]
): void {
  const known = new Set<string>(BUILTIN_NAMES);
  for (const n of ALWAYS_KNOWN) known.add(n);

  for (const sym of store.getVisibleSymbols(document.uri)) {
    known.add(sym.name.toLowerCase());
    if (sym.extra) known.add(sym.extra.toLowerCase());
    for (const local of sym.locals ?? []) known.add(local.name.toLowerCase());
  }
  for (const g of store.getGeneratedPrimitives(document.uri)) {
    known.add(g.name.toLowerCase());
  }
  for (const e of store.getExtensionPrimitives(document.uri)) {
    known.add(e.name.toLowerCase());
  }

  const lines = code.split("\n");
  for (let l = 0; l < lines.length; l++) {
    const line = stripComment(lines[l]);

    // Skip declaration blocks - their contents are names being introduced.
    if (/^\s*(globals|extensions|__includes|breed|[\w-]+-own|directed-link-breed|undirected-link-breed)\b/i.test(line)) {
      continue;
    }

    const withoutStrings = line.replace(/"[^"]*"/g, (m) => " ".repeat(m.length));
    const re = /[a-zA-Z_#][a-zA-Z0-9_?!#%-]*(?::[a-zA-Z0-9_?!#%-]+)?/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(withoutStrings)) !== null) {
      const word = m[0];
      const lower = word.toLowerCase();

      if (known.has(lower)) continue;
      // Unknown extension prefix - we have no catalog, so stay quiet.
      if (word.includes(":")) continue;
      // Numbers and things that merely start with a digit-ish char.
      if (/^\d/.test(word)) continue;
      // `let`/`set` targets and procedure headers introduce names.
      const before = withoutStrings.slice(0, m.index);
      if (/\b(let|set|to|to-report)\s+$/i.test(before)) continue;

      out.push(
        diag(
          new vscode.Range(
            l + lineOffset,
            m.index,
            l + lineOffset,
            m.index + word.length
          ),
          `Nothing named '${word}' has been defined.`,
          vscode.DiagnosticSeverity.Warning
        )
      );
    }
  }
}

function diag(
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
  const d = new vscode.Diagnostic(range, message, severity);
  d.source = SOURCE_STATIC;
  return d;
}
