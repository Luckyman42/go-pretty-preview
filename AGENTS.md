# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Read this before making changes. It describes what the project is, how it is wired together, the conventions to follow, and how to add the most common kind of change — a new preview rule.

---

## What this project is

`go-pretty-preview` is a VS Code extension that renders a **read-only, simplified preview** of Go source files to make code review — especially of AI-generated Go — faster. It never modifies the user's file; it only changes how the code is *displayed* in a side panel.

The core idea: a **pipeline of transformers** annotates and rewrites a list of line descriptors derived from the parsed Go source, the result is syntax-highlighted using **tree-sitter highlight queries**, and the HTML is pushed into a webview that bridges back to the language server (gopls) for navigation, hover, and diagnostics.

---

## Architecture at a glance

```
.go file
   │
   ▼
GoParser.parse()  ←── single source tree, shared by ALL transformers
   │
   ▼
runTransformers(descriptors, tree)   ← src/core/transformers/index.ts
   │  each transformer annotates / rewrites the LineDescriptor list
   ▼
materialize(descriptors)
   │  → code (string), lineMap, fadedLines, collapsedLines, colMaps
   │
   ▼
GoParser.parse(code)   ← parse the OUTPUT once for highlighting
   │
   ├──▶ GoHighlighter.render()       ← tree-sitter captures → HTML spans
   │      every span carries data-sl/data-sc (exact source position)
   │
   └──▶ buildPackageDecorations()    ← column-level pkg-faded ranges
   │
   ▼
webview (media/preview.js)
   │  receives: html, lineMap, fadedLines, collapsedLines, colMaps, theme
   │
   └──▶ gopls bridge: navigate / definition / hover / diagnostics
          positions come from data-sl/data-sc attributes, no DOM walking
```

### Key files

| File | Responsibility |
|---|---|
| `src/vscode/extension.ts` | `activate()` — registers commands and workspace/editor/config listeners |
| `src/vscode/GoPreviewProvider.ts` | Owns the `WebviewPanel`. Runs the full pipeline, posts updates, handles webview→host messages (navigate / definition / hover) and diagnostics. Holds the async generation counter that prevents stale updates from landing. |
| `src/vscode/ParserService.ts` | Thin vscode wrapper around `GoParser`: supplies `__dirname` as `wasmDir` and logs to an OutputChannel |
| `src/core/parser.ts` | `GoParser` — vscode-free, injectable `wasmDir`. Also exports `parseGo()` for use in tests or scripts |
| `src/core/descriptors.ts` | `LineDescriptor` model, `descriptorsFromSource()`, `materialize()`, `LineBuilder` (per-column source maps) |
| `src/core/astUtils.ts` | ERROR-subtree helpers (`isErrorNode`, `containsError`, `blockStatements`, `blockHasCommentOnRow`) |
| `src/core/goHighlights.ts` | Inlined Go tree-sitter highlight query (`.scm` as a string) |
| `src/core/highlighter.ts` | `GoHighlighter` — tree-sitter `Query.captures()` → HTML with `data-sl`/`data-sc` per span |
| `src/core/transformers/types.ts` | `Transformer` interface: `transform(descriptors, tree, configValue) → descriptors` |
| `src/core/transformers/index.ts` | `runTransformers()` — iterates transformers over one shared source tree, no intermediate re-parses |
| `src/core/transformers/inlineOneLineIf.ts` | Collapses single-statement `if`/`else` chain branches |
| `src/core/transformers/logVisibility.ts` | Fades / hides / highlights `slog.*` lines |
| `src/core/decorations/types.ts` | `DecorationProvider` interface for column-level effects |
| `src/core/decorations/packageDecorations.ts` | `buildPackageDecorations()` — dims configured package qualifiers; config passed in, not read internally |
| `media/preview.js` | Webview script: renders HTML, applies line decorations, wires hover/click/scroll via `data-sl`/`data-sc` |
| `media/preview.css` | Webview styles — two custom syntax palettes (dark/light), `brace-faded`, `pkg-faded`, diagnostics, line decorations |

