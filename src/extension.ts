import * as vscode from "vscode";
import { SymbolStore } from "./symbolStore";
import { NetLogoCompletionProvider } from "./providers/completionProvider";
import { NetLogoHoverProvider } from "./providers/hoverProvider";
import { NetLogoDefinitionProvider } from "./providers/definitionProvider";
import { NetLogoReferenceProvider } from "./providers/referenceProvider";
import { NetLogoDocumentSymbolProvider } from "./providers/documentSymbolProvider";
import { NetLogoSignatureHelpProvider } from "./providers/signatureHelpProvider";
import { DiagnosticsManager } from "./diagnostics";

/**
 * `.nlogox` files are XML, so they keep the XML language id and its syntax
 * highlighting. They are matched here by path instead, which gives them
 * completion, hover and navigation inside the <code> block without taking
 * the whole file over.
 */
const NETLOGO_SELECTOR: vscode.DocumentSelector = [
  { language: "netlogo", scheme: "file" },
  { pattern: "**/*.nlogox", scheme: "file" },
  { pattern: "**/*.nlogox3d", scheme: "file" },
];

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const symbolStore = new SymbolStore();
  await symbolStore.initialize();

  for (const doc of vscode.workspace.textDocuments) {
    if (symbolStore.handles(doc)) {
      symbolStore.ensureDocumentParsed(doc);
    }
  }

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      NETLOGO_SELECTOR,
      new NetLogoCompletionProvider(symbolStore)
    ),
    vscode.languages.registerHoverProvider(
      NETLOGO_SELECTOR,
      new NetLogoHoverProvider(symbolStore)
    ),
    vscode.languages.registerDefinitionProvider(
      NETLOGO_SELECTOR,
      new NetLogoDefinitionProvider(symbolStore)
    ),
    vscode.languages.registerReferenceProvider(
      NETLOGO_SELECTOR,
      new NetLogoReferenceProvider(symbolStore)
    ),
    vscode.languages.registerDocumentSymbolProvider(
      NETLOGO_SELECTOR,
      new NetLogoDocumentSymbolProvider(symbolStore)
    ),
    vscode.languages.registerSignatureHelpProvider(
      NETLOGO_SELECTOR,
      new NetLogoSignatureHelpProvider(symbolStore),
      " "
    ),
    symbolStore
  );

  const diagnostics = new DiagnosticsManager(symbolStore);
  diagnostics.activate(context);
  context.subscriptions.push(diagnostics);

  // Re-parse documents on open and on change (for live editing)
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (symbolStore.handles(doc)) {
        symbolStore.ensureDocumentParsed(doc);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (symbolStore.handles(e.document)) {
        symbolStore.parseDocument(e.document);
      }
    })
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables in context.subscriptions
}
