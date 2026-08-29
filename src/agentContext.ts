import { NetLogoSymbol, stripComment } from "./parser";

/**
 * Which kind of agent is running the code at a given point.
 *
 * Inference is heuristic: NetLogo's real context rules depend on the call
 * graph, which we do not build. Callers should therefore use this to *rank*
 * completions, not to hide them - a wrong guess that hides a valid primitive
 * is much worse than one that merely mis-sorts.
 */
export type AgentContext = "observer" | "turtle" | "patch" | "link" | "unknown";

export interface BreedInfo {
  plural: string;
  singular: string;
  isLink: boolean;
}

export function breedsFromSymbols(symbols: NetLogoSymbol[]): BreedInfo[] {
  const out: BreedInfo[] = [];
  for (const s of symbols) {
    if (s.kind === "breed") {
      out.push({ plural: s.name, singular: s.extra ?? s.name, isLink: false });
    } else if (s.kind === "link-breed") {
      out.push({ plural: s.name, singular: s.extra ?? s.name, isLink: true });
    }
  }
  return out;
}

/** Agentset expressions whose context is unambiguous. */
const PATCH_WORDS = new Set([
  "patches", "neighbors", "neighbors4", "patch", "patch-here", "patch-at",
  "patch-ahead", "patch-left-and-ahead", "patch-right-and-ahead", "patch-at-heading-and-distance",
]);
const TURTLE_WORDS = new Set([
  "turtles", "turtles-here", "turtles-at", "turtles-on", "turtle",
  "turtle-set", "other",
]);
const LINK_WORDS = new Set([
  "links", "link", "link-set", "my-links", "my-in-links", "my-out-links",
  "link-neighbors", "in-link-neighbors", "out-link-neighbors",
]);

/** Keywords where the agentset comes *before* the keyword. */
const AGENTSET_BEFORE = new Set([
  "with", "with-max", "with-min", "all?", "any?", "count", "one-of", "n-of",
  "max-one-of", "min-one-of", "max-n-of", "min-n-of", "sort-by", "sort-on",
]);
/** Keywords where the agentset comes *after* the keyword, before the block. */
const AGENTSET_AFTER = new Set(["ask", "ask-concurrent", "of"]);

function contextForWord(word: string, breeds: BreedInfo[]): AgentContext {
  const w = word.toLowerCase();
  if (PATCH_WORDS.has(w)) return "patch";
  if (TURTLE_WORDS.has(w)) return "turtle";
  if (LINK_WORDS.has(w)) return "link";

  for (const b of breeds) {
    const p = b.plural.toLowerCase();
    const s = b.singular.toLowerCase();
    if (w === p || w === s) return b.isLink ? "link" : "turtle";
    if (!b.isLink && (w === `${p}-here` || w === `${p}-at` || w === `${p}-on`)) {
      return "turtle";
    }
    if (b.isLink && (w === `my-${p}` || w === `my-in-${p}` || w === `my-out-${p}`)) {
      return "link";
    }
  }
  if (/^(hatch|sprout|create|create-ordered)-/.test(w)) return "turtle";
  return "unknown";
}

interface Token {
  text: string;
  start: number;
}

/** Tokenise NetLogo code into words and brackets, dropping comments and strings. */
function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  const lines = code.split("\n");
  let offset = 0;
  for (const rawLine of lines) {
    const line = stripComment(rawLine);
    const re = /"[^"]*"|[\[\]()]|[a-zA-Z_#][\w\-?!#%:]*|[^\s]/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m[0][0] === '"') continue; // string literal - not an identifier
      tokens.push({ text: m[0], start: offset + m.index });
    }
    offset += rawLine.length + 1;
  }
  return tokens;
}

/**
 * Infer the agent context at `offset` within `code`.
 */
export function agentContextAt(
  code: string,
  offset: number,
  breeds: BreedInfo[]
): AgentContext {
  const tokens = tokenize(code);

  // Stack of contexts, one entry per open bracket, plus the procedure base.
  const stack: AgentContext[] = ["observer"];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.start >= offset) break;
    const w = t.text.toLowerCase();

    // A new procedure resets to observer.
    if (w === "to" || w === "to-report") {
      stack.length = 0;
      stack.push("observer");
      continue;
    }
    if (w === "end") {
      stack.length = 0;
      stack.push("observer");
      continue;
    }

    if (t.text === "[") {
      stack.push(contextForBlock(tokens, i, breeds, stack[stack.length - 1]));
      continue;
    }
    if (t.text === "]") {
      if (stack.length > 1) stack.pop();
      continue;
    }
  }

  return stack[stack.length - 1];
}

