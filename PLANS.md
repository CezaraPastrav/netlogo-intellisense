# NetLogo IntelliSense - Plans

## Current State (v0.2.0)

Working:

- Completion for built-in primitives, user symbols, locals (`let`, parameters,
  anonymous-procedure arguments), breed-generated primitives, and extension
  primitives for the extensions the model declares
- Hover documentation from the official NetLogo dictionary: syntax forms,
  description, example, `since` version, and a link to the dictionary entry
- Signature help for user procedures and built-ins, counting NetLogo's
  parenthesis-free positional arguments
- Go-to-definition, find-all-references, document outline
- `__includes` resolution, model-relative as NetLogo does it
- `.nlogox` support: code extracted from the `<code>` CDATA block, symbol
  locations offset onto real file lines
- Globals declared by interface widgets (sliders, switches, choosers, inputs),
  in both `.nlogox` and legacy `.nlogo`
- Diagnostics: bracket balance, duplicate procedures, undefined names as you
  type; the real NetLogo compiler on save, with errors mapped back to the
  right file and line
- Snippets
- TextMate grammar

## Known Limitations

- **Keyword highlighting** does not distinguish standalone keywords from
  keywords embedded in variable names. Low priority.
- **Agent context** is inferred heuristically and used only to rank
  completions, never to filter them. It resets at procedure boundaries and
  cannot follow calls into other procedures.
- **Argument counts** are not checked statically - that needs the arity of
  every reporter in the expression. The real compiler reports these correctly.
- **`.nlogox` editing** keeps the XML language id, so NetLogo syntax
  highlighting does not apply inside the `<code>` block. Completion, hover and
  navigation do work there.
- **Extension primitives** are a curated catalog (table, csv, profiler, rnd,
  matrix, array, nw, gis, time, palette, sound, bitmap, py, ls). Primitives
  from an extension with no catalog are never reported as undefined, but are
  not offered in completion either.

## Future Work

### Editor experience
- Rename symbol across files
- Workspace symbol search (Ctrl+T)
- Code folding for `to ... end` and declaration blocks
- Auto-indent and format-on-save
- Colour global, breed-own and local variables differently

### Deeper analysis
- Follow calls to propagate agent context between procedures
- Context-aware *filtering* once inference is trustworthy enough
- Warn on unused globals and unreachable procedures
- Understand `extensions` well enough to catalog them automatically

### Diagnostics
- Incremental compile so the check can run more often than on save
- Surface BehaviorSpace experiment errors
- Quick fixes for the common compile errors

### Packaging
- Publish to the VS Code Marketplace
