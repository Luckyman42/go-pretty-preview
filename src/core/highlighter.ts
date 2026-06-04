import { Language, Query, Tree, QueryCapture } from 'web-tree-sitter';
import { SourcePos } from './descriptors';
import { Decoration } from './decorations/types';

export interface RenderInput {
  /** Materialized output code (must be valid Go — it is parsed for highlighting). */
  code: string;
  /** AST of `code`. When null, the code is rendered without token classes. */
  tree: Tree | null;
  /** outputLine → sourceLine. */
  lineMap: number[];
  /** Per-output-line column source map (null = 1:1 with `lineMap[line]`). */
  colMaps: Array<SourcePos[] | null>;
  /** Output lines that resulted from collapsing — their braces are faded. */
  collapsedLines: Set<number>;
  /** Column-range decorations in output coordinates (e.g. pkg-faded). */
  decorations: Decoration[];
}

/** Compiles the highlight query against the Go language. */
export function createGoHighlighter(language: Language, scm: string): GoHighlighter {
  return new GoHighlighter(new Query(language, scm));
}

/**
 * Renders Go code to HTML using tree-sitter highlight captures. The output keeps
 * the `.line` structure the webview expects, and every span carries `data-sl` /
 * `data-sc` (source line/column) so hover and go-to-definition resolve exactly —
 * including on collapsed lines, via the per-column `colMap`.
 */
export class GoHighlighter {
  constructor(private readonly query: Query) {}

  render(input: RenderInput): string {
    const lines = input.code.split('\n');

    // Per-line, per-column token class (undefined = no highlight).
    const tokClasses: Array<Array<string | undefined>> = lines.map((l) => new Array(l.length));
    if (input.tree) {
      const caps = this.query.captures(input.tree.rootNode);
      // Paint largest spans first; for equal spans, paint the earlier query pattern
      // last so it wins (tree-sitter precedence: first matching pattern wins).
      caps.sort((a, b) => {
        const al = a.node.endIndex - a.node.startIndex;
        const bl = b.node.endIndex - b.node.startIndex;
        if (al !== bl) return bl - al;
        return b.patternIndex - a.patternIndex;
      });
      for (const c of caps) paintCapture(tokClasses, c);
    }

    // Per-column decoration CSS classes per output line. Multiple decorations on
    // the same column are space-joined so all their classes apply to that span.
    const colDecos: Array<Map<number, string> | undefined> = [];
    for (const d of input.decorations) {
      if (d.start.line !== d.end.line) continue;
      const lineDecos = (colDecos[d.start.line] ??= new Map<number, string>());
      for (let c = d.start.character; c < d.end.character; c++) {
        const existing = lineDecos.get(c);
        lineDecos.set(c, existing ? `${existing} ${d.properties.class}` : d.properties.class);
      }
    }

    const html = lines
      .map((text, i) =>
        this.renderLine(
          text,
          input.colMaps[i],
          input.lineMap[i] ?? i,
          tokClasses[i],
          colDecos[i],
          input.collapsedLines.has(i)
        )
      )
      .join('\n');
    return `<pre><code>${html}</code></pre>`;
  }

  private renderLine(
    text: string,
    colMap: SourcePos[] | null,
    srcLine: number,
    tokCls: Array<string | undefined>,
    lineDecos: Map<number, string> | undefined,
    collapsed: boolean
  ): string {
    if (text.length === 0) return '<span class="line"></span>';

    // Compose a class key per column, then group consecutive equal keys.
    const keys: string[] = new Array(text.length);
    for (let c = 0; c < text.length; c++) {
      const tok = tokCls[c] ?? '';
      const deco = lineDecos?.get(c) ?? '';
      const brace = collapsed && (text[c] === '{' || text[c] === '}') ? 'brace-faded' : '';
      keys[c] = `${tok}|${deco}|${brace}`;
    }

    let out = '<span class="line">';
    let start = 0;
    for (let c = 1; c <= text.length; c++) {
      if (c === text.length || keys[c] !== keys[start]) {
        out += emitSpan(text.slice(start, c), start, colMap, srcLine, keys[start]);
        start = c;
      }
    }
    return out + '</span>';
  }
}

function paintCapture(tokClasses: Array<Array<string | undefined>>, cap: QueryCapture): void {
  const cls = `tok-${cap.name.replace(/\./g, '-')}`;
  const s = cap.node.startPosition;
  const e = cap.node.endPosition;
  for (let row = s.row; row <= e.row; row++) {
    const arr = tokClasses[row];
    if (!arr) continue;
    const from = row === s.row ? s.column : 0;
    const to = row === e.row ? e.column : arr.length;
    for (let c = from; c < to && c < arr.length; c++) arr[c] = cls;
  }
}

function emitSpan(
  slice: string,
  col: number,
  colMap: SourcePos[] | null,
  srcLine: number,
  key: string
): string {
  const [tok, deco, brace] = key.split('|');
  const classes = [tok, deco, brace].filter(Boolean).join(' ');
  const sp = (colMap && colMap[col]) || { line: srcLine, col };
  const clsAttr = classes ? ` class="${classes}"` : '';
  return `<span${clsAttr} data-sl="${sp.line}" data-sc="${sp.col}">${escapeHtml(slice)}</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
