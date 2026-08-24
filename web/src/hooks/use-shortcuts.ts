import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** The bindings, in the order the cheat sheet lists them. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['c'], label: 'Write a new memo' },
  { keys: ['/'], label: 'Search your reef' },
  { keys: ['⌘', 'K'], label: 'Search (also Ctrl K)' },
  { keys: ['j'], label: 'Next memo in the feed' },
  { keys: ['k'], label: 'Previous memo' },
  { keys: ['e'], label: 'Edit the focused memo' },
  { keys: ['Enter'], label: 'Open the focused memo' },
  { keys: ['Esc'], label: 'Let go of the focused memo' },
  { keys: ['?'], label: 'This cheat sheet' },
];

const CARD = '[data-memo-card]';

/** True when the keystroke belongs to something else — typing, or a dialog. */
function isBusy(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (target) {
    if (target.isContentEditable) return true; // TipTap is contenteditable
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.closest('[data-no-shortcuts]')) return true;
  }
  // An open dialog owns the keyboard (search, cheat sheet, confirmations).
  return document.querySelector('[role="dialog"]') != null;
}

/** The feed cursor is the DOM's, not React's — immune to feed re-renders. */
function focusedCard(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  return active?.closest<HTMLElement>(CARD) ?? null;
}

function moveFocus(delta: 1 | -1): void {
  const cards = [...document.querySelectorAll<HTMLElement>(CARD)];
  if (cards.length === 0) return;
  const current = focusedCard();
  const index = current ? cards.indexOf(current) : -1;
  const next = index === -1 ? (delta === 1 ? 0 : cards.length - 1) : index + delta;
  const target = cards[Math.max(0, Math.min(cards.length - 1, next))];
  target?.focus();
  target?.scrollIntoView({ block: 'nearest' });
}

/**
 * One global keydown listener for the app's single-key shortcuts. ⌘K stays in
 * AppShell — it's a modifier combo and this hook deliberately ignores those.
 */
export function useShortcuts({ onSearch, onHelp }: { onSearch: () => void; onHelp: () => void }): void {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isBusy(event)) return;

      // '?' is Shift+/ — check it before the plain '/' branch.
      if (event.key === '?') {
        event.preventDefault();
        onHelp();
        return;
      }
      if (event.shiftKey && event.key !== 'Enter') return;

      switch (event.key) {
        case 'c': {
          event.preventDefault();
          // Already home: the mounted editor hears the event. Elsewhere: router
          // state rides along so the editor can focus itself once it exists.
          if (location.pathname === '/') window.dispatchEvent(new Event('nemo:compose'));
          else navigate('/', { state: { compose: true } });
          return;
        }
        case '/': {
          event.preventDefault();
          onSearch();
          return;
        }
        case 'j': {
          event.preventDefault();
          moveFocus(1);
          return;
        }
        case 'k': {
          event.preventDefault();
          moveFocus(-1);
          return;
        }
        case 'e': {
          const card = focusedCard();
          const edit = card?.querySelector<HTMLElement>('[data-memo-edit]');
          if (edit) {
            event.preventDefault();
            edit.click();
          }
          return;
        }
        case 'Enter': {
          const uid = focusedCard()?.dataset.memoUid;
          if (uid) {
            event.preventDefault();
            navigate(`/memos/${uid}`);
          }
          return;
        }
        case 'Escape': {
          focusedCard()?.blur();
          return;
        }
        default:
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [location.pathname, navigate, onHelp, onSearch]);
}
