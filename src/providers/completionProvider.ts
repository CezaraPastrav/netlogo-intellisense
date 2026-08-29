import * as vscode from "vscode";
import { SymbolStore } from "../symbolStore";
import { ALL_BUILTINS, BuiltinKind } from "../builtins";
import { lookupDoc, docUrl } from "../dictionary";
import { NetLogoSymbolKind, NetLogoSymbol } from "../parser";
import { agentContextAt, fitsContext, AgentContext } from "../agentContext";

/** Sort buckets, most relevant first. */
const SORT_LOCAL = "0";
const SORT_CONTEXT = "1";
const SORT_USER = "2";
const SORT_BREED = "3";
const SORT_EXTENSION = "4";
const SORT_BUILTIN = "5";

const IDENTIFIER = /[a-zA-Z_#][a-zA-Z0-9_?!#%:-]*/;

export class NetLogoCompletionProvider
  implements vscode.CompletionItemProvider
{
  constructor(private symbolStore: SymbolStore) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    this.symbolStore.ensureDocumentParsed(document);

    const wordRange = document.getWordRangeAtPosition(position, IDENTIFIER);
    const prefix = wordRange ? document.getText(wordRange).toLowerCase() : "";
    const matches = (name: string) =>
      !prefix || name.toLowerCase().startsWith(prefix);

    const items: vscode.CompletionItem[] = [];
    const context = this.contextAt(document, position);

    // --- locals of the enclosing procedure ---
    const enclosing = this.enclosingProcedure(document, position);
    if (enclosing?.locals) {
      const seen = new Set<string>();
      for (const local of enclosing.locals) {
        if (!matches(local.name) || seen.has(local.name.toLowerCase())) continue;
        seen.add(local.name.toLowerCase());
        const item = new vscode.CompletionItem(
          local.name,
          vscode.CompletionItemKind.Variable
        );
        item.detail =
          local.source === "parameter"
            ? `(parameter of ${enclosing.name})`
            : `(local in ${enclosing.name})`;
        item.sortText = `${SORT_LOCAL}_${local.name}`;
        items.push(item);
      }
    }

    // --- user-defined symbols ---
    for (const sym of this.symbolStore.getVisibleSymbols(document.uri)) {
      if (!matches(sym.name)) continue;
      items.push(this.userSymbolItem(sym));
    }

    // --- breed-generated primitives ---
    for (const gen of this.symbolStore.getGeneratedPrimitives(document.uri)) {
      if (!matches(gen.name)) continue;
      const item = new vscode.CompletionItem(
        gen.name,
        gen.kind === "command"
          ? vscode.CompletionItemKind.Function
          : vscode.CompletionItemKind.Function
      );
      item.detail = `(${gen.kind}) from breed ${gen.breed}`;
      item.documentation = new vscode.MarkdownString(gen.description);
      item.sortText = `${SORT_BREED}_${gen.name}`;
      items.push(item);
    }

    // --- extension primitives, only for declared extensions ---
    for (const ext of this.symbolStore.getExtensionPrimitives(document.uri)) {
      if (!matches(ext.name)) continue;
      const item = new vscode.CompletionItem(
        ext.name,
        vscode.CompletionItemKind.Method
      );
      item.detail = `(${ext.kind}) extension`;
      item.documentation = new vscode.MarkdownString(ext.description);
      item.sortText = `${SORT_EXTENSION}_${ext.name}`;
      items.push(item);
    }

    // --- built-in primitives ---
    for (const builtin of ALL_BUILTINS) {
      if (!matches(builtin.name)) continue;
      const item = new vscode.CompletionItem(
        builtin.name,
        builtinKindToCompletionKind(builtin.kind)
      );

      const doc = lookupDoc(builtin.name);
      item.detail = doc?.syntax.length
        ? doc.syntax[0]
        : `(${builtin.kind}) ${builtin.name}`;
      item.documentation = buildDocumentation(builtin.name, builtin.description);

      // Rank primitives that suit the surrounding agent context above the rest.
      const suits = fitsContext(builtin.name, context);
      item.sortText = `${suits ? SORT_CONTEXT : SORT_BUILTIN}_${builtin.name}`;
      if (suits) {
        item.detail = `${item.detail}   ·   ${context} context`;
      }
      items.push(item);
    }

    return items;
  }

  private userSymbolItem(sym: NetLogoSymbol): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      sym.name,
      symbolKindToCompletionKind(sym.kind)
    );

    if (sym.kind === "procedure" || sym.kind === "reporter") {
      const params =
        sym.parameters.length > 0 ? ` [${sym.parameters.join(" ")}]` : "";
      item.detail = `(${sym.kind}) ${sym.name}${params}`;
      // Insert the name only; NetLogo arguments are positional and unbracketed
      // at the call site, so a snippet would fight the user.
    } else if (sym.kind === "breed") {
      item.detail = `(breed) ${sym.name}${sym.extra ? ` / ${sym.extra}` : ""}`;
    } else if (
      sym.kind === "breed-own" ||
      sym.kind === "turtles-own" ||
      sym.kind === "patches-own" ||
      sym.kind === "links-own"
    ) {
      item.detail = `(${sym.kind}) ${sym.name}${
        sym.extra ? ` — ${sym.extra}` : ""
      }`;
    } else {
      item.detail = `(${sym.kind}) ${sym.name}`;
    }

    if (sym.documentation) {
      item.documentation = new vscode.MarkdownString(sym.documentation);
    }
    item.sortText = `${SORT_USER}_${sym.name}`;
    return item;
  }

  private contextAt(
    document: vscode.TextDocument,
    position: vscode.Position
  ): AgentContext {
    const code = this.symbolStore.getCode(document.uri);
    if (code === undefined) return "unknown";
    // Offsets are relative to the extracted code, which for .nls is the file.
    const offset = document.offsetAt(position);
    const breeds = this.symbolStore.getBreedsForFile(document.uri);
    try {
      return agentContextAt(code, offset, breeds);
    } catch {
      return "unknown";
    }
  }

  private enclosingProcedure(
    document: vscode.TextDocument,
    position: vscode.Position
  ): NetLogoSymbol | undefined {
    const line = position.line;
    let best: NetLogoSymbol | undefined;
    for (const sym of this.symbolStore.getSymbolsForFile(document.uri)) {
      if (sym.kind !== "procedure" && sym.kind !== "reporter") continue;
      if (sym.location.uri.toString() !== document.uri.toString()) continue;
      const start = sym.location.range.start.line;
      const end = sym.endLine ?? start;
      if (line >= start && line <= end) {
        if (!best || start > best.location.range.start.line) best = sym;
      }
    }
    return best;
  }
}

