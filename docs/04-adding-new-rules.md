# 04 — Adding New Rules (Transformers)

This guide walks through adding a new visual rule to the preview. As an example we'll add **"highlight panic calls"** — wrapping `panic(...)` lines in a soft red background so they stand out during review.

---

## Step 1: Create the transformer file

Create `src/transformers/highlightPanic.ts`:

```typescript
import { Transformer, TransformOutput } from './types';

const PANIC_LINE = /^\s*panic\s*\(/;

export class HighlightPanicTransformer implements Transformer {
  readonly id = 'highlightPanic';
  readonly label = 'Highlight panic calls';

  transform(source: string, _configValue?: unknown): TransformOutput {
    const lines = source.split('\n');
    const highlightedLineIndices = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      if (PANIC_LINE.test(lines[i])) {
        highlightedLineIndices.add(i);
      }
    }

    return {
      code: source,
      collapsedLineIndices: new Set(),
      fadedLineIndices: new Set(),
      highlightedLineIndices,
      // Identity map — this transformer doesn't change line structure
      lineMap: lines.map((_, i) => i),
    };
  }
}
```

> **Note:** A transformer that only marks lines for decoration returns the `source` unchanged and provides an identity `lineMap`. A transformer that removes or merges lines (like `logVisibility` in `hide` mode or `inlineOneLineIf`) must return a `lineMap` that correctly maps each output line back to its source line.

---

## Step 2: Register it in `src/transformers/index.ts`

```typescript
import { HighlightPanicTransformer } from './highlightPanic';

// Order matters — see the comment in index.ts for why LogVisibility runs first.
const allTransformers: Transformer[] = [
  new LogVisibilityTransformer(),
  new InlineOneLineIfTransformer(),
  new HighlightPanicTransformer(),   // ← add here
];
```

---

## Step 3: Add a setting in `package.json`

Inside `contributes.configuration.properties`:

```jsonc
"goPreview.rules.highlightPanic": {
  "type": "boolean",
  "default": true,
  "description": "Highlight panic() calls to make them stand out during review"
}
```

**The setting key must exactly match the transformer's `id` property** — `runTransformers()` uses `config.get(transformer.id)` to determine if the transformer is enabled, and passes the raw config value to `transform()`.

---

## Step 4: Add CSS for the new visual effect (if needed)

This example reuses the existing `.line-highlighted` class (yellow background). If you need a different style, add a class to `media/preview.css`:

```css
/* Highlight panic calls — red background */
#preview-container .line-panic {
  background-color: rgba(255, 80, 80, 0.10);
  outline: 1px solid rgba(255, 80, 80, 0.20);
  outline-offset: -1px;
}
```

And apply it in `media/preview.js` inside the `update` handler alongside the other `applyLineDecorations` calls.

---

## Step 5: Test it

1. `npm run typecheck` — verify no type errors
2. `npm run build`
3. Press **F5** to open the Extension Development Host
4. Open a `.go` file with a `panic(...)` call, click the eye icon
5. Open Settings (`Ctrl+,`), search for "Go Pretty Preview"
6. Toggle your new rule on/off and watch the preview update

---

## Reference: the Transformer interface

```typescript
// src/transformers/types.ts

export interface TransformOutput {
  code: string;
  /** 0-indexed output line numbers that were collapsed (merged into fewer lines) */
  collapsedLineIndices: Set<number>;
  /** 0-indexed output line numbers to render dimmed (grayscale + low opacity) */
  fadedLineIndices: Set<number>;
  /** 0-indexed output line numbers to render highlighted */
  highlightedLineIndices: Set<number>;
  /** lineMap[outputLineIndex] = sourceLineIndex (0-based, relative to this transformer's input) */
  lineMap: number[];
}

export interface Transformer {
  readonly id: string;      // must match the settings key exactly
  readonly label: string;   // human-readable name
  readonly alwaysRun?: boolean; // if true, runs regardless of the boolean config gate
  /**
   * configValue: the raw value from goPreview.rules.<id>, passed in by runTransformers.
   * Do not call vscode.workspace.getConfiguration inside transform() — it makes the
   * transformer dependent on the vscode environment and harder to test.
   */
  transform(source: string, configValue?: unknown): TransformOutput;
}
```

---

## Two ways a rule can change the preview

| Approach | When to use | Example |
|---|---|---|
| **Line decoration** | Mark lines for styling without changing structure. Return identity `lineMap`. | `fadedLineIndices`, `highlightedLineIndices` |
| **Source-text transform** | Change line structure (remove, collapse, merge lines). Must return correct `lineMap`. | `logVisibility` hide mode, `inlineOneLineIf` |
| **Token decoration** | Style individual tokens (character ranges) post-highlight. Not a `Transformer` — uses Shiki decorations via `buildPackageDecorations` pattern in `GoPreviewProvider.ts`. | `fadePackages` |

When in doubt, prefer line decorations: they can't desync the `lineMap`.

---

## Ideas for future rules

| Rule ID | Effect |
|---|---|
| `highlightPanic` | Highlight `panic(...)` calls in red for quick review |
| `dimTestBoilerplate` | Fade `t.Helper()`, `t.Parallel()`, `t.Cleanup(...)` in `_test.go` files |
| `dimStructTags` | Fade `` `json:"..."` `` / `` `db:"..."` `` tags so field names and types stand out |
| `foldImportBlock` | Collapse multi-line `import (...)` blocks to a single line |
| `generalLogger` | Configurable log-line matching beyond just `slog.*` |
