# Contributing to Go Pretty Preview

Thanks for your interest! Contributions of all kinds are welcome — new preview rules, bug fixes, docs improvements, or feedback via issues.

## Getting started

```bash
git clone https://github.com/Luckyman42/go-pretty-preview.git
cd go-pretty-preview
npm install
```

Press `F5` in VS Code to open an **Extension Development Host** — a separate VS Code window with the extension loaded live. Changes take effect after `npm run build` (or `npm run watch` for continuous rebuild).

## Project layout

```
src/
  core/                        vscode-free — pure logic, no editor APIs
    parser.ts                  GoParser (injectable wasmDir) + parseGo() test helper
    descriptors.ts             LineDescriptor model, materialize(), LineBuilder
    astUtils.ts                Helpers for degrading gracefully on syntax errors
    transformers/
      types.ts                 Transformer interface
      index.ts                 Runs all enabled transformers over a shared source tree
      previewRules.ts          Regexp-based protect / highlight / hide / fade
      inlineOneLineIf.ts       Collapses single-statement if/else chains
  vscode/                      VS Code integration layer
    extension.ts               Entry point (activate)
    GoPreviewProvider.ts       Side-by-side and preview-only panel
    GoPreviewCustomEditorProvider.ts  "Open With" custom editor
    ParserService.ts           vscode wrapper around core GoParser
    previewUtils.ts            buildShell, buildHoverHtml, sendDiagnostics
  __tests__/                   Vitest unit tests (no VS Code dependency)
media/                         Webview CSS and JS
```

## Adding a new preview rule

The most common contribution is a new **transformer** — a class that rewrites a `LineDescriptor[]` before it reaches the syntax highlighter.

1. Create `src/core/transformers/yourRuleName.ts` implementing the `Transformer` interface from `types.ts`
2. Register it in `src/core/transformers/index.ts`
3. Add a `goPreview.rules.yourRuleName` setting in `package.json` so users can toggle it
4. Add tests in `src/__tests__/yourRuleName.test.ts`
5. Document it in `README.md`

The existing transformers (`previewRules.ts`, `inlineOneLineIf.ts`) are the best reference. The key design rule: **keep transformer logic pure** — `LineDescriptor[]` in, `LineDescriptor[]` out, no editor APIs.

## Pull request guidelines

- Keep PRs focused — one feature or fix per PR
- Run `npm test` and `npm run build` before opening a PR; both must pass
- Add or update the relevant section in `README.md` if your change is user-visible
- PR title format: `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`

## Reporting bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template and include:
- The Go code snippet that produces the wrong output (a minimal example is ideal)
- What the preview shows vs. what you expected
- VS Code version and OS

## Suggesting new rules

Open a [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue describing:
- The Go pattern you want simplified
- How you'd expect it to look in the preview
- Why it improves readability

## Code style

- TypeScript strict mode is on — no `any` without a comment explaining why
- No comments that just restate what the code does
- Keep transformer logic pure (`LineDescriptor[]` in, `LineDescriptor[]` out); side effects live in the `vscode/` layer