/** Build hover-quality documentation for a built-in completion item. */
function buildDocumentation(
  name: string,
  fallback: string
): vscode.MarkdownString {
  const doc = lookupDoc(name);
  const md = new vscode.MarkdownString();
  if (!doc) {
    md.appendMarkdown(fallback);
    return md;
  }
  if (doc.syntax.length) {
    md.appendCodeblock(doc.syntax.join("\n"), "netlogo");
  }
  md.appendMarkdown(doc.description || fallback);
  if (doc.since) {
    md.appendMarkdown(`\n\n*Since NetLogo ${doc.since}*`);
  }
  md.appendMarkdown(`\n\n[NetLogo dictionary](${docUrl(doc)})`);
  return md;
}

function builtinKindToCompletionKind(
  kind: BuiltinKind
): vscode.CompletionItemKind {
  switch (kind) {
    case "command":
      return vscode.CompletionItemKind.Function;
    case "reporter":
      return vscode.CompletionItemKind.Function;
    case "keyword":
      return vscode.CompletionItemKind.Keyword;
    case "constant":
      return vscode.CompletionItemKind.Constant;
    default:
      return vscode.CompletionItemKind.Text;
  }
}

function symbolKindToCompletionKind(
  kind: NetLogoSymbolKind
): vscode.CompletionItemKind {
  switch (kind) {
    case "procedure":
      return vscode.CompletionItemKind.Function;
    case "reporter":
      return vscode.CompletionItemKind.Function;
    case "global":
      return vscode.CompletionItemKind.Variable;
    case "breed":
      return vscode.CompletionItemKind.Class;
    case "link-breed":
      return vscode.CompletionItemKind.Class;
    case "breed-own":
    case "turtles-own":
    case "patches-own":
    case "links-own":
      return vscode.CompletionItemKind.Property;
    default:
      return vscode.CompletionItemKind.Text;
  }
}