---

## The `src/core/` vs `src/vscode/` split

Everything under `src/core/` has **no `import * as vscode`**. It is pure TypeScript — parser, transformers, descriptor model, highlighter. This makes it runnable and testable without a VS Code mock.

`src/vscode/` is the thin integration layer: it reads configuration, supplies `__dirname` for the WASM path, owns the webview panel, and calls into the gopls bridge. Every vscode-specific input (config values, WASM directory, logger) is injected into `core/` as a parameter.

---

## The descriptor model

Instead of repeatedly rewriting a source string and re-parsing after every transformer, the pipeline works on a list of `LineDescriptor` objects:

```ts
interface LineDescriptor {
  sourceLine: number;   // 0-based source row this output line maps to
  text: string;         // the rendered text for this line
  faded?: boolean;      // render dimmed
  highlighted?: boolean;
  collapsed?: boolean;  // this line was reflowed from multiple source lines
  colMap?: SourcePos[]; // colMap[outputCol] = { line, col } in source
                        // only set on reflowed lines; otherwise 1:1
}
```

`descriptorsFromSource(source)` creates the initial 1:1 list. Transformers annotate or rewrite it. `materialize(descriptors)` flattens it into the shapes the provider and webview consume (`code`, `lineMap`, index sets, `colMaps`).

The **`lineMap` and faded/collapsed sets are derived automatically** from the descriptor fields — no manual composition needed.

---

## The `Transformer` interface

```ts
interface Transformer {
  readonly id: string;
  readonly label: string;
  readonly alwaysRun?: boolean;
  transform(input: LineDescriptor[], tree: Tree | null, configValue?: unknown): LineDescriptor[];
}
```

Key points:

- **Input and output are both `LineDescriptor[]`.** The transformer receives the current descriptor list (already processed by earlier transformers) and returns a new one.
- **`tree` is the AST of the original source**, parsed once before any transformer runs. Node row/column positions are always in original-source coordinates.
- **`configValue`** is the raw value of `goPreview.rules.<id>` read by `runTransformers` before calling the transformer. Keep `vscode.workspace.getConfiguration` calls out of `transform()` so transformers remain pure and testable.
- Use **`alwaysRun = true`** only for transformers that read their own enum/array config and decide internally (like `logVisibility`). Boolean-gated transformers omit it.

---

## The two ways a rule can change the preview

1. **Text reflow** (e.g. `inlineOneLineIf`) — merges several source lines into one output descriptor. Set `collapsed: true` and fill in a `colMap` (use `LineBuilder`) so hover and go-to-definition resolve correctly on the merged line.

2. **Annotation** — leaves descriptors otherwise intact but sets `faded: true`, `highlighted: true`, or removes a descriptor (`hide` mode in `logVisibility`). These don't touch the text, so no `colMap` is needed.

Column-level effects (e.g. package-qualifier fading) live in a `DecorationProvider` (`src/core/decorations/types.ts`), which receives the materialized output code and its tree. They run after `materialize()`, not inside the transformer pipeline.

When adding a rule, **pick the lightest mechanism**: annotation over reflow, decoration over annotation, when the effect doesn't require changing line structure.

---

## Adding a new transformer

1. **Create `src/core/transformers/yourRule.ts`** implementing `Transformer`.  
   - Iterate `input: LineDescriptor[]`. For each descriptor, read `d.sourceLine` to look up AST nodes by row.
   - Return a new array (or the same if nothing changed). Never mutate in place.
   - Guard against ERROR subtrees with `isErrorNode` / `containsError` from `src/core/astUtils.ts`.

2. **Register it in `src/core/transformers/index.ts`** in the correct position. Order matters: `LogVisibility` runs before `InlineOneLineIf` so hidden log lines don't prevent if-collapsing.

