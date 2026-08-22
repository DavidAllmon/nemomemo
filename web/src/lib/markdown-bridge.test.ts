import { extractProps } from '@nemomemo/shared';
import { describe, expect, it } from 'vitest';
import { markdownRoundTrip } from './markdown-bridge.js';

/**
 * The fidelity contract for the WYSIWYG editor: stored markdown goes through
 * parse → rich document → serialize and must come back meaning the same thing.
 * Level 1: extraction equivalence — tags/mentions/tasks/properties identical.
 * Level 2: byte stability — for canonical markdown, output === input.
 */

const trim = (s: string) => s.replace(/\n+$/, '');

function expectStable(markdown: string) {
  expect(trim(markdownRoundTrip(markdown))).toBe(trim(markdown));
}

function expectSameExtraction(markdown: string) {
  const before = extractProps(markdown);
  const after = extractProps(markdownRoundTrip(markdown));
  expect(after.tags).toEqual(before.tags);
  expect(after.mentions).toEqual(before.mentions);
  expect(after.property).toEqual(before.property);
}

describe('round-trip byte stability (canonical markdown)', () => {
  const cases: [string, string][] = [
    ['plain paragraph', 'Just a plain thought about the reef.'],
    ['tag at line start', '#swim every morning before work'],
    ['tag mid-line', 'remember to #swim/laps tomorrow'],
    ['mention', 'ask @coral about the tide charts'],
    ['mention and tag together', 'hey @marlin the #trips/tidepools plan is ready'],
    ['heading', '# Packing list'],
    ['bold and italic', 'this is **bold** and this is *italic* and ~~gone~~'],
    ['unordered list', '- first\n- second\n- third'],
    ['ordered list', '1. first\n2. second'],
    ['task list', '- [ ] buy snacks\n- [x] check tide chart'],
    ['inline code keeps tag literal', 'run `#!/bin/bash` scripts carefully'],
    ['code block keeps content literal', '```js\nconst tag = "#nottag";\nconst user = "@nobody";\n```'],
    ['link', 'see [the docs](https://example.com) for more'],
    ['blockquote', '> just keep swimming'],
    ['multi-paragraph', 'First thought.\n\nSecond thought with #tag.'],
    ['heading then task list', '# Trip prep\n\n- [ ] towels\n- [x] snacks'],
  ];
  for (const [name, markdown] of cases) {
    it(name, () => expectStable(markdown));
  }
});

describe('extraction equivalence (payload can never drift)', () => {
  const cases: [string, string][] = [
    ['nested tags imply ancestors', 'planning #trips/tidepools/dawn with the crew'],
    ['tag at start of paragraph', '#journal\n\nQuiet morning, no plans.'],
    ['mentions are preserved', 'ping @coral and @marlin about saturday'],
    ['tasks counted the same', '- [ ] one\n- [x] two\n- [ ] three'],
    ['link property survives', 'reading <https://example.com> today'],
    ['code property survives', 'tried `sqlite3` today\n\n```sql\nselect 1;\n```'],
    ['everything at once', '# Plan\n\nhey @coral — #trips/tidepools at dawn\n\n- [ ] towels\n- [x] tide chart `low 6:40`\n\n> just keep swimming\n\n[charts](https://tides.example.com)'],
  ];
  for (const [name, markdown] of cases) {
    it(name, () => expectSameExtraction(markdown));
  }
});

describe('round-trip idempotence (serializing twice changes nothing)', () => {
  const cases = [
    'messy  spacing   stays meaningful',
    '* legacy bullet style\n* second',
    '#tag on its own line',
    'text with random * asterisk and _ underscore',
  ];
  for (const markdown of cases) {
    it(JSON.stringify(markdown.slice(0, 30)), () => {
      const once = markdownRoundTrip(markdown);
      const twice = markdownRoundTrip(once);
      expect(twice).toBe(once);
    });
  }
});
