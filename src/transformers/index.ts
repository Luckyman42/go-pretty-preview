import * as vscode from 'vscode';
import { Transformer, TransformOutput } from './types';
import { LogVisibilityTransformer } from './logVisibility';
import { InlineOneLineIfTransformer } from './inlineOneLineIf';

// Order matters: LogVisibility runs first because hiding a slog line can turn a
// multi-statement block into a single-statement one, enabling InlineOneLineIf.
const allTransformers: Transformer[] = [
  new LogVisibilityTransformer(),
  new InlineOneLineIfTransformer(),
];

export function runTransformers(source: string): TransformOutput {
  const config = vscode.workspace.getConfiguration('goPreview.rules');

  let code = source;
  const collapsedLineIndices = new Set<number>();
  const fadedLineIndices = new Set<number>();
  const highlightedLineIndices = new Set<number>();
  let lineMap = Array.from({ length: source.split('\n').length }, (_, i) => i);

  for (const transformer of allTransformers) {
    const configValue = config.get(transformer.id);
    const enabled = transformer.alwaysRun || (configValue as boolean) !== false;
    if (!enabled) continue;

    const result = transformer.transform(code, configValue);
    code = result.code;
    result.collapsedLineIndices.forEach((idx) => collapsedLineIndices.add(idx));
    result.fadedLineIndices.forEach((idx) => fadedLineIndices.add(idx));
    result.highlightedLineIndices.forEach((idx) => highlightedLineIndices.add(idx));
    // Compose line maps: result.lineMap[outputLine] = intermediateSourceLine,
    // lineMap[intermediateSourceLine] = originalSourceLine.
    lineMap = result.lineMap.map((intermediate) => lineMap[intermediate] ?? intermediate);
  }

  return { code, collapsedLineIndices, fadedLineIndices, highlightedLineIndices, lineMap };
}
