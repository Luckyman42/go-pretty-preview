import * as vscode from 'vscode';
import { Transformer, TransformOutput } from './types';
import { LogVisibilityTransformer } from './logVisibility';
import { InlineOneLineIfTransformer } from './inlineOneLineIf';

const allTransformers: Transformer[] = [
  new LogVisibilityTransformer(),   // must run before inline-if
  new InlineOneLineIfTransformer(),
];

export function runTransformers(source: string): TransformOutput {
  const config = vscode.workspace.getConfiguration('goPreview.rules');

  let code = source;
  const collapsedLineIndices = new Set<number>();
  const fadedLineIndices = new Set<number>();
  const highlightedLineIndices = new Set<number>();
  // Identity map: each output line i maps to source line i
  let lineMap = Array.from({ length: source.split('\n').length }, (_, i) => i);

  for (const transformer of allTransformers) {
    const enabled = transformer.alwaysRun || config.get<boolean>(transformer.id, true);
    if (enabled) {
      const result = transformer.transform(code);
      code = result.code;
      result.collapsedLineIndices.forEach(idx => collapsedLineIndices.add(idx));
      result.fadedLineIndices.forEach(idx => fadedLineIndices.add(idx));
      result.highlightedLineIndices.forEach(idx => highlightedLineIndices.add(idx));
      // Compose: result.lineMap[outputLine] = intermediateSourceLine
      // lineMap[intermediateSourceLine] = originalSourceLine
      lineMap = result.lineMap.map(intermediate => lineMap[intermediate] ?? intermediate);
    }
  }

  return { code, collapsedLineIndices, fadedLineIndices, highlightedLineIndices, lineMap };
}
