import * as vscode from 'vscode';
import { Transformer, TransformOutput } from './types';

// Matches a complete single-line slog call statement.
// Multi-line calls (opening line doesn't end with ')') are intentionally left unmatched.
const SLOG_LINE = /^\s*slog\.(Debug|Info|Warn|Error|Log|LogAttrs)\s*\(.*\)\s*$/;

export class LogVisibilityTransformer implements Transformer {
  readonly id = 'logVisibility';
  readonly label = 'Log line visibility';
  readonly alwaysRun = true;

  transform(source: string): TransformOutput {
    const mode = vscode.workspace
      .getConfiguration('goPreview.rules')
      .get<string>('logVisibility', 'normal');

    const lines = source.split('\n');
    const fadedLineIndices = new Set<number>();
    const highlightedLineIndices = new Set<number>();

    if (mode === 'normal') {
      return {
        code: source,
        collapsedLineIndices: new Set(),
        fadedLineIndices,
        highlightedLineIndices,
        lineMap: lines.map((_, i) => i),
      };
    }

    if (mode === 'fade' || mode === 'highlight') {
      for (let i = 0; i < lines.length; i++) {
        if (SLOG_LINE.test(lines[i])) {
          if (mode === 'fade') fadedLineIndices.add(i);
          else highlightedLineIndices.add(i);
        }
      }
      return {
        code: source,
        collapsedLineIndices: new Set(),
        fadedLineIndices,
        highlightedLineIndices,
        lineMap: lines.map((_, i) => i),
      };
    }

    // hide mode: remove matching lines entirely
    const outputLines: string[] = [];
    const lineMap: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!SLOG_LINE.test(lines[i])) {
        lineMap.push(i);
        outputLines.push(lines[i]);
      }
    }
    return {
      code: outputLines.join('\n'),
      collapsedLineIndices: new Set(),
      fadedLineIndices,
      highlightedLineIndices,
      lineMap,
    };
  }
}
