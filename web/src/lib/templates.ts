/**
 * Built-in memo skeletons. `{date}` becomes the local date at apply time —
 * the browser owns the timezone, same rule as the rest of the time layer.
 */
export interface BuiltInTemplate {
  id: string;
  title: string;
  content: string;
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'builtin-journal',
    title: 'Daily journal',
    content: '# Journal — {date}\n\n**Today I…**\n\n- \n\n**Grateful for**\n\n- \n\n#journal',
  },
  {
    id: 'builtin-standup',
    title: 'Standup',
    content: '**Yesterday**\n\n- \n\n**Today**\n\n- \n\n**Blockers**\n\n- \n\n#standup',
  },
  {
    id: 'builtin-meeting',
    title: 'Meeting note',
    content:
      '# Meeting — {date}\n\n**Who:** \n\n**Decisions**\n\n- \n\n**Action items**\n\n- [ ] \n\n#meetings',
  },
  {
    id: 'builtin-recipe',
    title: 'Recipe',
    content: '# Recipe: \n\n**Ingredients**\n\n- \n\n**Steps**\n\n1. \n\n#recipes',
  },
];

/** Fill template tokens; today only `{date}` (local, e.g. "Aug 24, 2026"). */
export function applyTemplate(content: string): string {
  const date = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return content.replaceAll('{date}', date);
}
