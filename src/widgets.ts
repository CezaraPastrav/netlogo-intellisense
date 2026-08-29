/**
 * Interface widgets declare global variables that appear nowhere in the code
 * section. A model with 53 sliders has 53 globals that `globals [ ... ]` never
 * mentions, so without this every reference to one looks undefined.
 */

export interface WidgetGlobal {
  name: string;
  /** 0-based line in the file where the widget is declared. */
  line: number;
  /** Widget type, e.g. "slider". */
  widget: string;
}

/**
 * Widget elements in .nlogox that bind a global variable.
 *
 * Note `input`, not `inputBox` - that is the element name NetLogo 7 writes.
 * `enumeratedValueSet` and `steppedValueSet` also carry a `variable`
 * attribute but are BehaviorSpace experiment settings referring to globals
 * that already exist, so they must not be treated as declarations.
 */
const XML_WIDGETS = ["slider", "switch", "chooser", "input", "inputBox"];

/** Widget block headers in the legacy .nlogo format that bind a variable. */
const LEGACY_WIDGETS = ["SLIDER", "SWITCH", "CHOOSER", "INPUTBOX"];

/**
 * In the legacy format a widget block is a run of lines:
 *   0 TYPE, 1-4 geometry, 5 display name, 6 variable name, ...
 */
const LEGACY_VARIABLE_LINE = 6;

/** Extract widget-declared globals from a .nlogox document. */
export function widgetGlobalsFromNlogox(text: string): WidgetGlobal[] {
  const out: WidgetGlobal[] = [];
  const re = new RegExp(
    `<(${XML_WIDGETS.join("|")})\\b[^>]*>`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const varMatch = m[0].match(/\bvariable="([^"]*)"/i);
    if (!varMatch || !varMatch[1]) continue;
    out.push({
      name: varMatch[1],
      line: lineOf(text, m.index),
      widget: m[1].toLowerCase(),
    });
  }
  return dedupe(out);
}

/** Extract widget-declared globals from the legacy .nlogo widget section. */
export function widgetGlobalsFromNlogo(text: string): WidgetGlobal[] {
  const out: WidgetGlobal[] = [];
  const lines = text.split("\n");

  // The code section runs up to the first separator; widgets follow it.
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("@#$#@#$#@")) {
      start = i + 1;
      break;
    }
  }

  for (let i = start; i < lines.length; i++) {
    const header = lines[i].trim();
    if (!LEGACY_WIDGETS.includes(header)) continue;
    const varLine = i + LEGACY_VARIABLE_LINE;
    if (varLine >= lines.length) continue;
    const name = lines[varLine].trim();
    // A missing binding is written as NIL.
    if (!name || name === "NIL") continue;
    if (!/^[a-zA-Z_#][\w\-?!#%]*$/.test(name)) continue;
    out.push({ name, line: varLine, widget: header.toLowerCase() });
  }
  return dedupe(out);
}

function lineOf(text: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function dedupe(items: WidgetGlobal[]): WidgetGlobal[] {
  const seen = new Set<string>();
  return items.filter((w) => {
    const key = w.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
