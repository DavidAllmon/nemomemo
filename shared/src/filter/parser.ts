import { VISIBILITIES, type Visibility } from '../constants.js';
import {
  FilterParseError,
  type CmpOp,
  type FilterNode,
  type PropertyField,
  type TimeField,
  type TimeValue,
} from './ast.js';

export { FilterParseError };

// ---------- Tokenizer ----------

type Token =
  | { kind: 'ident'; value: string; pos: number }
  | { kind: 'string'; value: string; pos: number }
  | { kind: 'number'; value: number; pos: number }
  | { kind: 'op'; value: string; pos: number }
  | { kind: 'eof'; pos: number };

const OPERATORS = ['&&', '||', '==', '!=', '>=', '<=', '>', '<', '!', '(', ')', '[', ']', ',', '.', '-', '+'];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  outer: while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = '';
      while (j < input.length && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < input.length) {
          value += input[j + 1];
          j += 2;
        } else {
          value += input[j];
          j++;
        }
      }
      if (j >= input.length) throw new FilterParseError('Unterminated string', i);
      tokens.push({ kind: 'string', value, pos: i });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9]/.test(input[j]!)) j++;
      tokens.push({ kind: 'number', value: Number(input.slice(i, j)), pos: i });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j]!)) j++;
      tokens.push({ kind: 'ident', value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }
    for (const op of OPERATORS) {
      if (input.startsWith(op, i)) {
        tokens.push({ kind: 'op', value: op, pos: i });
        i += op.length;
        continue outer;
      }
    }
    throw new FilterParseError(`Unexpected character '${ch}'`, i);
  }
  tokens.push({ kind: 'eof', pos: input.length });
  return tokens;
}

// ---------- Parser ----------

