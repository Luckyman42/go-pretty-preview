# 03 — How This Extension Works (End-to-End)

## The full data flow

```
User clicks the eye icon in the editor title bar
  │
  ▼
extension.ts: command "goPreview.openPreview" fires
  │  Gets active text document (the .go file)
  ▼
GoPreviewProvider.open(document)
  │  Creates a WebviewPanel beside the source editor
  │  Sets up diagnostics + scroll-sync listeners
  │  Calls pushUpdate() immediately to show content
  ▼
GoPreviewProvider.pushUpdate(panel, document)
  │  1. document.getText()              → raw Go source
  │  2. runTransformers(source)         → { code, lineMap, fadedLineIndices, highlightedLineIndices }
  │  3. buildPackageDecorations(code)   → Shiki token-level decorations for pkg fading
  │  4. highlighter.codeToHtml(code)    → syntax-highlighted HTML string (Shiki)
  │  5. panel.webview.postMessage({ type: 'update', html, lineMap, fadedLines, ... })
  ▼
media/preview.js (runs in the webview/browser)
  │  Receives the message
  │  Sets container.innerHTML = html
  │  Calls applyLineDecorations() for faded/highlighted lines
  │  Calls applyLineNumbers() — sets data-line-nr on each .line element (source line, 1-based)
  ▼
User sees syntax-highlighted Go code with source line numbers in the gutter,
faded/highlighted lines, and optional package-qualifier dimming.
```

---

## What happens when you edit the source file?

```
User types in the .go source editor
  │
  ▼
VS Code fires vscode.workspace.onDidChangeTextDocument
  │
  ▼
extension.ts listener calls provider.handleDocumentChange(event)
  │
  ▼
GoPreviewProvider debounces (120 ms), then calls pushUpdate()
  │
  ▼
Preview updates live (no reload, no flicker)
```

---

## The transformer pipeline

`runTransformers()` in `src/transformers/index.ts` chains all enabled transformers:

```
source text
  │
  ├─ [alwaysRun] LogVisibilityTransformer.transform(source, configValue)
  │    Returns: { code, lineMap, fadedLineIndices, highlightedLineIndices, collapsedLineIndices }
  │    Modes: normal (no-op) | fade | highlight | hide (removes lines, updates lineMap)
  │
  ├─ [if enabled] InlineOneLineIfTransformer.transform(source, configValue)
  │    Returns: { code: inlined text, lineMap (composed), collapsedLineIndices }
  │
  ├─ [future transformers...]
  │
  ▼
{ code: finalText, lineMap, fadedLineIndices, highlightedLineIndices, collapsedLineIndices }
```

Each transformer:
1. Receives the current `code` string and its config value (read once in `runTransformers`, not inside `transform()`)
2. Returns a new `code` string (possibly with multi-line blocks collapsed)
3. Returns a correct `lineMap`: `lineMap[outputLine] = sourceLine` (0-based, relative to this transformer's input)
4. Returns sets of 0-based output line indices for faded, highlighted, and collapsed lines

`runTransformers` composes the line maps across transformers so the final `lineMap[previewLine] → originalSourceLine` is always correct.

---

## Line numbers

After each `update` message, `preview.js` iterates all `.line` elements and sets `data-line-nr` to the 1-based source line from `lineMap`. The CSS `::before` pseudo-element displays this as a gutter. Gaps in the line-number sequence naturally indicate hidden lines (e.g. `logVisibility: hide`).

---

## How `InlineOneLineIfTransformer` works

It scans line by line looking for patterns like:

```go
    if err != nil {       ← line i:   starts with "if ... {"
        return err        ← line i+1: single statement body
    }                     ← line i+2: closing "}"
```

When found (and optionally followed by `} else if ...` or `} else {` chains), it:

1. Extracts all branches: `[{ header: "if err != nil", body: "return err" }]`
2. Builds a collapsed line: `"    if err != nil { return err }"`
3. Checks the collapsed line fits within 120 characters
4. Pushes the collapsed line to output and records its index in `collapsedLineIndices`
5. Skips the original 3+ lines, recording the source line of the `if` header in `lineMap`

Brace counting skips characters inside `"..."`, backtick strings, and `//` line comments to avoid false matches.

**What does NOT collapse:**
- Any branch with more than one statement in the body
- The result would be longer than 120 characters

---

## The Webview HTML structure

```html
<html>
<head>
  <!-- CSP header — security sandbox -->
  <!-- preview.css — syntax token colours + gutter line numbers + log/pkg decorations -->
</head>
<body>
  <div id="preview-container">
    <pre style="background-color: ...">
      <code>
        <span class="line" data-line-nr="1">package main</span>
        <span class="line" data-line-nr="2"></span>
        <span class="line" data-line-nr="3">import "fmt"</span>
        <!-- ... -->
        <span class="line line-faded" data-line-nr="12">  slog.Info("done")</span>
      </code>
    </pre>
  </div>
  <div id="hover-tooltip" ...></div>
  <script nonce="..." src="preview.js"></script>
</body>
</html>
```

`innerHTML` replacement on every update is fast and doesn't reset scroll position because the container element itself is stable.

---

## Scroll sync

**Source → Preview:** `vscode.window.onDidChangeTextEditorVisibleRanges` fires when the source editor scrolls. The extension finds the first preview line whose source line is ≥ the new top line, and posts `{ type: 'scroll-to-line', line: previewLine }` to the webview. The webview calls `scrollIntoView` on that `.line` element.

**Preview → Source:** The webview listens to `window.scroll`, throttles at 120 ms, finds the first `.line` element at or below the viewport top, and posts `{ type: 'scroll-source', line: previewLine }`. The extension calls `editor.revealRange(sourceLine, AtTop)`.

A `suppressScrollSync` flag (with a 200 ms timeout) on each side prevents the two directions from chasing each other.

---

## Settings integration

`vscode.workspace.getConfiguration('goPreview.rules')` is read **once** in `runTransformers()` and the relevant value is passed as `configValue` to each transformer's `transform()` call. When the user changes a setting:

1. `vscode.workspace.onDidChangeConfiguration` fires
2. `extension.ts` calls `provider.handleConfigChange()`
3. All open preview panels re-render with the new settings immediately
