export interface TransformOutput {
  code: string;
  /** 0-indexed line numbers in the output that were collapsed */
  collapsedLineIndices: Set<number>;
  /** 0-indexed output line numbers to render dimmed (grayscale + low opacity) */
  fadedLineIndices: Set<number>;
  /** 0-indexed output line numbers to render highlighted */
  highlightedLineIndices: Set<number>;
  /** lineMap[outputLineIndex] = sourceLineIndex (0-based) */
  lineMap: number[];
}

export interface Transformer {
  readonly id: string;
  readonly label: string;
  /** When true the transformer always runs, bypassing the boolean config gate */
  readonly alwaysRun?: boolean;
  transform(source: string): TransformOutput;
}
