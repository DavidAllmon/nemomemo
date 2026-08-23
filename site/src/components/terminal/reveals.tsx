'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect } from 'react';

/**
 * Scroll-choreographed entrances for elements marked with `data-reveal`
 * (self) or `data-reveal="stagger"` (direct children, cascaded). Uses
 * gsap.from(), so with no JS (or reduced motion) everything is simply visible.
 */
export function Reveals() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    // gsap.context + revert() restores inline styles on cleanup, so React's
    // dev-mode double-mount can't strand `from()` targets at opacity 0.
    const ctx = gsap.context(() => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
        const isStagger = el.dataset.reveal === 'stagger';
        const targets = isStagger ? Array.from(el.children) : el;
        gsap.from(targets, {
          opacity: 0,
          y: 22,
          duration: 0.75,
          ease: 'power2.out',
          stagger: isStagger ? 0.09 : 0,
          scrollTrigger: { trigger: el, start: 'top 88%' },
        });
      }
    });

    return () => ctx.revert();
  }, []);

  return null;
}
