import * as vscode from "vscode";
import { SymbolStore } from "../symbolStore";

export class NetLogoDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  constructor(private symbolStore: SymbolStore) {}

  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.DocumentSymbol[] {
    this.symbolStore.ensureDocumentParsed(document);

    const symbols: vscode.DocumentSymbol[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    // Collect globals, own-variables, breeds into container groups
    const globals: vscode.DocumentSymbol[] = [];
    const breeds: vscode.DocumentSymbol[] = [];
    const ownGroups = new Map<string, vscode.DocumentSymbol[]>();

    const fileSymbols = this.symbolStore.getSymbolsForFile(document.uri);

    // Only include symbols from this file
    const localSymbols = fileSymbols.filter(
      (s) => s.location.uri.toString() === document.uri.toString()
    );

    for (const sym of localSymbols) {
      const startLine = sym.location.range.start.line;

      switch (sym.kind) {
        case "procedure":
        case "reporter": {
          const endLine = this.findEndLine(lines, startLine);
          const range = new vscode.Range(
            startLine,
            0,
            endLine,
            lines[endLine]?.length ?? 0
          );
          const selRange = new vscode.Range(
            startLine,
            0,
            startLine,
            lines[startLine]?.length ?? 0
          );
          const detail =
            sym.parameters.length > 0 ? `[${sym.parameters.join(" ")}]` : "";
          const kind =
            sym.kind === "reporter"
              ? vscode.SymbolKind.Function
              : vscode.SymbolKind.Method;
          const ds = new vscode.DocumentSymbol(
            sym.name,
            detail,
            kind,
            range,
            selRange
          );
          symbols.push(ds);
          break;
        }
        case "global": {
          const range = new vscode.Range(
            startLine,
            0,
            startLine,
            sym.name.length
          );
          const ds = new vscode.DocumentSymbol(
            sym.name,
            "global",
            vscode.SymbolKind.Variable,
            range,
            range
          );
          globals.push(ds);
          break;
        }
        case "breed":
        case "link-breed": {
          const lineLen = lines[startLine]?.length ?? 0;
          const range = new vscode.Range(startLine, 0, startLine, lineLen);
          const detail = sym.extra ? `singular: ${sym.extra}` : "";
          const ds = new vscode.DocumentSymbol(
            sym.name,
            detail,
            vscode.SymbolKind.Class,
            range,
            range
          );
          breeds.push(ds);
          break;
        }
        case "turtles-own":
        case "patches-own":
        case "links-own":
        case "breed-own": {
          const owner = sym.extra ?? sym.kind;
          const groupKey = `${owner}-own`;
          if (!ownGroups.has(groupKey)) {
            ownGroups.set(groupKey, []);
          }
          const range = new vscode.Range(
            startLine,
            0,
            startLine,
            sym.name.length
          );
          const ds = new vscode.DocumentSymbol(
            sym.name,
            groupKey,
            vscode.SymbolKind.Property,
            range,
            range
          );
          ownGroups.get(groupKey)!.push(ds);
          break;
        }
      }
    }

    // Add globals as a container if there are any
    if (globals.length > 0) {
      const firstLine = globals[0].range.start.line;
      const lastLine = globals[globals.length - 1].range.end.line;
      const container = new vscode.DocumentSymbol(
        "globals",
        `${globals.length} variables`,
        vscode.SymbolKind.Namespace,
        new vscode.Range(firstLine, 0, lastLine, 0),
        new vscode.Range(firstLine, 0, firstLine, "globals".length)
      );
      container.children = globals;
      symbols.push(container);
    }

    // Add breeds
    for (const b of breeds) {
      symbols.push(b);
    }

    // Add own-variable groups
    for (const [groupKey, vars] of ownGroups) {
      const firstLine = vars[0].range.start.line;
      const lastLine = vars[vars.length - 1].range.end.line;
      const container = new vscode.DocumentSymbol(
        groupKey,
        `${vars.length} variables`,
        vscode.SymbolKind.Namespace,
        new vscode.Range(firstLine, 0, lastLine, 0),
        new vscode.Range(firstLine, 0, firstLine, groupKey.length)
      );
      container.children = vars;
      symbols.push(container);
    }

    // Sort by line number
    symbols.sort((a, b) => a.range.start.line - b.range.start.line);

    return symbols;
  }

  /**
   * Find the line containing `end` that closes a `to`/`to-report` block.
   */
  private findEndLine(lines: string[], startLine: number): number {
    for (let i = startLine + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      // Skip comments
      if (trimmed.startsWith(";")) continue;
      // `end` on its own line (case-insensitive)
      if (/^end\b/i.test(trimmed)) {
        return i;
      }
    }
    // If no `end` found, return last line of file
    return lines.length - 1;
  }
}
