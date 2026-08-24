/**
 * Line diff for the edit-history dialog. Classic LCS dynamic programming —
 * memo content is capped at a few KB, so the O(n·m) table stays tiny.
 */
export interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/** One trailing newline is presentation, not content — don't diff it. */
function toLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\n$/, '').split('\n');
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = toLines(before);
  const b = toLines(after);

  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      result.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      result.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < a.length) result.push({ kind: 'removed', text: a[i++]! });
  while (j < b.length) result.push({ kind: 'added', text: b[j++]! });
  return result;
}
