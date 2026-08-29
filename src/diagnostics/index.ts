import * as vscode from "vscode";
import { SymbolStore } from "../symbolStore";
import { runStaticChecks, SOURCE_STATIC } from "./staticChecker";
import {
  cancelRunningCompile,
  compileModel,
  CompilerLocation,
  locateCompiler,
  SOURCE_COMPILER,
} from "./headlessCompiler";
import { normalizeNewlines, offsetToPosition } from "../modelCode";

const STATIC_DEBOUNCE_MS = 250;

export class DiagnosticsManager implements vscode.Disposable {
  private staticCollection: vscode.DiagnosticCollection;
  private compilerCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  private staticTimer: NodeJS.Timeout | undefined;
  private compilerLocation: CompilerLocation | undefined;
  private locationResolved = false;
  private compileInFlight = false;
  private status: vscode.StatusBarItem;

  constructor(private store: SymbolStore) {
    this.staticCollection =
      vscode.languages.createDiagnosticCollection("netlogo");
    this.compilerCollection =
      vscode.languages.createDiagnosticCollection("netlogo-compiler");
    this.status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      0
    );
    this.status.name = "NetLogo compile";

    this.disposables.push(
      this.staticCollection,
      this.compilerCollection,
      this.status
    );
  }

  activate(context: vscode.ExtensionContext): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.store.handles(e.document)) {
          this.scheduleStatic(e.document);
        }
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (this.store.handles(doc)) this.runStatic(doc);
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (!this.store.handles(doc)) return;
        this.runStatic(doc);
        if (this.config().get<boolean>("compile.onSave", true)) {
          void this.runCompile(doc);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.staticCollection.delete(doc.uri);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("netlogo")) {
          this.locationResolved = false;
          for (const doc of vscode.workspace.textDocuments) {
            if (this.store.handles(doc)) this.runStatic(doc);
          }
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("netlogo.compileModel", async () => {
        const doc = vscode.window.activeTextEditor?.document;
        if (!doc || !this.store.handles(doc)) {
          void vscode.window.showInformationMessage(
            "Open a NetLogo file to compile its model."
          );
          return;
        }
        await this.runCompile(doc, { announce: true });
      })
    );

    for (const doc of vscode.workspace.textDocuments) {
      if (this.store.handles(doc)) this.runStatic(doc);
    }
  }

  private config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("netlogo");
  }

  // ---------------- static checks ----------------

  private scheduleStatic(document: vscode.TextDocument): void {
    if (this.staticTimer) clearTimeout(this.staticTimer);
    this.staticTimer = setTimeout(
      () => this.runStatic(document),
      STATIC_DEBOUNCE_MS
    );
  }

  private runStatic(document: vscode.TextDocument): void {
    if (!this.config().get<boolean>("diagnostics.enabled", true)) {
      this.staticCollection.delete(document.uri);
      return;
    }
    this.store.ensureDocumentParsed(document);
    try {
      const diagnostics = runStaticChecks(document, this.store, {
        checkUndefinedNames: this.config().get<boolean>(
          "diagnostics.undefinedNames",
          true
        ),
      });
      this.staticCollection.set(document.uri, diagnostics);
    } catch {
      // A parse hiccup must never break editing.
      this.staticCollection.delete(document.uri);
    }
  }

  // ---------------- headless compile ----------------

  private resolveLocation(): CompilerLocation | undefined {
    if (!this.locationResolved) {
      const configured = this.config().get<string>("compile.netLogoDirectory", "");
      this.compilerLocation = locateCompiler(configured || undefined);
      this.locationResolved = true;
    }
    return this.compilerLocation;
  }

  async runCompile(
    document: vscode.TextDocument,
    opts: { announce?: boolean } = {}
  ): Promise<void> {
    if (!this.config().get<boolean>("compile.enabled", true)) return;
    if (this.compileInFlight) cancelRunningCompile();

    const location = this.resolveLocation();
    if (!location) {
      if (opts.announce) {
        void vscode.window.showWarningMessage(
          "Could not find a NetLogo installation. Set netlogo.compile.netLogoDirectory."
        );
      }
      return;
    }

    const model = this.store.resolveModelFor(document.uri);
    if (!model) {
      if (opts.announce) {
        void vscode.window.showWarningMessage(
          "No .nlogox or .nlogo model found that includes this file."
        );
      }
      return;
    }

    this.compileInFlight = true;
    this.status.text = "$(sync~spin) NetLogo: compiling";
    this.status.show();

    try {
      const timeout = this.config().get<number>("compile.timeoutSeconds", 120);
      const outcome = await compileModel(
        location,
        model.fsPath,
        Math.max(10, timeout) * 1000
      );

      if (outcome.failure) {
        this.status.text = "$(warning) NetLogo: compile failed to run";
        if (opts.announce) {
          void vscode.window.showWarningMessage(
            `NetLogo compile could not run: ${outcome.failure}`
          );
        }
        return;
      }

      await this.applyCompilerDiagnostics(model, outcome.errors);

      if (outcome.errors.length === 0) {
        this.status.text = "$(check) NetLogo: compiles";
        if (opts.announce) {
          void vscode.window.showInformationMessage(
            `${vscode.workspace.asRelativePath(model)} compiles cleanly.`
          );
        }
      } else {
        const n = outcome.errors.length;
        this.status.text = `$(error) NetLogo: ${n} compile error${n === 1 ? "" : "s"}`;
      }
    } finally {
      this.compileInFlight = false;
    }
  }

  /** Map compiler errors onto real files and lines. */
  private async applyCompilerDiagnostics(
    model: vscode.Uri,
    errors: Array<{ message: string; file?: string; offset?: number }>
  ): Promise<void> {
    this.compilerCollection.clear();
    if (!errors.length) return;

    const byFile = new Map<string, vscode.Diagnostic[]>();

    for (const err of errors) {
      // No file named means the error is in the model's own code section.
      const targetUri = err.file ? vscode.Uri.file(err.file) : model;
      const key = targetUri.toString();

      let range = new vscode.Range(0, 0, 0, 1);

      if (err.offset !== undefined) {
        const text = await SymbolStore.readText(targetUri);
        if (text !== undefined) {
          // Offsets are relative to the code section, which for the model
          // starts partway into the file. NetLogo reports positions against
          // LF-normalised text, which readText already returns.
          const codeOffset = this.store.getCodeOffset(targetUri);
          const absolute = codeOffset + err.offset;
          const start = offsetToPosition(text, absolute);
          const end = endOfToken(text, absolute);
          range = new vscode.Range(
            start.line,
            start.character,
            end.line,
            end.character
          );
        }
      }

      const d = new vscode.Diagnostic(
        range,
        err.message,
        vscode.DiagnosticSeverity.Error
      );
      d.source = SOURCE_COMPILER;
      const list = byFile.get(key) ?? [];
      list.push(d);
      byFile.set(key, list);
    }

    for (const [key, diags] of byFile) {
      this.compilerCollection.set(vscode.Uri.parse(key), diags);
    }
  }

  dispose(): void {
    cancelRunningCompile();
    if (this.staticTimer) clearTimeout(this.staticTimer);
    for (const d of this.disposables) d.dispose();
  }
}

/** End position of the identifier starting at `offset`. */
function endOfToken(
  normalizedText: string,
  offset: number
): { line: number; character: number } {
  let i = offset;
  while (i < normalizedText.length && /[a-zA-Z0-9_?!#%:-]/.test(normalizedText[i])) {
    i++;
  }
  if (i === offset) i = Math.min(offset + 1, normalizedText.length);
  return offsetToPosition(normalizedText, i);
}

export { normalizeNewlines, SOURCE_STATIC };
