import * as vscode from "vscode";
import { SymbolStore } from "../symbolStore";

export class NetLogoDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private symbolStore: SymbolStore) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    this.symbolStore.ensureDocumentParsed(document);

    const wordRange = document.getWordRangeAtPosition(
      position,
      /[a-zA-Z_#][a-zA-Z0-9_?!#%:-]*/
    );
    if (!wordRange) return undefined;

    const word = document.getText(wordRange);

    // Search everything the file can see: its own include chain, plus the
    // model that includes it.
    const symbols = this.symbolStore.getVisibleSymbols(document.uri);
    const symbol = symbols.find(
      (s) => s.name.toLowerCase() === word.toLowerCase()
    );
    if (symbol) {
      return symbol.location;
    }

    // Fallback: search all workspace files
    const globalSymbol = this.symbolStore.findSymbolByName(word);
    if (globalSymbol) {
      return globalSymbol.location;
    }

    return undefined;
  }
}
