import * as path from "path";

/**
 * NetLogo source lives in three different containers:
 *
 *   .nls    - plain NetLogo source, the whole file
 *   .nlogo  - legacy format: code, then `@#$#@#$#@`, then widgets/info/etc.
 *   .nlogox - NetLogo 7 XML format: code lives in <code><![CDATA[ ... ]]></code>
 *
 * Everything downstream (parsing, diagnostics, compile-error mapping) works on
 * the extracted code plus the offsets needed to map back to the real file.
 */

export type ModelKind = "nls" | "nlogo" | "nlogox";

export interface ModelCode {
  /** The NetLogo source itself. */
  code: string;
  /**
   * Character offset at which `code` begins, measured in the file text with
   * line endings normalised to LF. NetLogo reports compile-error positions
   * against LF-normalised text, so this is the frame the mapping needs.
   */
  offset: number;
  /** 0-based line in the file at which `code` begins. */
  line: number;
}

export function modelKindForPath(filePath: string): ModelKind | undefined {
  switch (path.extname(filePath).toLowerCase()) {
    case ".nls":
      return "nls";
    case ".nlogo":
    case ".nlogo3d":
      return "nlogo";
    case ".nlogox":
    case ".nlogox3d":
      return "nlogox";
    default:
      return undefined;
  }
}

/** NetLogo normalises CRLF to LF before compiling; offsets index that text. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Pull the NetLogo code out of whatever container it is in.
 *
 * Returns undefined only if the file is a model format whose code section is
 * missing or malformed.
 */
export function extractModelCode(
  fileText: string,
  kind: ModelKind
): ModelCode | undefined {
  const text = normalizeNewlines(fileText);

  if (kind === "nls") {
    return { code: text, offset: 0, line: 0 };
  }

  if (kind === "nlogo") {
    // Legacy format: the code section runs up to the first separator.
    const sep = text.indexOf("@#$#@#$#@");
    const code = sep >= 0 ? text.slice(0, sep) : text;
    return { code, offset: 0, line: 0 };
  }

  // .nlogox - the code is CDATA inside the first <code> element.
  const open = text.search(/<code\b[^>]*>/);
  if (open < 0) return undefined;
  const openEnd = text.indexOf(">", open) + 1;

  const cdataOpen = "<![CDATA[";
  const afterTag = text.slice(openEnd);
  const cdataAt = afterTag.indexOf(cdataOpen);
  const closeTagAt = afterTag.indexOf("</code>");

  let start: number;
  let end: number;

  if (cdataAt >= 0 && (closeTagAt < 0 || cdataAt < closeTagAt)) {
    start = openEnd + cdataAt + cdataOpen.length;
    const cdataEnd = text.indexOf("]]>", start);
    end = cdataEnd < 0 ? (closeTagAt < 0 ? text.length : openEnd + closeTagAt) : cdataEnd;
  } else {
    // A <code> element without CDATA - still readable, just entity-encoded.
    if (closeTagAt < 0) return undefined;
    start = openEnd;
    end = openEnd + closeTagAt;
  }

  let code = text.slice(start, end);
  if (cdataAt < 0) {
    code = code
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  // Count lines before the code starts so symbol locations land on real lines.
  let line = 0;
  for (let i = 0; i < start; i++) {
    if (text[i] === "\n") line++;
  }

  return { code, offset: start, line };
}

/**
 * Convert a character offset within LF-normalised file text into a
 * 0-based line/character pair.
 */
export function offsetToPosition(
  normalizedText: string,
  offset: number
): { line: number; character: number } {
  const clamped = Math.max(0, Math.min(offset, normalizedText.length));
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (normalizedText[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: clamped - lineStart };
}
