import { describe, it, expect } from 'vitest';
import { PreviewRulesTransformer } from '../core/transformers/previewRules';
import type { LineDescriptor } from '../core/descriptors';

const transformer = new PreviewRulesTransformer();

function lines(...texts: string[]): LineDescriptor[] {
  return texts.map((text, i) => ({ sourceLine: i, text }));
}

function run(input: LineDescriptor[], config: unknown): LineDescriptor[] {
  return transformer.transform(input, null, config);
}

describe('PreviewRulesTransformer', () => {
  describe('passthrough cases', () => {
    it('returns input unchanged when config has no patterns', () => {
      const input = lines('a', 'b');
      expect(run(input, {})).toEqual(input);
    });

    it('returns input unchanged for null config', () => {
      const input = lines('a');
      expect(run(input, null)).toEqual(input);
    });

    it('returns input unchanged for non-object config', () => {
      const input = lines('a');
      expect(run(input, 'bad')).toEqual(input);
      expect(run(input, [])).toEqual(input);
      expect(run(input, 42)).toEqual(input);
    });

    it('passes through lines that match no rule', () => {
      const input = lines('abc');
      expect(run(input, { hide: ['xyz'] })).toEqual(input);
    });

    it('silently ignores invalid regexp patterns', () => {
      const input = lines('abc');
      expect(run(input, { hide: ['[invalid('] })).toEqual(input);
    });
  });

  describe('hide', () => {
    it('removes lines matching the pattern', () => {
      const out = run(lines('keep', 'log: remove', 'keep'), { hide: ['log:'] });
      expect(out.map((d) => d.text)).toEqual(['keep', 'keep']);
    });

    it('removes all matching lines when multiple match', () => {
      const out = run(lines('a', 'b', 'c', 'b'), { hide: ['^b$'] });
      expect(out.map((d) => d.text)).toEqual(['a', 'c']);
    });

    it('does not remove non-matching lines', () => {
      const out = run(lines('a', 'b'), { hide: ['z'] });
      expect(out).toHaveLength(2);
    });
  });

  describe('fade', () => {
    it('sets faded: true on the whole line when no capture groups', () => {
      const [out] = run(lines('fmt.Println("x")'), { fade: ['fmt\\.'] });
      expect(out.faded).toBe(true);
      expect(out.fadeRanges).toBeUndefined();
    });

    it('sets fadeRanges when capture groups are present', () => {
      const [out] = run(lines('fmt.Println("x")'), { fade: ['(fmt)\\.'] });
      expect(out.faded).toBeUndefined();
      expect(out.fadeRanges).toEqual([{ start: 0, end: 3 }]);
    });

    it('does not modify non-matching lines', () => {
      const [out] = run(lines('unrelated'), { fade: ['fmt'] });
      expect(out.faded).toBeUndefined();
      expect(out.fadeRanges).toBeUndefined();
    });
  });

  describe('highlight', () => {
    it('sets highlighted: true on the whole line when no capture groups', () => {
      const [out] = run(lines('TODO: fix this'), { highlight: ['TODO'] });
      expect(out.highlighted).toBe(true);
      expect(out.highlightRanges).toBeUndefined();
    });

    it('sets highlightRanges when capture groups are present', () => {
      const [out] = run(lines('TODO: fix this'), { highlight: ['(TODO)'] });
      expect(out.highlighted).toBeUndefined();
      expect(out.highlightRanges).toEqual([{ start: 0, end: 4 }]);
    });

    it('supports multiple capture groups', () => {
      const [out] = run(lines('foo bar'), { highlight: ['(foo) (bar)'] });
      expect(out.highlightRanges).toEqual([
        { start: 0, end: 3 },
        { start: 4, end: 7 },
      ]);
    });
  });

  describe('protect', () => {
    it('beats hide — protected line is kept', () => {
      const out = run(lines('important'), { protect: ['important'], hide: ['important'] });
      expect(out).toHaveLength(1);
      expect(out[0].text).toBe('important');
    });

    it('beats fade — protected line is not dimmed', () => {
      const [out] = run(lines('important'), { protect: ['important'], fade: ['important'] });
      expect(out.faded).toBeUndefined();
    });

    it('beats highlight — protected line is not highlighted', () => {
      const [out] = run(lines('important'), { protect: ['important'], highlight: ['important'] });
      expect(out.highlighted).toBeUndefined();
    });
  });

  describe('priority order (protect > highlight > hide > fade)', () => {
    it('highlight beats hide', () => {
      const out = run(lines('x'), { highlight: ['x'], hide: ['x'] });
      expect(out).toHaveLength(1);
      expect(out[0].highlighted).toBe(true);
    });

    it('hide beats fade', () => {
      const out = run(lines('x'), { hide: ['x'], fade: ['x'] });
      expect(out).toHaveLength(0);
    });

    it('highlight beats fade', () => {
      const [out] = run(lines('x'), { highlight: ['x'], fade: ['x'] });
      expect(out.highlighted).toBe(true);
      expect(out.faded).toBeUndefined();
    });
  });

  describe('multiple patterns', () => {
    it('first matching hide pattern removes the line', () => {
      const out = run(lines('abc'), { hide: ['xyz', 'abc'] });
      expect(out).toHaveLength(0);
    });

    it('first matching highlight pattern wins', () => {
      const [out] = run(lines('abc'), { highlight: ['abc', 'abc'] });
      expect(out.highlighted).toBe(true);
    });
  });
});
