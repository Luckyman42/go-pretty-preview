export interface TransformOutput {
  code: string;
  /** 0-indexed line numbers in the output that were collapsed */
  collapsedLineIndices: Set<number>;
  /** lineMap[outputLineIndex] = sourceLineIndex (0-based) */
  lineMap: number[];
}

export interface Transformer {
  readonly id: string;
  readonly label: string;
  transform(source: string): TransformOutput;
}