3. **Add a config entry in `package.json`** under `contributes.configuration.properties`:
   - The key must be `goPreview.rules.<transformer.id>`.
   - `runTransformers` calls `getConfig(transformer.id)` and passes the result as `configValue`.

4. **Add any CSS** to `media/preview.css` for new classes you reference. Line-level classes are applied in `media/preview.js` via `applyLineDecorations()`.

5. **Update the README** Settings table and feature list.

---

## WASM and tree management

- `GoParser.parse()` returns a `Tree` that lives on the **WASM heap** — it is NOT garbage-collected.
- **Every `Tree` returned by `parse()` must be freed with `tree.delete()`** when you are done with it.
- `GoPreviewProvider.pushUpdate()` frees both the source tree (after `runTransformers`) and the output tree (after `render()`) in `try/finally` blocks. Follow this pattern if you introduce another parse call.

---

## Conventions

- **TypeScript strict mode is on.** No `any` without a comment explaining why.
- **No comments that restate the code.** Comment the *why*, not the *what*.
- **Match the surrounding style** — small pure functions, early returns.
- **`src/core/` must stay vscode-free.** If you find yourself writing `import * as vscode` in a core file, move the vscode-specific part to `src/vscode/`.
- **Theme through variables.** Never hard-code colors in CSS; use `--vscode-*` variables with a sensible fallback. The two syntax palettes in `preview.css` use `body.theme-dark` / `body.theme-light` class selectors — follow that pattern for new token classes.
- **Webview security:** the CSP allows only the nonce'd script and `cspSource` styles. Don't introduce inline scripts, remote resources, or new `localResourceRoots` without a reason.
- **Commit/PR style:** `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`. One focused change per PR.

---

## Build, run, verify

```bash
npm install
npm run build         # esbuild bundle → out/extension.js + .wasm copies
npm run watch         # rebuild on change
npm run typecheck     # tsc --noEmit — always run before committing
npm run lint          # eslint src
# Press F5 in VS Code to launch the Extension Development Host
```

> ⚠️ `npm run build` (esbuild) does **not** type-check. Always run `npm run typecheck` before considering a change done. There is currently no automated test suite — verify rules by hand in the Extension Development Host. If you add tests, wire them into `package.json` scripts and `.github/workflows/ci.yml`.

### Manual verification checklist for a rule change

- Open a `.go` file, open the preview (`Ctrl+K V`), confirm the rule renders as intended.
- Toggle the rule's setting off → preview reverts; on → reapplies (settings changes re-render live).
- Double-click a line — it should jump to the **correct source line** (validates `sourceLine` in your descriptors).
- Ctrl+click a symbol and hover it on both a normal line and a collapsed line — confirm definition/hover resolve to the right position.
- Try a file with `slog.*` calls and `if/else` chains together to confirm transformers compose correctly.
- Check both a dark and a light color theme.

---

## Gotchas / sharp edges

- **`sourceLine` is the #1 source of subtle bugs.** If navigation or diagnostics land on the wrong line, a descriptor has the wrong `sourceLine`. The source line numbers shown in the preview gutter make this visually obvious during testing.
- **`colMap` on reflowed lines.** A collapsed `if err != nil { return err }` line spans multiple source rows; without `colMap`, all columns would map to the header row. Always use `LineBuilder` when merging source lines so hover/definition resolve correctly anywhere on the collapsed line.
- **ERROR subtrees during live editing.** The source is frequently half-valid while typing. Guard bejárások with `isErrorNode` / `containsError` to skip unparseable regions rather than bailing on the whole file.
- **Config reads outside `transform()`.** `runTransformers` reads config and passes it as `configValue`. Reading `vscode.workspace.getConfiguration` inside `transform()` would make the transformer untestable — keep the core layer vscode-free.
- **Async generation counter.** `GoPreviewProvider` increments `updateGeneration` at the start of each `pushUpdate`. After every `await`, check `gen !== this.updateGeneration` before writing shared state — otherwise a stale async update can clobber the current document's data.
