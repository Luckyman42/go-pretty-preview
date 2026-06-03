# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Read this before making changes. It describes what the project is, how it is wired together, the conventions to follow, and how to add the most common kind of change — a new preview rule.

---

## What this project is

`go-pretty-preview` is a VS Code extension that renders a **read-only, simplified preview** of Go source files to make code review — especially of AI-generated Go — faster. It never modifies the user's file; it only changes how the code is *displayed* in a side panel.

The core idea: a **pipeline of transformers** rewrites and/or annotates the Go source text, the result is syntax-highlighted with Shiki, and the HTML is pushed into a webview that also bridges back to the language server (gopls) for navigation, hover, and diagnostics.

---

## Architecture at a glance

```
.go file ──▶ runTransformers(source) ──▶ Shiki highlight ──▶ webview HTML
              │  (src/transformers)        + package          (media/preview.js)
              │                              decorations            │
              ▼                                                     ▼
   { code, lineMap, fadedLineIndices,                      gopls bridge:
     highlightedLineIndices, ... }                         navigate / definition /
              │                                            hover / diagnostics
              └── lineMap keeps preview lines ◀───────────▶ source lines
```

### Key files

| File | Responsibility |
|---|---|
| [src/extension.ts](src/extension.ts) | `activate()` — registers the command and the workspace/editor/config listeners that drive re-renders |
| [src/GoPreviewProvider.ts](src/GoPreviewProvider.ts) | Owns the `WebviewPanel`. Runs the pipeline, highlights with Shiki, posts updates, and handles webview→host messages (navigate / definition / hover) and diagnostics |
| [src/transformers/index.ts](src/transformers/index.ts) | `runTransformers()` — runs each enabled transformer in order and **composes the line maps** so the final `lineMap[previewLine] → sourceLine` is correct |
| [src/transformers/types.ts](src/transformers/types.ts) | `Transformer` interface and `TransformOutput` shape |
| [src/transformers/inlineOneLineIf.ts](src/transformers/inlineOneLineIf.ts) | Collapses single-statement `if`/`else` chains |
| [src/transformers/logVisibility.ts](src/transformers/logVisibility.ts) | Fades / hides / highlights `slog.*` lines |
| [src/packageDecorations.ts](src/packageDecorations.ts) | Builds Shiki token-level decorations to dim configured package qualifiers (this is **not** a `Transformer` — it runs after highlighting) |
| [media/preview.js](media/preview.js) | Webview script: applies the HTML, line decorations, and wires double-click / ctrl+click / hover / diagnostics |
| [media/preview.css](media/preview.css) | Webview styles, all driven by `--vscode-*` theme variables |

### The two ways a rule can change the preview

1. **Source-text transform** — rewrites the Go text before highlighting (e.g. `inlineOneLineIf`, `logVisibility` in `hide` mode). These change line structure, so they **must** return a correct `lineMap`.
2. **Decoration** — leaves the text intact but marks lines or tokens for styling:
   - **Line-level**: return line indices in `fadedLineIndices` / `highlightedLineIndices`; the webview adds a CSS class to that line.
   - **Token-level**: emit Shiki decorations (see `packageDecorations.ts`) that wrap a character range in a class.

When adding a rule, pick the lightest mechanism that achieves the effect. Prefer decorations over text rewriting when you don't need to change line structure — they can't desync the line map.

---

## The `TransformOutput` contract

```ts
interface TransformOutput {
  code: string;                          // possibly-rewritten source
  collapsedLineIndices: Set<number>;     // output lines that were collapsed
  fadedLineIndices: Set<number>;         // output lines to render dimmed
  highlightedLineIndices: Set<number>;   // output lines to render highlighted
  lineMap: number[];                     // lineMap[outputLine] = sourceLine (0-based)
}
```

Rules to respect:

