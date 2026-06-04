import { Tree } from 'web-tree-sitter';
import { LineDescriptor } from '../descriptors';
import { Transformer } from './types';
import { PreviewRulesTransformer } from './previewRules';
import { InlineOneLineIfTransformer } from './inlineOneLineIf';

// Order matters: PreviewRules runs first so that hidden lines don't prevent
// InlineOneLineIf from collapsing single-statement blocks.
const allTransformers: Transformer[] = [
  new PreviewRulesTransformer(),
  new InlineOneLineIfTransformer(),
];

/**
 * Runs every enabled transformer over the descriptor list. A SINGLE source `tree`
 * is shared by all of them — there is no intermediate re-parse and no intermediate
 * WASM tree allocation. `getConfig(id)` supplies each transformer's config value,
 * keeping this function (and the transformers) free of any vscode dependency.
 */
export function runTransformers(
  input: LineDescriptor[],
  tree: Tree | null,
  getConfig: (id: string) => unknown
): LineDescriptor[] {
  let descriptors = input;
  for (const transformer of allTransformers) {
    const configValue = getConfig(transformer.id);
    const enabled = transformer.alwaysRun || (configValue as boolean) !== false;
    if (!enabled) continue;
    descriptors = transformer.transform(descriptors, tree, configValue);
  }
  return descriptors;
}