const PROPERTY_FIELDS: PropertyField[] = ['has_link', 'has_code', 'has_task_list', 'has_incomplete_tasks'];
const TIME_FIELDS: TimeField[] = ['created_ts', 'updated_ts'];

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  parse(): FilterNode {
    const node = this.parseOr();
    const tok = this.peek();
    if (tok.kind !== 'eof') throw new FilterParseError('Unexpected trailing input', tok.pos);
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    return this.tokens[this.pos++]!;
  }

  private expectOp(value: string): Token {
    const tok = this.next();
    if (tok.kind !== 'op' || tok.value !== value) {
      throw new FilterParseError(`Expected '${value}'`, tok.pos);
    }
    return tok;
  }

  private tryOp(value: string): boolean {
    const tok = this.peek();
    if (tok.kind === 'op' && tok.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  private parseOr(): FilterNode {
    let left = this.parseAnd();
    while (this.tryOp('||')) {
      left = { type: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): FilterNode {
    let left = this.parseUnary();
    while (this.tryOp('&&')) {
      left = { type: 'and', left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): FilterNode {
    if (this.tryOp('!')) {
      return { type: 'not', operand: this.parseUnary() };
    }
    if (this.tryOp('(')) {
      const inner = this.parseOr();
      this.expectOp(')');
      return inner;
    }
    return this.parsePredicate();
  }

  private parsePredicate(): FilterNode {
    const tok = this.next();

    // "tagname" in tags
    if (tok.kind === 'string') {
      const inTok = this.next();
      if (inTok.kind !== 'ident' || inTok.value !== 'in') {
        throw new FilterParseError(`Expected 'in' after string literal`, inTok.pos);
      }
      const target = this.next();
      if (target.kind !== 'ident' || target.value !== 'tags') {
        throw new FilterParseError(`Expected 'tags'`, target.pos);
      }
      return { type: 'tagIn', values: [tok.value] };
    }

    if (tok.kind !== 'ident') {
      throw new FilterParseError('Expected a field name', tok.pos);
    }

    switch (tok.value) {
      case 'content': {
        this.expectOp('.');
        const method = this.next();
        if (
          method.kind !== 'ident' ||
          !['contains', 'startsWith', 'endsWith'].includes(method.value)
        ) {
          throw new FilterParseError(
            `content supports .contains(), .startsWith(), .endsWith()`,
            method.pos,
          );
        }
        this.expectOp('(');
        const arg = this.next();
        if (arg.kind !== 'string') throw new FilterParseError('Expected a string argument', arg.pos);
        this.expectOp(')');
        return {
          type: 'contentMatch',
          mode: method.value as 'contains' | 'startsWith' | 'endsWith',
          value: arg.value,
        };
      }

      case 'tag': {
        const inTok = this.next();
        if (inTok.kind !== 'ident' || inTok.value !== 'in') {
          throw new FilterParseError(`Expected 'in' after tag`, inTok.pos);
        }
        return { type: 'tagIn', values: this.parseStringList() };
      }

      case 'visibility': {
        const op = this.next();
        if (op.kind === 'op' && (op.value === '==' || op.value === '!=')) {
          const value = this.next();
          if (value.kind !== 'string' || !VISIBILITIES.includes(value.value as Visibility)) {
            throw new FilterParseError(
              `visibility must be one of ${VISIBILITIES.join(', ')}`,
              value.pos,
            );
          }
          return {
            type: 'visibilityIn',
            values: [value.value as Visibility],
            negated: op.value === '!=',
          };
        }
        if (op.kind === 'ident' && op.value === 'in') {
          const values = this.parseStringList();
          for (const value of values) {
            if (!VISIBILITIES.includes(value as Visibility)) {
              throw new FilterParseError(`Unknown visibility '${value}'`, op.pos);
            }
          }
          return { type: 'visibilityIn', values: values as Visibility[], negated: false };
        }
        throw new FilterParseError(`Expected ==, !=, or in after visibility`, op.pos);
      }

      case 'pinned':
        return { type: 'pinned', value: this.parseOptionalBoolComparison(tok.pos) };

      default: {
        if (PROPERTY_FIELDS.includes(tok.value as PropertyField)) {
          return {
            type: 'property',
            field: tok.value as PropertyField,
            value: this.parseOptionalBoolComparison(tok.pos),
          };
        }
        if (TIME_FIELDS.includes(tok.value as TimeField)) {
          const op = this.next();
          if (op.kind !== 'op' || !['>', '>=', '<', '<='].includes(op.value)) {
            throw new FilterParseError(`Expected a comparison after ${tok.value}`, op.pos);
          }
          return {
            type: 'timeCmp',
            field: tok.value as TimeField,
            op: op.value as Exclude<CmpOp, '==' | '!='>,
            value: this.parseTimeValue(),
          };
        }
        throw new FilterParseError(`Unknown field '${tok.value}'`, tok.pos);
      }
    }
  }

  /** For `pinned`, `has_link` etc: bare ident means true; `== true/false` optional. */
  private parseOptionalBoolComparison(pos: number): boolean {
    const tok = this.peek();
    if (tok.kind === 'op' && (tok.value === '==' || tok.value === '!=')) {
      this.pos++;
      const value = this.next();
      if (value.kind !== 'ident' || !['true', 'false'].includes(value.value)) {
        throw new FilterParseError('Expected true or false', value.pos);
      }
      const bool = value.value === 'true';
      return tok.value === '==' ? bool : !bool;
    }
    void pos;
    return true;
  }

  private parseStringList(): string[] {
    this.expectOp('[');
    const values: string[] = [];
    if (!this.tryOp(']')) {
      do {
        const tok = this.next();
        if (tok.kind !== 'string') throw new FilterParseError('Expected a string', tok.pos);
        values.push(tok.value);
      } while (this.tryOp(','));
      this.expectOp(']');
    }
    if (values.length === 0) {
      throw new FilterParseError('List must not be empty', this.peek().pos);
    }
    return values;
  }

  private parseTimeValue(): TimeValue {
    const tok = this.next();
    if (tok.kind === 'number') {
      return { kind: 'epoch', value: tok.value };
    }
    if (tok.kind === 'ident' && tok.value === 'now') {
      const sign = this.peek();
      if (sign.kind === 'op' && (sign.value === '-' || sign.value === '+')) {
        this.pos++;
        const factor = sign.value === '-' ? -1 : 1;
        const arg = this.next();
        if (arg.kind === 'number') {
          return { kind: 'now', offsetSeconds: factor * arg.value };
        }
        if (arg.kind === 'ident' && arg.value === 'duration') {
          this.expectOp('(');
          const str = this.next();
          if (str.kind !== 'string') throw new FilterParseError('Expected a duration string', str.pos);
          this.expectOp(')');
          return { kind: 'now', offsetSeconds: factor * parseDuration(str.value, str.pos) };
        }
        throw new FilterParseError('Expected a number or duration()', arg.pos);
      }
      return { kind: 'now', offsetSeconds: 0 };
    }
    if (tok.kind === 'ident' && tok.value === 'timestamp') {
      this.expectOp('(');
      const str = this.next();
      if (str.kind !== 'string') throw new FilterParseError('Expected a timestamp string', str.pos);
      this.expectOp(')');
      const ms = Date.parse(str.value);
      if (Number.isNaN(ms)) throw new FilterParseError(`Invalid timestamp '${str.value}'`, str.pos);
      return { kind: 'epoch', value: Math.floor(ms / 1000) };
    }
    throw new FilterParseError('Expected an epoch number, now, or timestamp()', tok.pos);
  }
}

/** Parse "24h", "30m", "10s", "7d" into seconds. */
export function parseDuration(value: string, pos = 0): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) throw new FilterParseError(`Invalid duration '${value}' (use e.g. "24h", "30m")`, pos);
  const amount = Number(match[1]);
  const unit = match[2]!;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit]!;
}

/** Parse a filter expression into an AST. Throws FilterParseError with position info. */
export function parseFilter(input: string): FilterNode {
  const trimmed = input.trim();
  if (!trimmed) throw new FilterParseError('Filter is empty', 0);
  return new Parser(tokenize(trimmed)).parse();
}

/** Validate without needing the AST; returns an error message or null. */
export function validateFilter(input: string): string | null {
  try {
    parseFilter(input);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
