import { Tree } from 'web-tree-sitter';
import { Transformer } from './types';
import { LineDescriptor, ColRange } from '../descriptors';

interface PreviewRulesConfig {
  protect?: string[];
  highlight?: string[];
  hide?: string[];
  fade?: string[];
}

export class PreviewRulesTransformer implements Transformer {
  readonly id = 'previewRules';
  readonly label = 'Preview Rules';
  readonly alwaysRun = true;

  transform(input: LineDescriptor[], _tree: Tree | null, configValue?: unknown): LineDescriptor[] {
    const cfg = parseConfig(configValue);
    if (!cfg) return input;

    const protect = compilePatterns(cfg.protect);
    const highlight = compilePatterns(cfg.highlight);
    const hide = compilePatterns(cfg.hide);
    const fade = compilePatterns(cfg.fade);

    if (!protect.length && !highlight.length && !hide.length && !fade.length) return input;

    const result: LineDescriptor[] = [];
    for (const desc of input) {
      const { text } = desc;

      // Priority 1: protect — immune to all other rules
      if (matchesAny(protect, text)) {
        result.push(desc);
        continue;
      }

      // Priority 2: highlight — groups if present, whole line otherwise
      const hMatch = firstMatch(highlight, text);
      if (hMatch) {
        const ranges = groupRanges(hMatch);
        result.push(ranges.length > 0 ? { ...desc, highlightRanges: ranges } : { ...desc, highlighted: true });
        continue;
      }

      // Priority 3: hide — remove from preview entirely
      if (matchesAny(hide, text)) continue;

      // Priority 4: fade — groups hidden if present, whole line dimmed otherwise
      const fMatch = firstMatch(fade, text);
      if (fMatch) {
        const ranges = groupRanges(fMatch);
        result.push(ranges.length > 0 ? { ...desc, fadeRanges: ranges } : { ...desc, faded: true });
        continue;
      }

      result.push(desc);
    }

    return result;
  }
}

function parseConfig(value: unknown): PreviewRulesConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as PreviewRulesConfig;
}

function compilePatterns(patterns: string[] | undefined): RegExp[] {
  if (!patterns?.length) return [];
  return patterns.flatMap((p) => {
    try {
      return [new RegExp(p, 'd')];
    } catch {
      return [];
    }
  });
}

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

function firstMatch(patterns: RegExp[], text: string): RegExpExecArray | null {
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) return m;
  }
  return null;
}

function groupRanges(m: RegExpExecArray): ColRange[] {
  const indices = m.indices;
  if (!indices || indices.length <= 1) return [];
  const ranges: ColRange[] = [];
  for (let i = 1; i < indices.length; i++) {
    const idx = indices[i];
    if (idx) ranges.push({ start: idx[0], end: idx[1] });
  }
  return ranges;
}