- **`lineMap` is mandatory and must be exact.** Every entry in the returned `code` needs a `lineMap` entry pointing at the source line it came from. `runTransformers` composes maps across transformers; a wrong map breaks navigation, hover, and diagnostics alignment.
- **All index sets are 0-based and refer to lines in *this transformer's output*,** not the original source. `runTransformers` translates them through the composed map.
- Transformers must be **pure**: `(source: string) => TransformOutput`. No VS Code side effects inside `transform()`. Reading configuration via `vscode.workspace.getConfiguration` inside `transform()` is the current pattern (see `logVisibility.ts`), but keep it to config reads only.
- Ordering matters and is currently encoded by array position in `index.ts` (`LogVisibilityTransformer` runs before `InlineOneLineIfTransformer`, because hiding a log line can turn a multi-statement block into a single-statement one). If you add a transformer with ordering needs, document it next to its registration.

---

## Adding a new transformer (the common task)

1. Create `src/transformers/yourRule.ts` implementing `Transformer`. Return a complete `TransformOutput` (don't forget `lineMap`, even if it's the identity map `source.split('\n').map((_, i) => i)`).
2. Register it in `src/transformers/index.ts` in the right position.
3. Add a `goPreview.rules.yourRule` setting in `package.json` under `contributes.configuration.properties`. **The setting key must equal the transformer's `id`** — `runTransformers` gates on `config.get(transformer.id)`. Use `alwaysRun = true` only for transformers that read their own enum/array config and decide internally (like `logVisibility`).
4. Add any CSS class you reference to `media/preview.css`, and apply it in `media/preview.js` if it's a line-level decoration.
5. Update the README Settings table and the feature list.

Full walkthrough: [docs/04-adding-new-rules.md](docs/04-adding-new-rules.md).

---

## Conventions

- **TypeScript strict mode is on.** No `any` without a comment explaining why.
- **No comments that restate the code.** Comment the *why*, not the *what*.
- **Match the surrounding style** — small pure functions, early returns, no clever one-liners.
- **Keep transformer logic pure;** side effects (webview messaging, gopls calls) live only in `GoPreviewProvider`.
- **Theme through variables.** Never hard-code colors in CSS; use `--vscode-*` variables with a sensible fallback, as the existing CSS does.
- **Webview security:** the CSP only allows the nonce'd script and `cspSource` styles. Don't introduce inline scripts, remote resources, or new `localResourceRoots` without a reason.
- **Commit/PR style:** `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`. One focused change per PR.

---

## Build, run, verify

```bash
npm install
npm run build         # esbuild bundle → out/extension.js
npm run watch         # rebuild on change
npm run typecheck     # tsc --noEmit (esbuild does NOT type-check — run this before committing)
# Press F5 in VS Code to launch the Extension Development Host
```

> ⚠️ `npm run build` (esbuild) does **not** type-check. Always run `npm run typecheck` before considering a change done. There is currently no automated test suite — verify rules by hand in the Extension Development Host against representative Go files. If you add tests, wire them into `package.json` scripts and the CI workflow (`.github/workflows/ci.yml`).

### Manual verification checklist for a rule change

- Open a `.go` file, open the preview, confirm the rule renders as intended.
- Toggle the rule's setting off → preview reverts; on → reapplies (settings changes re-render live).
- Double-click a line and confirm it lands on the **correct source line** (this validates your `lineMap`).
- Ctrl+click a symbol and hover it — confirm definition/hover still resolve.
- Check both a dark and a light color theme.

---

## Gotchas / current sharp edges

- **Line maps are the #1 source of subtle bugs.** If navigation/diagnostics land on the wrong line after your change, your `lineMap` is wrong. The source line number shown in the gutter makes this visually obvious during testing.
- **Block detection is mostly robust** — `inlineOneLineIf` skips braces inside `"..."`, backtick strings, and `//` line comments. Rare edge cases with multi-line strings or `/* */` block comments may still fool it.
- **`collapsedLineIndices` is computed but not forwarded to the webview** — there is no dedicated CSS class for collapsed lines. The source line number in the gutter already shows that a preview line maps to a different source location. If explicit visual marking is needed in the future, wire `collapsedLineIndices` through `pushUpdate`.
- **Column mapping on collapsed lines is approximate** — definition/hover may be slightly off on a line that was rewritten by `inlineOneLineIf` (the column is measured against the transformed text, not the source).
- **Config reads happen in `runTransformers`, not inside `transform()`** — this is intentional. It keeps transformer logic pure and vscode-free, making them unit-testable without mocking.

See [improvement.md](improvement.md) for the prioritized list of known issues and planned work.
