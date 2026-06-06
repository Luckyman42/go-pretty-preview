import { describe, it, expect } from 'vitest';
import { descriptorsFromSource, materialize, LineBuilder } from '../core/descriptors';

describe('descriptorsFromSource', () => {
  it('produces one descriptor per line', () => {
    const result = descriptorsFromSource('a\nb\nc');
    expect(result).toHaveLength(3);
    expect(result.map((d) => d.text)).toEqual(['a', 'b', 'c']);
  });

  it('assigns 0-based sourceLine index', () => {
    const result = descriptorsFromSource('x\ny\nz');
    expect(result[0].sourceLine).toBe(0);
    expect(result[1].sourceLine).toBe(1);
    expect(result[2].sourceLine).toBe(2);
  });

  it('handles empty string as a single empty-text descriptor', () => {
    const result = descriptorsFromSource('');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('');
  });

  it('preserves indentation in text', () => {
    const result = descriptorsFromSource('\tfoo\n  bar');
    expect(result[0].text).toBe('\tfoo');
    expect(result[1].text).toBe('  bar');
  });
});

describe('materialize', () => {
  it('joins descriptor texts with newlines', () => {
    const { code } = materialize([
      { sourceLine: 0, text: 'a' },
      { sourceLine: 1, text: 'b' },
    ]);
    expect(code).toBe('a\nb');
  });

  it('builds lineMap from sourceLine fields', () => {
    const { lineMap } = materialize([
      { sourceLine: 5, text: 'x' },
      { sourceLine: 10, text: 'y' },
    ]);
    expect(lineMap).toEqual([5, 10]);
  });

  it('populates faded, highlighted, and collapsed index sets', () => {
    const { fadedLineIndices, highlightedLineIndices, collapsedLineIndices } = materialize([
      { sourceLine: 0, text: 'a', faded: true },
      { sourceLine: 1, text: 'b', highlighted: true },
      { sourceLine: 2, text: 'c', collapsed: true },
      { sourceLine: 3, text: 'd' },
    ]);
    expect([...fadedLineIndices]).toEqual([0]);
    expect([...highlightedLineIndices]).toEqual([1]);
    expect([...collapsedLineIndices]).toEqual([2]);
  });

  it('stores colMaps as null when absent', () => {
    const { colMaps } = materialize([{ sourceLine: 0, text: 'a' }]);
    expect(colMaps[0]).toBeNull();
  });

  it('stores colMaps when present', () => {
    const colMap = [{ line: 0, col: 0 }];
    const { colMaps } = materialize([{ sourceLine: 0, text: 'a', colMap }]);
    expect(colMaps[0]).toEqual(colMap);
  });

  it('stores fadeRanges and highlightRanges', () => {
    const fadeRanges = [{ start: 0, end: 3 }];
    const highlightRanges = [{ start: 4, end: 7 }];
    const result = materialize([{ sourceLine: 0, text: 'hello world', fadeRanges, highlightRanges }]);
    expect(result.fadeRanges[0]).toEqual(fadeRanges);
    expect(result.highlightRanges[0]).toEqual(highlightRanges);
  });

  it('sets range arrays to null when absent', () => {
    const result = materialize([{ sourceLine: 0, text: 'x' }]);
    expect(result.fadeRanges[0]).toBeNull();
    expect(result.highlightRanges[0]).toBeNull();
  });
});

describe('LineBuilder', () => {
  it('append maps each character to consecutive columns on the given source line', () => {
    const lb = new LineBuilder();
    lb.append('abc', 5, 10);
    const { text, colMap } = lb.build();
    expect(text).toBe('abc');
    expect(colMap).toEqual([
      { line: 5, col: 10 },
      { line: 5, col: 11 },
      { line: 5, col: 12 },
    ]);
  });

  it('appendAt maps all characters to the same source position', () => {
    const lb = new LineBuilder();
    lb.appendAt('{}', { line: 3, col: 7 });
    const { text, colMap } = lb.build();
    expect(text).toBe('{}');
    expect(colMap).toEqual([
      { line: 3, col: 7 },
      { line: 3, col: 7 },
    ]);
  });

  it('concatenates multiple appends in order', () => {
    const lb = new LineBuilder();
    lb.appendAt('(', { line: 0, col: 0 });
    lb.append('x', 0, 1);
    lb.appendAt(')', { line: 0, col: 2 });
    expect(lb.build().text).toBe('(x)');
  });

  it('returns empty text and map when nothing is appended', () => {
    const lb = new LineBuilder();
    const { text, colMap } = lb.build();
    expect(text).toBe('');
    expect(colMap).toEqual([]);
  });
});
