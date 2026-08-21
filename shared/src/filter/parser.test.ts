import { describe, expect, it } from 'vitest';
import { FilterParseError, parseDuration, parseFilter, validateFilter } from './parser.js';

describe('parseFilter', () => {
  it('parses content.contains', () => {
    expect(parseFilter('content.contains("roadmap")')).toEqual({
      type: 'contentMatch',
      mode: 'contains',
      value: 'roadmap',
    });
  });

  it('parses startsWith and endsWith', () => {
    expect(parseFilter('content.startsWith("TODO")')).toMatchObject({ mode: 'startsWith' });
    expect(parseFilter('content.endsWith("done")')).toMatchObject({ mode: 'endsWith' });
  });

  it('parses "x" in tags', () => {
    expect(parseFilter('"work" in tags')).toEqual({ type: 'tagIn', values: ['work'] });
  });

  it('parses tag in [...]', () => {
    expect(parseFilter('tag in ["work", "personal"]')).toEqual({
      type: 'tagIn',
      values: ['work', 'personal'],
    });
  });

  it('parses visibility comparisons', () => {
    expect(parseFilter('visibility == "PUBLIC"')).toEqual({
      type: 'visibilityIn',
      values: ['PUBLIC'],
      negated: false,
    });
    expect(parseFilter('visibility != "PRIVATE"')).toMatchObject({ negated: true });
    expect(parseFilter('visibility in ["PUBLIC", "PROTECTED"]')).toMatchObject({
      values: ['PUBLIC', 'PROTECTED'],
    });
  });

  it('parses bare and compared booleans', () => {
    expect(parseFilter('pinned')).toEqual({ type: 'pinned', value: true });
    expect(parseFilter('pinned == false')).toEqual({ type: 'pinned', value: false });
    expect(parseFilter('has_link')).toEqual({ type: 'property', field: 'has_link', value: true });
    expect(parseFilter('has_incomplete_tasks != true')).toEqual({
      type: 'property',
      field: 'has_incomplete_tasks',
      value: false,
    });
  });

  it('parses time comparisons with now and duration', () => {
    expect(parseFilter('created_ts >= now - duration("24h")')).toEqual({
      type: 'timeCmp',
      field: 'created_ts',
      op: '>=',
      value: { kind: 'now', offsetSeconds: -86400 },
    });
    expect(parseFilter('updated_ts < 1700000000')).toEqual({
      type: 'timeCmp',
      field: 'updated_ts',
      op: '<',
      value: { kind: 'epoch', value: 1700000000 },
    });
  });

  it('parses timestamp()', () => {
    const node = parseFilter('created_ts >= timestamp("2026-01-01T00:00:00Z")');
    expect(node).toMatchObject({
      value: { kind: 'epoch', value: Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000) },
    });
  });

  it('parses boolean combinators with precedence and parens', () => {
    const node = parseFilter('pinned && has_link || has_code');
    expect(node.type).toBe('or');
    const grouped = parseFilter('pinned && (has_link || has_code)');
    expect(grouped.type).toBe('and');
    expect(parseFilter('!pinned')).toEqual({
      type: 'not',
      operand: { type: 'pinned', value: true },
    });
  });

  it('parses the built-in Tasks view expression', () => {
    expect(parseFilter('has_task_list && has_incomplete_tasks')).toMatchObject({ type: 'and' });
  });

  it('rejects bad input with positions', () => {
    expect(() => parseFilter('')).toThrow(FilterParseError);
    expect(() => parseFilter('bogus == 1')).toThrow(/Unknown field/);
    expect(() => parseFilter('visibility == "LOUD"')).toThrow(/visibility must be/);
    expect(() => parseFilter('content.contains("x') ).toThrow(/Unterminated/);
    expect(() => parseFilter('tag in []')).toThrow(/must not be empty/);
    expect(() => parseFilter('pinned &&')).toThrow(FilterParseError);
    expect(() => parseFilter('pinned extra')).toThrow(/trailing/);
  });

  it('validateFilter returns message or null', () => {
    expect(validateFilter('pinned')).toBeNull();
    expect(validateFilter('nope')).toMatch(/Unknown field/);
  });
});

describe('parseDuration', () => {
  it('parses units', () => {
    expect(parseDuration('30s')).toBe(30);
    expect(parseDuration('5m')).toBe(300);
    expect(parseDuration('24h')).toBe(86400);
    expect(parseDuration('7d')).toBe(604800);
  });
  it('rejects junk', () => {
    expect(() => parseDuration('abc')).toThrow(/Invalid duration/);
  });
});
