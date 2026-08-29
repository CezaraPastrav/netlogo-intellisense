#!/usr/bin/env node
/**
 * Regenerate src/dictionary.ts from the official NetLogo dictionary.
 *
 *   node tools/generate-dictionary.js
 *
 * Markup notes, in case the docs site changes shape again:
 *   <div class="dict_entry" id="ask">
 *     <h3>ask <span class="since">1.0</span></h3>
 *     <h4><span class="prim_example"><p>ask <em>agentset</em>
 *         <span><em>commands</em></span></p></span>...</h4>
 *     <p>description</p>
 *     <pre><code>example</code></pre>
 *   </div>
 *
 * Two things that are easy to get wrong:
 *  - The literal [ ] around command/reporter blocks are supplied by CSS, not
 *    markup. An inner <span> inside a prim_example means "bracketed block".
 *  - prim_example spans contain nested spans, so they need balanced matching;
 *    a non-greedy /<span...>(.*?)<\/span>/ stops at the wrong closing tag and
 *    silently truncates the syntax.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const URL = "https://ccl.northwestern.edu/netlogo/docs/dictionary.html";
const OUT = path.join(__dirname, "..", "src", "dictionary.ts");

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.headers.location) {
          resolve(fetch(res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

const stripMarkers = (s) => s.replace(/<!--\[-->|<!--\]-->|<!---->/g, "");

const text = (s) =>
  decode(
    stripMarkers(s).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
  ).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/** Index of the closing tag matching the element opened at `openStart`. */
function matchEnd(s, openStart, tag) {
  const openRe = new RegExp(`<${tag}(\\s|>)`, "g");
  const closeRe = new RegExp(`</${tag}>`, "g");
  let depth = 0;
  let i = openStart;
  while (i < s.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const o = openRe.exec(s);
    const c = closeRe.exec(s);
    if (!c) return s.length;
    if (o && o.index < c.index) {
      depth++;
      i = o.index + 1;
    } else {
      depth--;
      if (depth === 0) return c.index;
      i = c.index + 1;
    }
  }
  return s.length;
}

/** Render a prim_example body, turning inner <span> blocks into [ ... ]. */
function renderSyntax(body) {
  let out = "";
  let i = 0;
  const s = stripMarkers(body).replace(
    /<span class="since"[^>]*>[\s\S]*?<\/span>/g,
    ""
  );
  while (i < s.length) {
    if (s.startsWith("<span", i)) {
      out += "[ ";
      i = s.indexOf(">", i) + 1;
    } else if (s.startsWith("</span>", i)) {
      out += " ]";
      i += 7;
    } else if (s[i] === "<") {
      const gt = s.indexOf(">", i);
      i = gt < 0 ? s.length : gt + 1;
    } else {
      out += s[i++];
    }
  }
  return decode(out)
    .replace(/\s+/g, " ")
    .replace(/\[\s+/g, "[ ")
    .replace(/\s+\]/g, " ]")
    .trim();
}

function parse(html) {
  const marks = [];
  const re = /<div class="dict_entry" id="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    marks.push({ id: m[1], start: m.index, bodyStart: m.index + m[0].length });
  }
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : html.length;
    marks[i].html = html.slice(marks[i].bodyStart, end);
  }

  return marks.map((mk) => {
    const body = mk.html;

    const h3m = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    let name = mk.id;
    let since;
    if (h3m) {
      const sinceM = h3m[1].match(/<span class="since"[^>]*>([\s\S]*?)<\/span>/);
      if (sinceM) since = text(sinceM[1]);
      const nameSrc = h3m[1].replace(
        /<span class="since"[^>]*>[\s\S]*?<\/span>/,
        ""
      );
      name = (text(nameSrc).split("\n")[0] || mk.id).trim();
    }
    if (!name) name = mk.id;

    const syntax = [];
    const h4i = body.indexOf("<h4");
    const h4end = h4i >= 0 ? body.indexOf("</h4>", h4i) : -1;
    const head = h4i >= 0 ? body.slice(h4i, h4end < 0 ? body.length : h4end) : "";
    let pi = 0;
    const OPEN = '<span class="prim_example">';
    for (;;) {
      const at = head.indexOf(OPEN, pi);
      if (at < 0) break;
      const close = matchEnd(head, at, "span");
      const t = renderSyntax(head.slice(at + OPEN.length, close));
      if (t) syntax.push(t);
      pi = close + 1;
    }

    const tail =
      h4end >= 0 ? body.slice(h4end + 5) : body.replace(/<h3[\s\S]*?<\/h3>/, "");
    const paras = [];
    const pe = /<p>([\s\S]*?)<\/p>/g;
    let pm;
    while ((pm = pe.exec(tail)) !== null) {
      const t = text(pm[1]);
      if (t) paras.push(t);
    }

    let example;
    const codeM = tail.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
    if (codeM) {
      let c = text(codeM[1]);
      if (c.length > 400) c = c.slice(0, 400) + "\n...";
      if (c) example = c;
    }

    return {
      name,
      anchor: mk.id,
      syntax,
      description: paras.join("\n\n"),
      since,
      example,
    };
  });
}

function emit(entries) {
  const q = (s) => JSON.stringify(s);
  let ts = `/**
 * NetLogo dictionary entries, generated from the official documentation:
 * ${URL}
 *
 * Do not edit by hand - run tools/generate-dictionary.js.
 */

export interface DictEntry {
  /** Display name, e.g. "all?" */
  name: string;
  /** URL anchor on the dictionary page, e.g. "all" */
  anchor: string;
  /** One or more syntax forms, e.g. "ask agentset [ commands ]" */
  syntax: string[];
  /** Prose description. */
  description: string;
  /** NetLogo version the primitive was introduced in, when documented. */
  since?: string;
  /** A short usage example, when documented. */
  example?: string;
}

export const DICTIONARY_URL =
  ${q(URL)};

export const DICT_ENTRIES: DictEntry[] = [
`;
  for (const e of entries) {
    const parts = [
      `name: ${q(e.name)}`,
      `anchor: ${q(e.anchor)}`,
      `syntax: [${e.syntax.map(q).join(", ")}]`,
      `description: ${q(e.description)}`,
    ];
    if (e.since) parts.push(`since: ${q(e.since)}`);
    if (e.example) parts.push(`example: ${q(e.example)}`);
    ts += `  { ${parts.join(", ")} },\n`;
  }
  ts += `];

const byName = new Map<string, DictEntry>();
for (const e of DICT_ENTRIES) {
  byName.set(e.name.toLowerCase(), e);
}

/** Look up a dictionary entry by primitive name (case-insensitive). */
export function lookupDoc(name: string): DictEntry | undefined {
  return byName.get(name.toLowerCase());
}

/** Direct link to a primitive's dictionary entry. */
export function docUrl(entry: DictEntry): string {
  return \`\${DICTIONARY_URL}#\${entry.anchor}\`;
}
`;
  return ts;
}

(async () => {
  console.log(`fetching ${URL} ...`);
  const html = await fetch(URL);
  const entries = parse(html);

  const withSyntax = entries.filter((e) => e.syntax.length).length;
  console.log(`parsed ${entries.length} entries (${withSyntax} with syntax)`);
  if (entries.length < 200) {
    console.error("Refusing to write: suspiciously few entries parsed.");
    console.error("The docs markup has probably changed - see the notes above.");
    process.exit(1);
  }

  fs.writeFileSync(OUT, emit(entries), "utf8");
  console.log(`wrote ${OUT}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
