import * as vscode from "vscode";
import { SymbolStore } from "../symbolStore";
import { lookupDoc } from "../dictionary";
import { stripComment, NetLogoSymbol } from "../parser";

/**
 * NetLogo call sites have no parentheses and no commas - `move-agent turtle 5`
 * is a two-argument call. So we find the nearest preceding callable that still
 * wants arguments, and count the whitespace-separated terms after it.
 */
export class NetLogoSignatureHelpProvider
  implements vscode.SignatureHelpProvider
{
  constructor(private symbolStore: SymbolStore) {}

  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.SignatureHelp | undefined {
    this.symbolStore.ensureDocumentParsed(document);

    const lineText = document.getText(
      new vscode.Range(position.line, 0, position.line, position.character)
    );
    const code = stripComment(lineText);
    const tokens = tokenizeTopLevel(code);
    if (!tokens.length) return undefined;

    const symbols = this.symbolStore.getVisibleSymbols(document.uri);

    // Walk backwards looking for a callable that still has room for arguments.
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      if (!/^[a-zA-Z_#][\w\-?!#%:]*$/.test(token.text)) continue;

      const argsAfter = tokens.length - 1 - i;

      const userSym = symbols.find(
        (s) =>
          (s.kind === "procedure" || s.kind === "reporter") &&
          s.name.toLowerCase() === token.text.toLowerCase()
      );
      if (userSym) {
        if (userSym.parameters.length === 0) return undefined;
        if (argsAfter >= userSym.parameters.length) return undefined;
        return userSignature(userSym, argsAfter);
      }

      const doc = lookupDoc(token.text);
      if (doc && doc.syntax.length) {
        const help = builtinSignature(doc.name, doc.syntax, doc.description, argsAfter);
        if (help) return help;
        return undefined;
      }
    }

    return undefined;
  }
}

function userSignature(
  sym: NetLogoSymbol,
  activeParameter: number
): vscode.SignatureHelp {
  const keyword = sym.kind === "procedure" ? "to" : "to-report";
  const label = `${keyword} ${sym.name} [${sym.parameters.join(" ")}]`;

  const info = new vscode.SignatureInformation(label);
  if (sym.documentation) {
    info.documentation = new vscode.MarkdownString(sym.documentation);
  }

  // Anchor each parameter by its real offset in the label so VS Code
  // highlights the right one even when names repeat.
  let cursor = label.indexOf("[") + 1;
  info.parameters = sym.parameters.map((p) => {
    const start = label.indexOf(p, cursor);
    cursor = start + p.length;
    return new vscode.ParameterInformation([start, start + p.length]);
  });

  const help = new vscode.SignatureHelp();
  help.signatures = [info];
  help.activeSignature = 0;
  help.activeParameter = Math.min(activeParameter, sym.parameters.length - 1);
  return help;
}

function builtinSignature(
  name: string,
  syntaxForms: string[],
  description: string,
  activeParameter: number
): vscode.SignatureHelp | undefined {
  const signatures: vscode.SignatureInformation[] = [];

  for (const form of syntaxForms) {
    const parts = splitSyntax(form, name);
    if (!parts) continue;
    const info = new vscode.SignatureInformation(form);
    if (description) {
      info.documentation = new vscode.MarkdownString(description);
    }
    info.parameters = parts.map(
      (p) => new vscode.ParameterInformation([p.start, p.end])
    );
    signatures.push(info);
  }

  if (!signatures.length) return undefined;

  // Prefer a form that actually has room for the argument being typed.
  let chosen = 0;
  for (let i = 0; i < signatures.length; i++) {
    if (signatures[i].parameters.length > activeParameter) {
      chosen = i;
      break;
    }
  }
  const help = new vscode.SignatureHelp();
  help.signatures = signatures;
  help.activeSignature = chosen;
  help.activeParameter = Math.min(
    activeParameter,
    Math.max(0, signatures[chosen].parameters.length - 1)
  );
  return help;
}

/**
 * Split a dictionary syntax form into parameter spans, treating a bracketed
 * block as a single parameter. Returns undefined if the primitive name does
 * not appear (infix forms like `[ reporter ] of agent` are handled by taking
 * every term other than the name).
 */
function splitSyntax(
  form: string,
  name: string
): Array<{ start: number; end: number }> | undefined {
  const spans: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < form.length) {
    if (form[i] === " ") {
      i++;
      continue;
    }
    const start = i;
    if (form[i] === "[") {
      let depth = 0;
      while (i < form.length) {
        if (form[i] === "[") depth++;
        else if (form[i] === "]") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
    } else {
      while (i < form.length && form[i] !== " ") i++;
    }
    spans.push({ start, end: i });
  }

  const nameLower = name.toLowerCase();
  const params = spans.filter(
    (s) => form.slice(s.start, s.end).toLowerCase() !== nameLower
  );
  return params.length ? params : undefined;
}

interface Tok {
  text: string;
  start: number;
}

/**
 * Tokenise a line, collapsing bracketed blocks and strings into single tokens
 * so that `ask turtles [ ... ]` counts as two terms, not many.
 */
function tokenizeTopLevel(code: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    const start = i;
    if (ch === "[" || ch === "(") {
      const open = ch;
      const close = ch === "[" ? "]" : ")";
      let depth = 0;
      while (i < code.length) {
        if (code[i] === open) depth++;
        else if (code[i] === close) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      tokens.push({ text: code.slice(start, i), start });
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < code.length && code[i] !== '"') i++;
      i++;
      tokens.push({ text: code.slice(start, i), start });
      continue;
    }
    while (i < code.length && !/[\s\[\]()"]/.test(code[i])) i++;
    if (i === start) i++;
    tokens.push({ text: code.slice(start, i), start });
  }
  return tokens;
}
