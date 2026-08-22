export type PropertyKey = 'hasLink' | 'hasTaskList' | 'hasCode';

export type FilterChip =
  | { type: 'tagSearch'; value: string }
  | { type: 'contentSearch'; value: string }
  | { type: 'displayTime'; value: string } // YYYY-MM-DD (viewer's local day)
  | { type: 'pinned' }
  | { type: 'property'; value: PropertyKey };

/** Parse the memos-compatible `?filter=tagSearch:x,displayTime:2026-08-19` format. */
export function parseFilterParam(param: string | null): FilterChip[] {
  if (!param) return [];
  const chips: FilterChip[] = [];
  for (const piece of param.split(',')) {
    const colon = piece.indexOf(':');
    const factor = colon === -1 ? piece : piece.slice(0, colon);
    const value = colon === -1 ? '' : decodeURIComponent(piece.slice(colon + 1));
    if (factor === 'tagSearch' && value) chips.push({ type: 'tagSearch', value });
    else if (factor === 'contentSearch' && value) chips.push({ type: 'contentSearch', value });
    else if (factor === 'displayTime' && /^\d{4}-\d{2}-\d{2}$/.test(value))
      chips.push({ type: 'displayTime', value });
    else if (factor === 'pinned') chips.push({ type: 'pinned' });
    else if (factor === 'property.hasLink') chips.push({ type: 'property', value: 'hasLink' });
    else if (factor === 'property.hasTaskList') chips.push({ type: 'property', value: 'hasTaskList' });
    else if (factor === 'property.hasCode') chips.push({ type: 'property', value: 'hasCode' });
  }
  return chips;
}

export function serializeChips(chips: FilterChip[]): string {
  return chips
    .map((chip) => {
      switch (chip.type) {
        case 'pinned':
          return 'pinned';
        case 'property':
          return `property.${chip.value}`;
        default:
          return `${chip.type}:${encodeURIComponent(chip.value)}`;
      }
    })
    .join(',');
}

/** Compile chips to one filter expression string for the API (AND semantics). */
export function chipsToExpression(chips: FilterChip[]): string | undefined {
  const clauses: string[] = [];
  for (const chip of chips) {
    switch (chip.type) {
      case 'tagSearch':
        // Tags can't contain quotes/backslashes; strip rather than escape.
        clauses.push(`"${chip.value.replace(/["\\]/g, '')}" in tags`);
        break;
      case 'contentSearch': {
        // Escape backslashes FIRST, then quotes — a trailing `\` would
        // otherwise swallow the closing quote and break the whole filter.
        const escaped = chip.value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
        clauses.push(`content.contains("${escaped}")`);
        break;
      }
      case 'displayTime': {
        const [y, m, d] = chip.value.split('-').map(Number);
        const start = Math.floor(new Date(y!, m! - 1, d!).getTime() / 1000);
        const end = Math.floor(new Date(y!, m! - 1, d! + 1).getTime() / 1000);
        clauses.push(`created_ts >= ${start} && created_ts < ${end}`);
        break;
      }
      case 'pinned':
        clauses.push('pinned');
        break;
      case 'property': {
        const field = { hasLink: 'has_link', hasTaskList: 'has_task_list', hasCode: 'has_code' }[chip.value];
        clauses.push(field);
        break;
      }
    }
  }
  return clauses.length > 0 ? clauses.join(' && ') : undefined;
}

export function chipLabel(chip: FilterChip): string {
  switch (chip.type) {
    case 'tagSearch':
      return `#${chip.value}`;
    case 'contentSearch':
      return `"${chip.value}"`;
    case 'displayTime':
      return chip.value;
    case 'pinned':
      return 'Pinned';
    case 'property':
      return { hasLink: 'Has link', hasTaskList: 'Has tasks', hasCode: 'Has code' }[chip.value];
  }
}

export function chipKey(chip: FilterChip): string {
  return chip.type + (('value' in chip && chip.value) || '');
}
