import * as vscode from 'vscode';
import { Transformer, TransformOutput } from './types';
import { InlineOneLineIfTransformer } from './inlineOneLineIf';

const allTransformers: Transformer[] = [
  new InlineOneLineIfTransformer(),
];

export function runTransformers(source: string): TransformOutput {
  const config = vscode.workspace.getConfiguration('goPreview.rules');

  let code = source;
  const collapsedLineIndices = new Set<number>();
  // Identity map: each output line i maps to source line i
  let lineMap = Array.from({ length: source.split('\n').length }, (_, i) => i);

  for (const transformer of allTransformers) {
    if (config.get<boolean>(transformer.id, true)) {
      const result = transformer.transform(code);
      code = result.code;
      result.collapsedLineIndices.forEach(idx => collapsedLineIndices.add(idx));
      // Compose: result.lineMap[outputLine] = intermediateSourceLine
      // lineMap[intermediateSourceLine] = originalSourceLine
      lineMap = result.lineMap.map(intermediate => lineMap[intermediate] ?? intermediate);
    }
  }

  return { code, collapsedLineIndices, lineMap };
}
