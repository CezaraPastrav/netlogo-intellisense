import * as vscode from "vscode";
import * as path from "path";
import { parseNetLogoSource, NetLogoSymbol, ParseResult } from "./parser";
import {
  extractModelCode,
  modelKindForPath,
  ModelKind,
  normalizeNewlines,
} from "./modelCode";
import { BreedInfo, breedsFromSymbols } from "./agentContext";
import { generateBreedPrimitives, GeneratedPrimitive } from "./breeds";
import { ExtensionPrimitive, primitivesForExtensions } from "./extensionPrims";
import { widgetGlobalsFromNlogo, widgetGlobalsFromNlogox } from "./widgets";

/** Glob covering every NetLogo source container we understand. */
export const NETLOGO_GLOB = "**/*.{nlogo,nlogox,nlogo3d,nlogox3d,nls}";

interface FileEntry extends ParseResult {
  kind: ModelKind;
  /** Offset of the code section within LF-normalised file text. */
  codeOffset: number;
  /** The extracted NetLogo code. */
  code: string;
}

/**
 * Manages parsed symbols across all NetLogo files in the workspace.
 * Re-parses files on save/change and resolves __includes.
 */
export class SymbolStore implements vscode.Disposable {
  /** file URI string -> parsed entry */
  private files = new Map<string, FileEntry>();
  private disposables: vscode.Disposable[] = [];
  /** Derived caches; cleared whenever any file is re-parsed. */
  private visibleCache = new Map<string, NetLogoSymbol[]>();
  private modelCache = new Map<string, vscode.Uri | undefined>();

