import { describe, expect, it } from 'vitest';
import { diffLines } from './diff.js';

describe('diffLines', () => {
  it('marks identical content as all same', () => {
    expect(diffLines('a\nb\nc', 'a\nb\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('marks a pure insertion', () => {
    expect(diffLines('a\nc', 'a\nb\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'added', text: 'b' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('marks a pure removal', () => {
    expect(diffLines('a\nb\nc', 'a\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('marks a replacement in the middle as removed then added', () => {
    expect(diffLines('a\nold\nc', 'a\nnew\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'old' },
      { kind: 'added', text: 'new' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('treats an empty before as all added', () => {
    expect(diffLines('', 'a\nb')).toEqual([
      { kind: 'added', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
  });

  it('treats an empty after as all removed', () => {
    expect(diffLines('a\nb', '')).toEqual([
      { kind: 'removed', text: 'a' },
      { kind: 'removed', text: 'b' },
    ]);
  });

  it('is stable around trailing newlines', () => {
    expect(diffLines('a\n', 'a')).toEqual([{ kind: 'same', text: 'a' }]);
    expect(diffLines('a', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
  });

  it('two empty strings diff to nothing', () => {
    expect(diffLines('', '')).toEqual([]);
  });
});
