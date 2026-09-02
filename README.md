# NetLogo IntelliSense

A Visual Studio Code extension that makes editing NetLogo models feel like
editing code in a modern IDE: autocomplete, documentation on hover, jump-to-
definition, an outline of your procedures, and error checking — including a
real compile run by NetLogo itself.

Works with `.nls`, `.nlogo`, `.nlogo3d`, `.nlogox` and `.nlogox3d` files.

Current version: **0.2.2**. Not on the VS Code Marketplace yet — it is
installed from a `.vsix` file (see below).

---

## Why you might want it

The NetLogo editor gives you syntax colouring and a **Check** button. That is
fine for a small model in one file. It gets thin once a model is split across
many `.nls` files with `__includes`, because nothing follows you across files:
you cannot ask "where is this procedure defined?", you cannot see what
arguments it takes without scrolling to find it, and a typo is only found when
you press Check.

This extension answers those questions while you type, in the editor, without
switching to NetLogo.

---

## Installing

### 1. Install Visual Studio Code

Free, from <https://code.visualstudio.com/>. It is a text editor — it does not
replace NetLogo. You still run models in NetLogo itself.

### 2. Install the extension from the `.vsix` file

A `.vsix` is a single-file extension package. You will be given one named
`netlogo-intellisense-0.2.2.vsix`.

**From the VS Code window:**

1. Open the Extensions view — `Ctrl+Shift+X` (`Cmd+Shift+X` on macOS), or the
   square-blocks icon in the left bar.
2. Click the `...` menu at the top of that panel.
3. Choose **Install from VSIX...** and pick the file.
4. Reload the window if prompted.

**Or from a terminal:**

```
code --install-extension netlogo-intellisense-0.2.2.vsix
```

To confirm it worked: search for "NetLogo" in the Extensions view; it should
appear under *Installed*.

### 3. Open the model's **folder**, not just one file

`File > Open Folder...` and pick the folder your model lives in — for ASSOEC,
the repository root. This matters: the extension reads every NetLogo file in
the open folder so it can follow `__includes` and offer symbols from other
files. If you open a single `.nls` on its own, it only sees that one file.

(The ASSOEC repository recommends this extension in `.vscode/extensions.json`,
so opening that folder will offer to install it for you.)

### 4. Optional: point it at your NetLogo installation

