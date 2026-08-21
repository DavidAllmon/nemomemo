import type { Visibility } from '../constants.js';

export type PropertyField = 'has_link' | 'has_code' | 'has_task_list' | 'has_incomplete_tasks';
export type TimeField = 'created_ts' | 'updated_ts';
export type CmpOp = '>' | '>=' | '<' | '<=' | '==' | '!=';

/** Time value: an absolute epoch (seconds) or `now` plus an offset in seconds. */
export type TimeValue = { kind: 'epoch'; value: number } | { kind: 'now'; offsetSeconds: number };

export type FilterNode =
  | { type: 'and'; left: FilterNode; right: FilterNode }
  | { type: 'or'; left: FilterNode; right: FilterNode }
  | { type: 'not'; operand: FilterNode }
  | { type: 'contentMatch'; mode: 'contains' | 'startsWith' | 'endsWith'; value: string }
  | { type: 'tagIn'; values: string[] }
  | { type: 'visibilityIn'; values: Visibility[]; negated: boolean }
  | { type: 'pinned'; value: boolean }
  | { type: 'property'; field: PropertyField; value: boolean }
  | { type: 'timeCmp'; field: TimeField; op: Exclude<CmpOp, '==' | '!='>; value: TimeValue };

export class FilterParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(`${message} (at position ${position})`);
    this.name = 'FilterParseError';
  }
}
