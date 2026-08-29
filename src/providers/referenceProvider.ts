import * as vscode from "vscode";
import { SymbolStore, NETLOGO_GLOB } from "../symbolStore";

export class NetLogoReferenceProvider implements vscode.ReferenceProvider {
  constructor(private symbolStore: SymbolStore) {}

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext
  ): Promise<vscode.Location[]> {
    this.symbolStore.ensureDocumentParsed(document);

    const wordRange = document.getWordRangeAtPosition(
      position,
      /[a-zA-Z_#][a-zA-Z0-9_?!#%-]*/
    );
    if (!wordRange) return [];

    const word = document.getText(wordRange);
    const wordLower = word.toLowerCase();
    const locations: vscode.Location[] = [];

    // If requested, include the definition itself
    if (context.includeDeclaration) {
      const symbol =
        this.symbolStore
          .getVisibleSymbols(document.uri)
          .find((s) => s.name.toLowerCase() === wordLower) ??
        this.symbolStore.findSymbolByName(word);
      if (symbol) {
        locations.push(symbol.location);
      }
    }

    // Search all NetLogo files in the workspace for references
    const files = await vscode.workspace.findFiles(
      NETLOGO_GLOB,
      "**/node_modules/**"
    );

    // Build a regex that matches the word as a whole NetLogo identifier
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?<![a-zA-Z0-9_?!#%-])${escaped}(?![a-zA-Z0-9_?!#%-])`,
      "gi"
    );

    for (const fileUri of files) {
      let text: string;

      // Use in-memory content for open documents
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === fileUri.toString()
      );
      if (openDoc) {
        text = openDoc.getText();
      } else {
        try {
          const bytes = await vscode.workspace.fs.readFile(fileUri);
          text = Buffer.from(bytes).toString("utf8");
        } catch {
          continue;
        }
      }

      const lines = text.split(/\r?\n/);
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];

        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith(";")) continue;

        // Strip inline comments before searching
        const commentStart = line.indexOf(";");
        const searchable =
          commentStart >= 0 ? line.substring(0, commentStart) : line;

        // Strip string literals to avoid false matches
        const noStrings = searchable.replace(/"[^"]*"/g, (m) =>
          " ".repeat(m.length)
        );

        let match: RegExpExecArray | null;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(noStrings)) !== null) {
          const col = match.index;
          const pos = new vscode.Position(lineIdx, col);

          // Skip if this is the declaration and we already included it
          if (context.includeDeclaration) {
            const isDuplicate = locations.some(
              (loc) =>
                loc.uri.toString() === fileUri.toString() &&
                loc.range.start.line === lineIdx &&
                loc.range.start.character === col
            );
            if (isDuplicate) continue;
          }

          locations.push(
            new vscode.Location(
              fileUri,
              new vscode.Range(
                pos,
                new vscode.Position(lineIdx, col + word.length)
              )
            )
          );
        }
      }
    }

    return locations;
  }
}
