# Go Pretty Preview

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visualstudiocode)](https://github.com/Luckyman42/go-pretty-preview)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/Luckyman42/go-pretty-preview)](https://github.com/Luckyman42/go-pretty-preview/releases)

A VS Code extension that opens a **read-only rendered preview** of Go source files — like Markdown preview, but for Go.

It is built for **reading and reviewing Go code, especially AI-generated code**. The preview keeps your code byte-for-byte intact, but visually quiets down the repetitive, boilerplate-heavy parts (error guards, logging, package qualifiers) so the logic you actually need to review stands out. The goal is simple: **filter out the noise.**

The source editor stays fully editable; the preview is read-only and updates live as you type.

---

## Why this exists

When you review a large amount of machine-generated Go, most of the screen is taken up by patterns that are correct-by-construction and rarely the source of bugs:

```go
result, err := doSomething()
if err != nil {
    return nil, err
}
slog.Info("did something", "result", result)
```

Three of those four lines are noise for a reviewer. Go Pretty Preview renders the same code so the error guard collapses to one dim line and the log line fades away — leaving the meaningful statement visible. Nothing is deleted from disk; only the *preview* is simplified.

---

## Features

### 1. Single-statement `if` blocks → one line

Go's error-propagation pattern is readable but visually heavy across a whole file:

```go
result, err := doSomething()
if err != nil {
    return nil, err
}
```

In the preview it collapses onto a single line, letting the "happy path" stand out:

```go
result, err := doSomething()
if err != nil { return nil, err }
```

Works for **any** single-statement `if` body — not just `err != nil`:

- `return`, `break`, `continue`, assignments, single calls, etc.
- `else if` / `else` chains, where each qualifying branch is collapsed individually
- Skips the collapse if the resulting line would exceed 120 characters

Toggle with `goPreview.rules.inlineOneLineIf`.

### 2. Log-line visibility (`slog.*`)

Choose how single-line `slog.Debug/Info/Warn/Error/Log/LogAttrs(...)` calls are rendered:

| Mode | Effect |
|---|---|
| `normal` | Shown as-is (default) |
| `fade` | Dimmed (grayscale + low opacity) so the eye skips over them |
| `hide` | Removed from the preview entirely |
| `highlight` | Highlighted, to see logging coverage at a glance |

Toggle with `goPreview.rules.logVisibility`.

### 3. Package-qualifier fading

Dim the package prefix in calls like `fmt.Println` or `context.Background` so your eye lands on the function, not the package:

```jsonc
"goPreview.rules.fadePackages": ["fmt", "sync", "context"]
```

The `fmt.` part renders dimmed; `Println` stays at full contrast.

### 4. Editor-grade navigation, without leaving the preview

The preview is wired into the same language server (gopls) that powers your editor:

- **Double-click a line** → jumps to that line in the source editor
- **Ctrl/Cmd+click a symbol** → Go to Definition
- **Hover a symbol** → the gopls hover tooltip (types, docs)
- **Diagnostics** → errors/warnings from gopls are mirrored as squiggles in the preview

### 5. Theme-aware syntax highlighting

Rendering uses [Shiki](https://shiki.style/) with VS Code's `dark-plus` / `light-plus` themes and follows your active color theme automatically.

---

## Installation

### From a release (VSIX)

1. Go to the [Releases page](https://github.com/Luckyman42/go-pretty-preview/releases)
2. Download the latest `.vsix` file
3. In VS Code, open the Command Palette (`Ctrl+Shift+P`) and run **"Extensions: Install from VSIX..."**
4. Select the downloaded file

Or via the terminal:

```bash
code --install-extension go-pretty-preview-<version>.vsix
```

### Build from source

```bash
git clone https://github.com/Luckyman42/go-pretty-preview.git
cd go-pretty-preview
npm install
npm run build
```

Then press `F5` in VS Code to open an Extension Development Host with the extension loaded, or package a VSIX with `npx vsce package`.

---

## How to use

1. Open any `.go` file
2. Click the **eye icon** in the editor title bar, or run **"Go Preview: Open Preview to Side"** from the Command Palette (`Ctrl+Shift+P`)
3. The preview opens beside your source editor and updates live as you type

Set `goPreview.openByDefault` to `true` to have the preview open automatically whenever you focus a Go file.

---

## Settings

Open Settings (`Ctrl+,`) and search for **"Go Pretty Preview"**.

| Setting | Type | Default | Description |
|---|---|---|---|
| `goPreview.openByDefault` | boolean | `false` | Open the preview automatically when a Go file is activated |
| `goPreview.rules.inlineOneLineIf` | boolean | `true` | Inline one-line `if`/`else-if`/`else` blocks onto a single line |
| `goPreview.rules.logVisibility` | enum | `normal` | How `slog.*` calls render: `normal` / `fade` / `hide` / `highlight` |
| `goPreview.rules.fadePackages` | string[] | `[]` | Package names whose qualifier (e.g. `fmt.`) renders dimmed |

---

## Development

```bash
npm install        # install dependencies
npm run build      # one-shot build
npm run watch      # rebuild on change
# Press F5 in VS Code to launch the Extension Development Host
```

See [AGENTS.md](AGENTS.md) for the architecture, conventions, and a guide to adding new rules — written for both human contributors and AI coding agents. Background reading lives in [docs/](docs/):

- [01 — VS Code Extension Overview](docs/01-vscode-extension-overview.md)
- [02 — Webview & Custom Editor API](docs/02-custom-editor-api.md)
- [03 — How This Extension Works](docs/03-how-this-extension-works.md)
- [04 — Adding New Rules](docs/04-adding-new-rules.md)

---

## Project structure

```
src/
  extension.ts             Entry point — activate() wires up commands & listeners
  GoPreviewProvider.ts     Owns the webview panel, runs the pipeline, bridges to gopls
  packageDecorations.ts    Builds Shiki token decorations for package fading
  transformers/
    types.ts               Transformer interface + TransformOutput shape
    index.ts               Runs all enabled transformers in sequence, composes line maps
    logVisibility.ts       slog.* fade / hide / highlight
    inlineOneLineIf.ts     Collapses single-statement if/else chains
media/
  preview.css              Webview styles (theme tokens, dimming, tooltip, diagnostics)
  preview.js               Webview script (renders HTML, navigation, hover, diagnostics)
docs/                      Architecture & contributor docs
.github/                   Release workflow + issue templates
```

---

## Known limitations

- Transformers are **line/regex-based**, not a full Go parser. Braces inside string literals or comments can confuse block detection in rare cases.
- Go-to-definition / hover column targeting is approximate on **collapsed** lines, because a transformed line no longer maps 1:1 to source columns.

See [improvement.md](improvement.md) for the full roadmap and known-issues list.

---

## Contributing

Contributions are welcome — new preview rules, bug fixes, docs. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) first.

The easiest way to contribute is to **add a new transformer** — see [docs/04-adding-new-rules.md](docs/04-adding-new-rules.md).

---

## License

[MIT](LICENSE)
