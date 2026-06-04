/**
 * The descriptor model is the heart of the rendering pipeline.
 *
 * Instead of repeatedly rewriting a source string and re-parsing after every
 * transformer (the old approach), transformers annotate / rewrite a list of
 * `LineDescriptor`s derived once from the original source. A single source
 * `Tree` drives all transformers; the `lineMap` and per-line decoration sets
 * fall out of the descriptor fields automatically.
 */

/** A 0-based position in the original source. */
export interface SourcePos {
  line: number;
  col: number;
}

/** A half-open [start, end) column range on an output line. */
export interface ColRange {
  start: number;
  end: number;
}

export interface LineDescriptor {
  /** Primary source line (0-based) this output line maps to — drives lineMap,
   *  diagnostics and scroll-sync. For reflowed lines it is the header's row. */
  sourceLine: number;
  /** The text rendered for this output line. */
  text: string;
  /** Render dimmed (e.g. faded log line). */
  faded?: boolean;
  /** Render highlighted. */
  highlighted?: boolean;
  /** This line is the result of collapsing several source lines into one. */
  collapsed?: boolean;
  /** Per-output-column source position. Only set on reflowed (collapsed) lines,
   *  where a single `sourceLine` cannot describe every column. When absent, an
   *  output column maps directly to `{ line: sourceLine, col }`. */
  colMap?: SourcePos[];
  /** Column ranges whose text is hidden (opacity 0) — set by previewRules fade with groups. */
  fadeRanges?: ColRange[];
  /** Column ranges that are highlighted — set by previewRules highlight with groups. */
  highlightRanges?: ColRange[];
}

/** Builds the initial 1:1 descriptor list from the original source. */
export function descriptorsFromSource(source: string): LineDescriptor[] {
  return source.split('\n').map((text, i) => ({ sourceLine: i, text }));
}

export interface MaterializedOutput {
  code: string;
  /** lineMap[outputLine] = sourceLine (0-based). */
  lineMap: number[];
  collapsedLineIndices: Set<number>;
  fadedLineIndices: Set<number>;
  highlightedLineIndices: Set<number>;
  /** colMaps[outputLine] = per-column source positions, or null when 1:1. */
  colMaps: Array<SourcePos[] | null>;
  /** Per-output-line column ranges to hide (opacity 0), or null when none. */
  fadeRanges: Array<ColRange[] | null>;
  /** Per-output-line column ranges to highlight, or null when none. */
  highlightRanges: Array<ColRange[] | null>;
}

/** Flattens a descriptor list into the shapes the provider/webview consume. */
export function materialize(descriptors: LineDescriptor[]): MaterializedOutput {
  const texts: string[] = [];
  const lineMap: number[] = [];
  const collapsedLineIndices = new Set<number>();
  const fadedLineIndices = new Set<number>();
  const highlightedLineIndices = new Set<number>();
  const colMaps: Array<SourcePos[] | null> = [];
  const fadeRanges: Array<ColRange[] | null> = [];
  const highlightRanges: Array<ColRange[] | null> = [];

  descriptors.forEach((d, i) => {
    texts.push(d.text);
    lineMap.push(d.sourceLine);
    if (d.collapsed) collapsedLineIndices.add(i);
    if (d.faded) fadedLineIndices.add(i);
    if (d.highlighted) highlightedLineIndices.add(i);
    colMaps.push(d.colMap ?? null);
    fadeRanges.push(d.fadeRanges ?? null);
    highlightRanges.push(d.highlightRanges ?? null);
  });

  return {
    code: texts.join('\n'),
    lineMap,
    collapsedLineIndices,
    fadedLineIndices,
    highlightedLineIndices,
    colMaps,
    fadeRanges,
    highlightRanges,
  };
}

/**
 * Accumulates text together with a per-character source map. Used by reflowing
 * transformers (e.g. inline-if) to build a collapsed line whose every column
 * still resolves back to an exact source position for hover / go-to-definition.
 */
export class LineBuilder {
  private text = '';
  private readonly map: SourcePos[] = [];

  /** Append `s`, mapping each character to consecutive columns from `startCol`
   *  on source `line` (use for text copied verbatim from the source). */
  append(s: string, line: number, startCol: number): void {
    for (let k = 0; k < s.length; k++) this.map.push({ line, col: startCol + k });
    this.text += s;
  }

  /** Append `s`, mapping every character to the single position `pos`
   *  (use for synthesized text such as spacing or braces). */
  appendAt(s: string, pos: SourcePos): void {
    for (let k = 0; k < s.length; k++) this.map.push({ line: pos.line, col: pos.col });
    this.text += s;
  }

  build(): { text: string; colMap: SourcePos[] } {
    return { text: this.text, colMap: this.map };
  }
}