For the "compile with the real NetLogo compiler" feature you need NetLogo
desktop installed. The extension looks for it automatically in the usual
places (`C:\Program Files\NetLogo *` on Windows, `/Applications/NetLogo *` on
macOS, `/opt` and `/usr/local` on Linux). If yours is somewhere else, set
`netlogo.compile.netLogoDirectory` — see [Settings](#settings).

Everything except compiling works without NetLogo installed.

---

## If you have never used an IDE before, start here

"IntelliSense" is Microsoft's name for a bundle of editor features that read
your code and answer questions about it. None of them change your file on
their own — they only show information, or insert something when you
explicitly accept it. If a popup is in your way, press `Esc`.

Here is the whole set, with what it looks like in a NetLogo file.

### Autocomplete — `Ctrl+Space`

Start typing `hatch` and a list appears with `hatch`, `hatch-sheep`,
`hatchling-energy`, and so on. It suggests:

- built-in NetLogo primitives (the whole dictionary),
- your own procedures, globals, breed variables and `-own` variables,
- `let` variables and procedure parameters, *inside the procedure they belong to*,
- primitives your breeds generate (`sheep-here`, `create-wolves`, `is-sheep?`…),
- primitives from extensions your model actually declares (`table:get`, `nw:…`),
- globals created by interface widgets — sliders, switches, choosers, inputs.

The list is ranked: local variables first, then things that fit the agent
context you appear to be in, then your procedures, then breed primitives,
extensions, and built-ins last.

`Enter` or `Tab` accepts the highlighted suggestion. `Esc` dismisses the list.
Arrow keys move through it. It usually appears by itself as you type;
`Ctrl+Space` asks for it on demand.

### Documentation on hover — just point at a word

Rest the mouse over `sprout` and you get the official NetLogo dictionary
entry: the syntax forms, the description, an example, the NetLogo version it
was added in, and a link to the dictionary page. Hover over one of your own
procedures and you get its header and the comment above it.

That last part is worth exploiting: a comment written directly above a
procedure becomes its documentation everywhere it is used. See
[Comment patterns](#comment-patterns).

Keyboard equivalent: `Ctrl+K Ctrl+I`.

### Signature help — `Ctrl+Shift+Space`

While you are typing arguments to a procedure, a small bar shows the
procedure's parameters with the one you are currently on in bold. NetLogo does
not use parentheses around arguments, so this is counted positionally — it
tells you "you are on argument 2 of 3".

### Go to definition — `F12`, or `Ctrl+Click` the name

Jumps straight to where a procedure or variable is defined, in whichever file
that is.

- `Alt+F12` — **Peek Definition**: shows the definition inline without leaving
  your place.
- `Alt+←` (`Ctrl+-` on macOS) — go back to where you were. This is the one
  people forget; it makes jumping around safe.

### Find all references — `Shift+F12`

Every place a procedure or variable is used, across all your files, in one
list. Useful before renaming or deleting something.

### Outline / go to symbol — `Ctrl+Shift+O`

Type `Ctrl+Shift+O` and you get a searchable list of every procedure in the
file — start typing a name to filter, `Enter` to jump. The same list is
available permanently in the **Outline** section at the bottom of the file
explorer panel.

### Problems — `Ctrl+Shift+M`

A panel listing everything wrong with the model. `F8` jumps to the next
problem, `Shift+F8` the previous. Problems also appear as squiggly underlines
in the file and as counts in the status bar. See
[Error checking](#error-checking) for what it checks.

### Folding — collapse the bits you are not working on

Click the small arrow in the gutter next to a line number, or `Ctrl+Shift+[`
to fold and `Ctrl+Shift+]` to unfold. This extension folds `to ... end`
procedures, multi-line bracket blocks, runs of comment lines, and sections you
mark yourself with `;#region` comments — see
[Comment patterns](#comment-patterns).

### Quick reference

| What | Windows / Linux | macOS |
| --- | --- | --- |
| Trigger autocomplete | `Ctrl+Space` | `Ctrl+Space` |
| Accept suggestion | `Enter` or `Tab` | `Enter` or `Tab` |
| Dismiss popup | `Esc` | `Esc` |
| Show documentation | hover, or `Ctrl+K Ctrl+I` | hover, or `Cmd+K Cmd+I` |
| Signature help | `Ctrl+Shift+Space` | `Cmd+Shift+Space` |
| Go to definition | `F12` / `Ctrl+Click` | `F12` / `Cmd+Click` |
| Peek definition | `Alt+F12` | `Opt+F12` |
| Go back | `Alt+←` | `Ctrl+-` |
| Find all references | `Shift+F12` | `Shift+F12` |
| Go to procedure in file | `Ctrl+Shift+O` | `Cmd+Shift+O` |
| Problems panel | `Ctrl+Shift+M` | `Cmd+Shift+M` |
| Next / previous problem | `F8` / `Shift+F8` | `F8` / `Shift+F8` |
| Command palette | `Ctrl+Shift+P` | `Cmd+Shift+P` |
| Comment / uncomment lines | `Ctrl+/` | `Cmd+/` |

The **command palette** (`Ctrl+Shift+P`) is worth remembering on its own: it
searches every command VS Code knows. Type "netlogo" there to find this
extension's commands.

---

## Comment patterns

NetLogo has one comment character, `;`, and everything after it on the line is
ignored. That is all NetLogo does with comments. This extension reads a little
more out of them — nothing you have to adopt, but two patterns are worth
knowing because they pay you back immediately.

`Ctrl+/` (`Cmd+/`) toggles `;` on the selected lines, so turning a block into
comments and back is one keystroke.

### Documentation comments — the lines above a definition

Comment lines immediately above a `to`, `to-report`, `breed` or link-breed
declaration are collected and shown as that symbol's documentation: on hover,
in the autocomplete list, and in signature help. So a comment written once,
where the procedure is defined, follows the procedure everywhere it is called.

```netlogo
; Move every sheep one step in its current heading, spending energy in
; proportion to the distance moved. Sheep that run out of energy die.
to move-sheep
  ...
end
```

Hovering over `move-sheep` anywhere in the model — in another `.nls` file, in
a caller three files away — now shows that text along with the header.

The rules, precisely:

- Only lines *directly* above the declaration count. The block ends at the
  first line that is neither a comment nor blank.
- One blank line is allowed inside the block, so a comment paragraph can be
  split. A second consecutive blank line ends it.
- Leading semicolons and one following space are stripped, so `;`, `;;` and
  `;;;` all work and read the same in the popup.
- The text is rendered as Markdown, so `` `backticks` `` and `*emphasis*`
  work if you want them.
- Globals, breed variables and `-own` variables do **not** pick up doc
  comments — only procedures, reporters and breed declarations do.

Conventional NetLogo house style uses `;;` for standalone comment lines and a
single `;` for trailing comments. Either works here; pick one and be
consistent.

### Region markers — `;#region` / `;#endregion`

A pair of marker comments makes an arbitrary stretch of a file foldable as one
named block. Useful in long `.nls` files where the natural unit is a group of
procedures rather than a single one.

```netlogo
;#region Sheep behaviour

to move-sheep
  ...
end

to eat-grass
  ...
end

;#endregion
```

Fold or unfold it with the arrow in the gutter, or collapse every region in
the file at once with `Ctrl+K Ctrl+8` (`Cmd+K Cmd+8`); `Ctrl+K Ctrl+9` unfolds
everything again. The name after `#region` is for you reading the file — VS
Code does not display it while folded, so keep it on the marker line where it
is visible when expanded.

- Regions nest; an inner region folds inside an outer one.
- Any number of leading semicolons works: `;#region`, `;; #region`,
  `;;; # region` are all matched, case-insensitively.
- A `;#region` with no matching `;#endregion` simply folds nothing.

### Runs of comment lines fold on their own

Two or more consecutive comment lines fold as a block, so a long file header
or a big explanatory paragraph can be collapsed out of the way without any
markers. Region marker lines are excluded from this, so they stay visible.

### Comments are invisible to the checkers

Everything after a `;` is stripped before the as-you-type checks run. Commented-
out code with unbalanced brackets or references to procedures you deleted will
not produce warnings — the same as in NetLogo itself. Section-divider comments
full of `;;;;;;;;;;;;;;;;` are likewise harmless.

### A layout that works well

Nothing enforces this, but a file organised like the following gets the most
out of the extension: the outline (`Ctrl+Shift+O`) stays readable, regions let
you collapse to a table of contents, and every procedure carries its
explanation to the places it is called from.

```netlogo
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Sheep behaviour
;;
;; Movement, feeding and death for the sheep breed. Called once per tick
;; from `go` in the main model file.
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;#region Movement

;; Move every sheep one step in its current heading, spending energy in
;; proportion to the distance moved.
to move-sheep
  ask sheep [
    fd 1                  ; energy cost is applied in `spend-energy`
    spend-energy 1
  ]
end

;#endregion
```

---

## Error checking

Two layers, deliberately different in speed and in how much they know.

### As you type (fast, approximate)

- **Bracket balance** — unclosed `[`, stray `]`, `(` closed by `]`.
- **Duplicate procedures** — the same procedure defined twice in files that are
  loaded together, with a pointer to the other definition.
- **Undefined names** — anything that is not a primitive, not one of your
  symbols, and not generated by a breed or a declared extension. Reported as a
  *warning*, not an error, because it is a heuristic.

Argument counts are deliberately **not** checked here — getting that right
needs to know the arity of every reporter in the expression, and guessing
produces noise. The real compiler reports them correctly.

### On save (slow, authoritative)

When you save, the extension runs the actual NetLogo compiler over the model
in the background and reports exactly what NetLogo would report, mapped back
to the right file and the right line — including errors in `.nls` files, which
NetLogo itself reports as a character offset you would otherwise have to count
to.

A status bar item on the left shows progress: *compiling* → *compiles*, or a
count of compile errors.

Things worth knowing:

- It compiles the **model**, not the file. If you are editing an `.nls`, it
  finds the `.nlogo`/`.nlogox` whose `__includes` chain reaches it, and
  compiles that. An `.nls` no model includes cannot be compiled — you will be
  told so.
- It takes a few seconds, because it starts a JVM. That is why it runs on save
  rather than on every keystroke.
- You can also run it on demand: `Ctrl+Shift+P` → **NetLogo: Compile Model**.
  Run this way it also reports success, so it doubles as "is the model
  currently OK?".
- Saving again while a compile is running cancels the old one.

---

## Settings

`File > Preferences > Settings` (`Ctrl+,`), then search for "netlogo". Or edit
`.vscode/settings.json` in your project directly.

| Setting | Default | What it does |
| --- | --- | --- |
| `netlogo.diagnostics.enabled` | `true` | Fast in-editor checks as you type. |
| `netlogo.diagnostics.undefinedNames` | `true` | The "nothing named X" warning. **Turn this off if you get false warnings** from names an extension or breed generates that the extension does not know about. |
| `netlogo.compile.enabled` | `true` | Use the real NetLogo compiler at all. |
| `netlogo.compile.onSave` | `true` | Compile on every save. Set to `false` if it is too slow for your model; the command palette still works. |
| `netlogo.compile.netLogoDirectory` | `""` | Path to your NetLogo installation, e.g. `C:\Program Files\NetLogo 6.4.0`. Empty means auto-detect. |
| `netlogo.compile.timeoutSeconds` | `120` | Give up on the compiler after this long. Raise it for very large models. |

---

## File types

| Extension | Syntax colouring | Completion, hover, navigation | Compile |
| --- | --- | --- | --- |
| `.nls` | NetLogo | yes | via the model that includes it |
| `.nlogo`, `.nlogo3d` | NetLogo (code section only) | yes | yes |
| `.nlogox`, `.nlogox3d` | XML — see below | yes | yes |

`.nlogox` is NetLogo 7's XML format, with the code inside a `<code><![CDATA[
... ]]></code>` block. Those files keep VS Code's XML language mode, so
colouring inside the code block is XML colouring rather than NetLogo's. Every
other feature works normally there; symbol positions are mapped onto the real
lines of the file. Widget and info sections are never treated as code.

---

## Known limitations

Worth reading before you file a bug — these are known and mostly deliberate.

- **Keyword highlighting** does not distinguish a standalone keyword from the
  same letters inside a longer variable name.
- **Agent context** (turtle / patch / observer / link) is inferred
  heuristically and used only to *rank* completions, never to hide anything.
  It resets at procedure boundaries and does not follow calls into other
  procedures.
- **Argument counts** are not checked as you type; the compiler check on save
  catches them.
- **Extension primitives** come from a hand-maintained catalog: `table`, `csv`,
  `profiler`, `rnd`, `matrix`, `array`, `nw`, `gis`, `time`, `palette`,
  `sound`, `bitmap`, `py`, `ls`. An extension outside that list is never
  flagged as undefined, but its primitives are not offered in completion
  either.
- **No rename-symbol, no workspace-wide symbol search, no auto-format** yet.

[`PLANS.md`](PLANS.md) has the full state-of-play and the roadmap.

---

## Troubleshooting

**Nothing happens — no completion, no colours.**
Check you opened the *folder* rather than a single file, and that the file has
one of the extensions listed above. Then check the extension is installed and
enabled in the Extensions view (`Ctrl+Shift+X`).

**Lots of "Nothing named X has been defined" warnings.**
Usually an extension whose primitives are not in the catalog, or names
generated in a way the parser does not follow. Set
`netlogo.diagnostics.undefinedNames` to `false` and tell me which names
triggered it — that is a useful bug report.

**"Could not find a NetLogo installation."**
Set `netlogo.compile.netLogoDirectory` to your NetLogo folder — the one
containing the `app` folder, e.g. `C:\Program Files\NetLogo 6.4.0`.

**Compiling is slow or times out.**
Raise `netlogo.compile.timeoutSeconds`, or set `netlogo.compile.onSave` to
`false` and compile on demand from the command palette.

**Completion does not know about a procedure in another file.**
It resolves `__includes` the way NetLogo does, relative to the model. If the
file is not reachable from a model's include chain, it is not in scope.

---

## Feedback and feature requests

This is an early version being shared for testing — please break it and say
what broke.

Open an issue at
<https://github.com/CezaraPastrav/netlogo-intellisense/issues>, or send me a
message. Helpful to include:

- what you were doing and what you expected instead,
- the file type (`.nls`, `.nlogo`, `.nlogox`) and your NetLogo version,
- a small snippet that reproduces it, or a screenshot,
- for wrong warnings: the exact name it complained about.

Feature requests are welcome too — check [`PLANS.md`](PLANS.md) first to see
whether it is already on the list, and say so if you want something on it
prioritised.

---

## Building from source

Requires Node.js 18+.

```
npm install
npm run compile        # or: npm run watch
```

Press `F5` in VS Code to launch an Extension Development Host — a second VS
Code window with the extension loaded from source, for trying changes.

To build an installable package:

```
npm run package        # produces netlogo-intellisense-<version>.vsix
```

The NetLogo dictionary data in `src/dictionary.ts` is generated by
`tools/generate-dictionary.js` from the official documentation; it is checked
in, so you only need to re-run it when the dictionary changes.

---

MIT licensed. NetLogo itself is a separate project by the CCL at Northwestern
University — this extension is not affiliated with it.
