'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { useEffect } from 'react';

/**
 * Site-wide inertia scrolling (Lenis) wired into GSAP's ScrollTrigger, plus
 * eased anchor navigation. Lenis animates the native scroll position, so the
 * CSS scroll-driven story scene keeps working untouched. Emits `reef:scroll`
 * events (scroll + velocity) that the WebGL water listens to.
 */
export function SmoothScroll() {
  useEffect(() => {
    // Close the mobile menu after any link tap (independent of motion prefs).
    const closeMenu = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a');
      const menu = (event.target as HTMLElement).closest('details');
      if (link && menu) menu.removeAttribute('open');
    };
    document.addEventListener('click', closeMenu);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => document.removeEventListener('click', closeMenu);
    }

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ lerp: 0.12 });
    lenis.on('scroll', () => {
      ScrollTrigger.update();
      window.dispatchEvent(
        new CustomEvent('reef:scroll', {
          detail: { scroll: lenis.scroll, velocity: lenis.velocity },
        }),
      );
    });

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href*="#"]');
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname !== window.location.pathname || !url.hash) return;
      const target = document.querySelector<HTMLElement>(url.hash);
      if (!target) return;
      event.preventDefault();
      history.pushState(null, '', url.hash);
      lenis.scrollTo(target, { offset: -64, duration: 1.4 });
    };
    document.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('click', onClick);
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}