  async initialize(): Promise<void> {
    const found = await vscode.workspace.findFiles(
      NETLOGO_GLOB,
      "**/node_modules/**"
    );
    await Promise.all(found.map((uri) => this.parseFile(uri)));

    const watcher = vscode.workspace.createFileSystemWatcher(NETLOGO_GLOB);
    watcher.onDidChange((uri) => this.parseFile(uri));
    watcher.onDidCreate((uri) => this.parseFile(uri));
    watcher.onDidDelete((uri) => {
      this.files.delete(uri.toString());
      this.invalidate();
    });
    this.disposables.push(watcher);

    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.handles(doc)) {
          this.parseDocument(doc);
        }
      })
    );
  }

  /** True if this document is a NetLogo source container we parse. */
  handles(doc: vscode.TextDocument): boolean {
    return modelKindForPath(doc.uri.fsPath) !== undefined;
  }

  private store(uri: vscode.Uri, text: string): void {
    const kind = modelKindForPath(uri.fsPath);
    if (!kind) return;
    this.invalidate();

    const extracted = extractModelCode(text, kind);
    if (!extracted) {
      this.files.delete(uri.toString());
      return;
    }
    const parsed = parseNetLogoSource(extracted.code, uri, extracted.line);

    // Interface widgets declare globals that never appear in the code section.
    const widgets =
      kind === "nlogox"
        ? widgetGlobalsFromNlogox(text)
        : kind === "nlogo"
        ? widgetGlobalsFromNlogo(text)
        : [];
    const declared = new Set(parsed.symbols.map((s) => s.name.toLowerCase()));
    for (const w of widgets) {
      if (declared.has(w.name.toLowerCase())) continue;
      parsed.symbols.push({
        name: w.name,
        kind: "global",
        parameters: [],
        location: new vscode.Location(uri, new vscode.Position(w.line, 0)),
        documentation: "",
        extra: `${w.widget} widget`,
      });
    }

    this.files.set(uri.toString(), {
      ...parsed,
      kind,
      codeOffset: extracted.offset,
      code: extracted.code,
    });
  }

  /** Drop derived caches after any parse. */
  private invalidate(): void {
    this.visibleCache.clear();
    this.modelCache.clear();
  }

  async parseFile(uri: vscode.Uri): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      this.store(uri, Buffer.from(bytes).toString("utf8"));
    } catch {
      // File may have been deleted or unreadable
    }
  }

  parseDocument(doc: vscode.TextDocument): void {
    this.store(doc.uri, doc.getText());
  }

  ensureDocumentParsed(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    if (!this.files.has(key) || doc.isDirty) {
      this.parseDocument(doc);
    }
  }

  getAllSymbols(): NetLogoSymbol[] {
    const symbols: NetLogoSymbol[] = [];
    for (const entry of this.files.values()) {
      symbols.push(...entry.symbols);
    }
    return symbols;
  }

  /** Symbols visible from a file: its own plus everything it includes. */
  getSymbolsForFile(uri: vscode.Uri): NetLogoSymbol[] {
    const symbols: NetLogoSymbol[] = [];
    for (const key of this.includeClosure(uri)) {
      const entry = this.files.get(key);
      if (entry) symbols.push(...entry.symbols);
    }
    return symbols;
  }

  /**
   * Extensions available to a file. Because `extensions [ ... ]` is declared in
   * the model rather than in an .nls, this also folds in the extensions of any
   * model whose include chain reaches this file.
   */
  getExtensionsForFile(uri: vscode.Uri): string[] {
    const out = new Set<string>();
    for (const key of this.scopeKeys(uri)) {
      const entry = this.files.get(key);
      if (entry) entry.extensions.forEach((e) => out.add(e));
    }
    return [...out];
  }

  /** Breeds visible from a file, including via the owning model. */
  getBreedsForFile(uri: vscode.Uri): BreedInfo[] {
    return breedsFromSymbols(this.getVisibleSymbols(uri));
  }

  getGeneratedPrimitives(uri: vscode.Uri): GeneratedPrimitive[] {
    return generateBreedPrimitives(this.getVisibleSymbols(uri));
  }

  getExtensionPrimitives(uri: vscode.Uri): ExtensionPrimitive[] {
    return primitivesForExtensions(this.getExtensionsForFile(uri));
  }

  /**
   * Everything in scope for a file: its own include closure, plus the closure
   * of any model that includes it. An .nls sitting inside a model needs the
   * model's globals and breeds to resolve.
   */
  getVisibleSymbols(uri: vscode.Uri): NetLogoSymbol[] {
    const cacheKey = uri.toString();
    const cached = this.visibleCache.get(cacheKey);
    if (cached) return cached;

    const symbols: NetLogoSymbol[] = [];
    for (const key of this.scopeKeys(uri)) {
      const entry = this.files.get(key);
      if (entry) symbols.push(...entry.symbols);
    }
    this.visibleCache.set(cacheKey, symbols);
    return symbols;
  }

  /**
   * The set of files in scope for `uri`: its own include closure plus that of
   * the one model that owns it.
   *
   * Deliberately only one model. A workspace holding both `covid-sim.nlogo`
   * and `covid-sim.nlogox` includes the same .nls files twice, which would
   * otherwise double every symbol and make every procedure look duplicated.
   */
  /**
   * True when we know this file's real scope: it is a model, or some model's
   * include chain reaches it. When false the scope is a guess, and checks that
   * assert things about the whole program (such as duplicate procedures) must
   * not report errors.
   */
  hasOwningModel(uri: vscode.Uri): boolean {
    const entry = this.files.get(uri.toString());
    if (entry && entry.kind !== "nls") return true;
    const model = this.resolveModelFor(uri);
    if (!model) return false;
    return this.includeClosure(model).includes(uri.toString());
  }

  private scopeKeys(uri: vscode.Uri): Set<string> {
    const keys = new Set(this.includeClosure(uri));

    // A model defines its own scope.
    const entry = this.files.get(uri.toString());
    if (entry && entry.kind !== "nls") return keys;

    const model = this.resolveModelFor(uri);
    if (model) {
      const closure = this.includeClosure(model);
      // Only adopt the model's scope if it actually reaches this file;
      // resolveModelFor falls back to "any model in the workspace".
      if (closure.includes(uri.toString())) {
        for (const k of closure) keys.add(k);
        return keys;
      }
    }

    // No model includes this .nls - it may be an alternative implementation
    // swapped in by editing __includes, or simply not wired up yet. We cannot
    // know its real scope, so be permissive rather than reporting every shared
    // helper it uses as undefined.
    for (const key of this.files.keys()) keys.add(key);
    return keys;
  }

  /**
   * URI strings for a file and everything it transitively includes.
   *
   * NetLogo resolves `__includes` paths relative to the *model*, not relative
   * to the file doing the including. So `utils/all_utils.nls` including
   * `"utils/stochastic_fsm.nls"` means `<model dir>/utils/stochastic_fsm.nls`,
   * not `<model dir>/utils/utils/stochastic_fsm.nls`. We resolve against the
   * root first and only fall back to the including file's own directory.
   */
  private includeClosure(uri: vscode.Uri): string[] {
    const visited = new Set<string>();
    const rootDir = path.dirname(uri.fsPath);
    const queue = [uri];

    while (queue.length) {
      const current = queue.shift()!;
      const key = current.toString();
      if (visited.has(key)) continue;
      visited.add(key);

      const entry = this.files.get(key);
      if (!entry) continue;

      for (const include of entry.includes) {
        const fromRoot = vscode.Uri.file(path.resolve(rootDir, include));
        if (this.files.has(fromRoot.toString())) {
          queue.push(fromRoot);
          continue;
        }
        const fromHere = vscode.Uri.file(
          path.resolve(path.dirname(current.fsPath), include)
        );
        queue.push(fromHere);
      }
    }
    return [...visited];
  }

  /** Model files (.nlogox/.nlogo) whose include chain reaches `uri`. */
  modelsIncluding(uri: vscode.Uri): vscode.Uri[] {
    const target = uri.toString();
    const out: vscode.Uri[] = [];
    for (const [key, entry] of this.files) {
      if (entry.kind === "nls") continue;
      if (key === target) continue;
      if (this.includeClosure(vscode.Uri.parse(key)).includes(target)) {
        out.push(vscode.Uri.parse(key));
      }
    }
    return out;
  }

  /**
   * The model file to compile when checking `uri`.
   * Prefers a .nlogox that includes the file, since that is the authoritative
   * format for NetLogo 7.
   */
  resolveModelFor(uri: vscode.Uri): vscode.Uri | undefined {
    const cacheKey = uri.toString();
    if (this.modelCache.has(cacheKey)) return this.modelCache.get(cacheKey);
    const resolved = this.computeModelFor(uri);
    this.modelCache.set(cacheKey, resolved);
    return resolved;
  }

  private computeModelFor(uri: vscode.Uri): vscode.Uri | undefined {
    const entry = this.files.get(uri.toString());
    if (entry && entry.kind !== "nls") return uri;

    const owners = this.modelsIncluding(uri);
    const nlogox = owners.find(
      (u) => modelKindForPath(u.fsPath) === "nlogox"
    );
    if (nlogox) return nlogox;
    if (owners.length) return owners[0];

    // Fall back to any model in the workspace, preferring .nlogox.
    const models = [...this.files.entries()].filter(
      ([, e]) => e.kind !== "nls"
    );
    const preferred =
      models.find(([, e]) => e.kind === "nlogox") ?? models[0];
    return preferred ? vscode.Uri.parse(preferred[0]) : undefined;
  }

  /** The offset of the code section within a file's LF-normalised text. */
  getCodeOffset(uri: vscode.Uri): number {
    return this.files.get(uri.toString())?.codeOffset ?? 0;
  }

  /** The extracted NetLogo code for a file. */
  getCode(uri: vscode.Uri): string | undefined {
    return this.files.get(uri.toString())?.code;
  }

  findSymbolByName(name: string): NetLogoSymbol | undefined {
    const lower = name.toLowerCase();
    for (const entry of this.files.values()) {
      const found = entry.symbols.find((s) => s.name.toLowerCase() === lower);
      if (found) return found;
    }
    return undefined;
  }

  /** Read a file's text, preferring the editor's in-memory copy. */
  static async readText(uri: vscode.Uri): Promise<string | undefined> {
    const open = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === uri.toString()
    );
    if (open) return normalizeNewlines(open.getText());
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return normalizeNewlines(Buffer.from(bytes).toString("utf8"));
    } catch {
      return undefined;
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
