import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { parseGo } from '../core/parser';
import { descriptorsFromSource, type LineDescriptor } from '../core/descriptors';
import { InlineOneLineIfTransformer } from '../core/transformers/inlineOneLineIf';

const WASM_DIR = path.resolve(process.cwd(), 'out');
const transformer = new InlineOneLineIfTransformer();

// Warm up the WASM parser once for the whole file.
beforeAll(async () => {
  await parseGo('package main', WASM_DIR);
}, 30000);

async function run(source: string): Promise<{ texts: string[]; descriptors: LineDescriptor[] }> {
  const tree = await parseGo(source, WASM_DIR);
  try {
    const descriptors = descriptorsFromSource(source);
    const output = transformer.transform(descriptors, tree);
    return { texts: output.map((d) => d.text), descriptors: output };
  } finally {
    tree.delete();
  }
}

// Wraps a Go function body in a minimal file; returns the source and the
// 0-based line offset where the body starts (line 3 = first body line).
function goFunc(body: string): string {
  return `package main\n\nfunc f() {\n${body}\n}`;
}

describe('InlineOneLineIfTransformer', () => {
  describe('null tree', () => {
    it('returns input unchanged when tree is null', () => {
      const source = 'if x {\n\ty()\n}';
      const input = descriptorsFromSource(source);
      const output = transformer.transform(input, null);
      expect(output).toEqual(input);
    });
  });

  describe('single if — collapses', () => {
    it('collapses a single-statement if into one line', async () => {
      const source = goFunc('\tif err != nil {\n\t\treturn err\n\t}');
      const { texts } = await run(source);
      // Row 3 (if header), rows 4+5 (body+close) → one collapsed line.
      expect(texts).toContain('\tif err != nil { return err }');
      // Body and closing brace rows are consumed.
      expect(texts.filter((t) => t.trim() === 'return err')).toHaveLength(0);
    });

    it('marks the collapsed descriptor as collapsed: true', async () => {
      const source = goFunc('\tif err != nil {\n\t\treturn err\n\t}');
      const { descriptors } = await run(source);
      const collapsed = descriptors.find((d) => d.collapsed);
      expect(collapsed).toBeDefined();
      expect(collapsed!.text).toBe('\tif err != nil { return err }');
    });

    it('sets sourceLine to the header row', async () => {
      const source = goFunc('\tif err != nil {\n\t\treturn err\n\t}');
      const { descriptors } = await run(source);
      const collapsed = descriptors.find((d) => d.collapsed)!;
      expect(collapsed.sourceLine).toBe(3); // line 3 in the full source
    });
  });

  describe('if / else chain', () => {
    it('collapses both branches — if line has no closing brace, else line does', async () => {
      const source = goFunc('\tif err != nil {\n\t\treturn err\n\t} else {\n\t\treturn nil\n\t}');
      const { texts } = await run(source);
      expect(texts).toContain('\tif err != nil { return err');
      expect(texts).toContain('\t} else { return nil }');
    });

    it('produces exactly 2 collapsed descriptors for an if/else chain', async () => {
      const source = goFunc('\tif err != nil {\n\t\treturn err\n\t} else {\n\t\treturn nil\n\t}');
      const { descriptors } = await run(source);
      expect(descriptors.filter((d) => d.collapsed)).toHaveLength(2);
    });
  });

  describe('if / else-if / else chain', () => {
    it('collapses all three branches', async () => {
      const source = goFunc(
        '\tif err != nil {\n\t\treturn err\n\t} else if ok {\n\t\treturn nil\n\t} else {\n\t\treturn zero\n\t}',
      );
      const { texts } = await run(source);
      expect(texts).toContain('\tif err != nil { return err');
      expect(texts).toContain('\t} else if ok { return nil');
      expect(texts).toContain('\t} else { return zero }');
    });
  });

  describe('multi-statement block — not collapsed', () => {
    it('leaves the if block expanded when the body has more than one statement', async () => {
      const source = goFunc('\tif err != nil {\n\t\tx = 1\n\t\treturn err\n\t}');
      const { descriptors } = await run(source);
      expect(descriptors.every((d) => !d.collapsed)).toBe(true);
    });

    it('preserves all original lines when not collapsing', async () => {
      const source = goFunc('\tif err != nil {\n\t\tx = 1\n\t\treturn err\n\t}');
      const { texts } = await run(source);
      expect(texts).toContain('\t\tx = 1');
      expect(texts).toContain('\t\treturn err');
    });
  });

  describe('body with line comment — not collapsed', () => {
    it('leaves the if expanded when the single body line has a trailing comment', async () => {
      const source = goFunc('\tif err != nil {\n\t\treturn err // must not collapse\n\t}');
      const { descriptors } = await run(source);
      expect(descriptors.every((d) => !d.collapsed)).toBe(true);
    });
  });

  describe('line length limit', () => {
    it('falls back to expanded form when the collapsed line would exceed 120 chars', async () => {
      const longName = 'veryLongVariableNameThatForcesThisCollapsedLineWellPastTheOneTwentyCharacterLimit';
      const source = goFunc(
        `\tif ${longName} != "" {\n\t\treturn ${longName}\n\t}`,
      );
      const { descriptors } = await run(source);
      // No collapsed descriptor — the branch fell back to expanded.
      expect(descriptors.every((d) => !d.collapsed)).toBe(true);
      // But the body line should still be present.
      expect(descriptors.some((d) => d.text.includes(longName) && d.text.includes('return'))).toBe(true);
    });
  });

  describe('two independent if statements', () => {
    it('collapses both independently', async () => {
      const source = goFunc(
        '\tif a {\n\t\treturn 1\n\t}\n\tif b {\n\t\treturn 2\n\t}',
      );
      const { descriptors } = await run(source);
      const collapsed = descriptors.filter((d) => d.collapsed);
      expect(collapsed).toHaveLength(2);
      expect(collapsed[0].text).toContain('return 1');
      expect(collapsed[1].text).toContain('return 2');
    });
  });

  describe('colMap', () => {
    it('every character in a collapsed line has a source position in the colMap', async () => {
      const source = goFunc('\tif err != nil {\n\t\treturn err\n\t}');
      const { descriptors } = await run(source);
      const collapsed = descriptors.find((d) => d.collapsed)!;
      expect(collapsed.colMap).toBeDefined();
      expect(collapsed.colMap!).toHaveLength(collapsed.text.length);
    });
  });
});
