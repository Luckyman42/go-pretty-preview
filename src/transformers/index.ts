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

  for (const transformer of allTransformers) {
    if (config.get<boolean>(transformer.id, true)) {
      const result = transformer.transform(code);
      code = result.code;
      result.collapsedLineIndices.forEach(idx => collapsedLineIndices.add(idx));
    }
  }

  return { code, collapsedLineIndices };
}
