import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { useEffect, useRef } from 'react';
import { useMentionable, useTags, useViewer } from '@/hooks/queries.js';

/**
 * `@` completes reef members, `#` completes existing tags. The returned function
 * is stable (editors are built once) and reads the latest data through a ref.
 */
export function useMemberTagCompletions(): (context: CompletionContext) => CompletionResult | null {
  const { data: viewer } = useViewer();
  const { data: mentionable } = useMentionable(!!viewer);
  const { data: tagCounts } = useTags(!!viewer);
  const dataRef = useRef<{ users: { username: string; nickname: string }[]; tags: string[] }>({
    users: [],
    tags: [],
  });
  useEffect(() => {
    dataRef.current = {
      users: mentionable ?? [],
      tags: Object.keys(tagCounts ?? {}),
    };
  }, [mentionable, tagCounts]);

  const completionsRef = useRef((context: CompletionContext): CompletionResult | null => {
    const mention = context.matchBefore(/@[a-zA-Z0-9-]*/);
    if (mention) {
      const options = dataRef.current.users.map((member) => ({
        label: member.username,
        detail: member.nickname !== member.username ? member.nickname : undefined,
      }));
      if (options.length === 0) return null;
      return { from: mention.from + 1, options, validFor: /^[a-zA-Z0-9-]*$/ };
    }
    const tag = context.matchBefore(/#[\p{L}\p{N}_/-]*/u);
    if (tag) {
      const options = dataRef.current.tags.map((name) => ({ label: name }));
      if (options.length === 0) return null;
      return { from: tag.from + 1, options, validFor: /^[\p{L}\p{N}_/-]*$/u };
    }
    return null;
  });
  return completionsRef.current;
}