/**
 * Work out the context inside the block opened by the bracket at `bracketIndex`.
 */
function contextForBlock(
  tokens: Token[],
  bracketIndex: number,
  breeds: BreedInfo[],
  inherited: AgentContext
): AgentContext {
  // Walk backwards over the agentset expression preceding the bracket.
  for (let j = bracketIndex - 1, seen = 0; j >= 0 && seen < 6; j--, seen++) {
    const w = tokens[j].text.toLowerCase();
    if (w === "]" || w === "[") break;

    if (AGENTSET_AFTER.has(w)) {
      // `ask <agentset> [` - scan forward from the keyword to the bracket.
      for (let k = j + 1; k < bracketIndex; k++) {
        const ctx = contextForWord(tokens[k].text, breeds);
        if (ctx !== "unknown") return ctx;
      }
      return "unknown";
    }

    if (AGENTSET_BEFORE.has(w)) {
      // `<agentset> with [` - the agentset is just before the keyword.
      for (let k = j - 1; k >= 0 && k > j - 4; k--) {
        const ctx = contextForWord(tokens[k].text, breeds);
        if (ctx !== "unknown") return ctx;
      }
      return "unknown";
    }

    // `hatch-wolves 5 [`, `create-turtles 10 [`, `sprout 3 [`
    if (/^(hatch|sprout|create|create-ordered)(-|$)/.test(w)) {
      const ctx = contextForWord(w, breeds);
      return ctx === "unknown" ? "turtle" : ctx;
    }
  }

  // `[ ... ] of turtles` - the agentset follows the closing bracket.
  const close = matchingBracket(tokens, bracketIndex);
  if (close >= 0 && close + 1 < tokens.length) {
    if (tokens[close + 1].text.toLowerCase() === "of") {
      for (let k = close + 2; k < tokens.length && k < close + 5; k++) {
        const ctx = contextForWord(tokens[k].text, breeds);
        if (ctx !== "unknown") return ctx;
      }
    }
  }

  return inherited;
}

function matchingBracket(tokens: Token[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    if (tokens[i].text === "[") depth++;
    else if (tokens[i].text === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Primitives that only make sense in a particular agent context.
 * Used to rank completions; absence from this map means "always fine".
 */
export const PRIMITIVE_CONTEXTS: Record<string, AgentContext> = {};

const turtleOnly = [
  "forward", "fd", "back", "bk", "right", "rt", "left", "lt", "setxy",
  "jump", "home", "face", "facexy", "towards", "towardsxy", "downhill",
  "downhill4", "uphill", "uphill4", "hide-turtle", "ht", "show-turtle", "st",
  "pen-down", "pd", "pen-up", "pu", "pen-erase", "pe", "stamp", "stamp-erase",
  "die", "hatch", "move-to", "set-default-shape", "tie", "untie",
  "in-radius", "patch-ahead", "patch-here", "patch-left-and-ahead",
  "patch-right-and-ahead", "patch-at-heading-and-distance", "dx", "dy",
  "my-links", "my-in-links", "my-out-links", "link-neighbors",
  "in-link-neighbors", "out-link-neighbors", "link-with", "in-link-from",
  "out-link-to", "create-link-with", "create-links-with", "create-link-to",
  "create-links-to", "create-link-from", "create-links-from",
];
const patchOnly = [
  "sprout", "diffuse", "diffuse4", "neighbors", "neighbors4",
  "turtles-here", "myself",
];
const linkOnly = [
  "both-ends", "end1", "end2", "other-end", "link-length", "tie", "untie",
  "hide-link", "show-link",
];
const observerOnly = [
  "clear-all", "ca", "clear-turtles", "clear-patches", "clear-links",
  "clear-drawing", "clear-all-plots", "clear-output", "clear-ticks",
  "reset-ticks", "setup-plots", "create-turtles", "crt",
  "create-ordered-turtles", "cro", "import-world", "import-pcolors",
  "import-drawing", "layout-circle",
];

for (const n of turtleOnly) PRIMITIVE_CONTEXTS[n] = "turtle";
for (const n of patchOnly) PRIMITIVE_CONTEXTS[n] = "patch";
for (const n of linkOnly) PRIMITIVE_CONTEXTS[n] = "link";
for (const n of observerOnly) PRIMITIVE_CONTEXTS[n] = "observer";

/** True when a primitive is a natural fit for the given context. */
export function fitsContext(name: string, context: AgentContext): boolean {
  if (context === "unknown") return false;
  const required = PRIMITIVE_CONTEXTS[name.toLowerCase()];
  if (!required) return false;
  // Turtles and links can both use most turtle-ish movement/link primitives.
  return required === context;
}
