import { parseFilter, type FilterNode, type TimeValue } from '@nemomemo/shared';

/**
 * Turn raw user search text into a safe FTS5 phrase-prefix query
 * (`"coral reef"*`), or null when the input has no indexable tokens
 * (punctuation/emoji only — the caller falls back to LIKE).
 */
export function toFtsMatchQuery(value: string): string | null {
  const tokens = value.match(/[\p{L}\p{N}_]+/gu);
  if (!tokens || tokens.length === 0) return null;
  return `"${tokens.join(' ')}"*`;
}

export interface CompiledFilter {
  /** SQL fragment referencing the `memo` table; safe to AND with other clauses. */
  sql: string;
  params: unknown[];
}

/**
 * Compile a parsed filter AST to a parameterized SQLite WHERE fragment.
 * `now` is frozen once per compile so one filter sees one instant.
 */
export function compileFilter(node: FilterNode, nowEpoch: number): CompiledFilter {
  const params: unknown[] = [];

  const timeValue = (value: TimeValue): number =>
    value.kind === 'epoch' ? value.value : nowEpoch + value.offsetSeconds;

  const walk = (n: FilterNode): string => {
    switch (n.type) {
      case 'and':
        return `(${walk(n.left)} AND ${walk(n.right)})`;
      case 'or':
        return `(${walk(n.left)} OR ${walk(n.right)})`;
      case 'not':
        return `(NOT ${walk(n.operand)})`;
      case 'contentMatch': {
        const escaped = n.value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
        const pattern =
          n.mode === 'contains'
            ? `%${escaped}%`
            : n.mode === 'startsWith'
              ? `${escaped}%`
              : `%${escaped}`;
        params.push(pattern);
        return `(memo.content LIKE ? ESCAPE '\\' COLLATE NOCASE)`;
      }
      case 'tagIn': {
        const clauses = n.values.map((value) => {
          params.push(value);
          return `EXISTS (SELECT 1 FROM json_each(memo.payload, '$.tags') WHERE json_each.value = ?)`;
        });
        return `(${clauses.join(' OR ')})`;
      }
      case 'visibilityIn': {
        const placeholders = n.values.map(() => '?').join(', ');
        params.push(...n.values);
        return `(memo.visibility ${n.negated ? 'NOT IN' : 'IN'} (${placeholders}))`;
      }
      case 'pinned':
        return `(memo.pinned = ${n.value ? 1 : 0})`;
      case 'property': {
        const jsonPath = {
          has_link: '$.property.hasLink',
          has_code: '$.property.hasCode',
          has_task_list: '$.property.hasTaskList',
          has_incomplete_tasks: '$.property.hasIncompleteTasks',
        }[n.field];
        // json_extract yields 1/0 for JSON true/false; missing payload -> NULL -> COALESCE false.
        return `(COALESCE(json_extract(memo.payload, '${jsonPath}'), 0) = ${n.value ? 1 : 0})`;
      }
      case 'timeCmp': {
        params.push(timeValue(n.value));
        return `(memo.${n.field} ${n.op} ?)`;
      }
    }
  };

  return { sql: walk(node), params };
}

/** Parse + compile in one step. Throws FilterParseError on bad expressions. */
export function compileFilterExpression(expression: string, nowEpoch: number): CompiledFilter {
  return compileFilter(parseFilter(expression), nowEpoch);
}
