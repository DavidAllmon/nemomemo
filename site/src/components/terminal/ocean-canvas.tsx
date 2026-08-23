'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * The living water behind the terminal: layered marine-snow particle fields
 * with depth parallax, drifting on their own and reacting to scroll velocity
 * and the pointer. Fixed full-viewport canvas at z-0; page content sits above
 * it, so the DOM (and SEO) are untouched. Skipped entirely for reduced-motion
 * users and paused when the tab is hidden.
 */

interface Layer {
  points: THREE.Points;
  parallax: number;
  drift: number;
  material: THREE.PointsMaterial;
  baseOpacity: number;
}

function makeSpeckTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function OceanCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const isMobile = window.innerWidth < 768;
    const WORLD_H = 220; // wrapping height of each particle field, in world units

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      400,
    );
    camera.position.z = 100;

    const speck = makeSpeckTexture();

    // Depth layers: far = small/dim/slow, near = larger/brighter/faster.
    const layerSpecs = [
      { count: isMobile ? 260 : 520, size: 1.1, opacity: 0.16, color: 0xbcd2e8, parallax: 0.006, drift: 0.55, z: -80 },
      { count: isMobile ? 180 : 360, size: 1.9, opacity: 0.22, color: 0xcfe0f0, parallax: 0.012, drift: 0.9, z: -30 },
      { count: isMobile ? 90 : 190, size: 3.1, opacity: 0.28, color: 0xdcebf7, parallax: 0.022, drift: 1.4, z: 15 },
    ];
    // A sparse sprinkle of brand-colored motes among the snow.
    const accents = [
      { count: isMobile ? 10 : 22, size: 2.6, opacity: 0.35, color: 0xf59a53, parallax: 0.016, drift: 1.1, z: 0 },
      { count: isMobile ? 12 : 26, size: 2.6, opacity: 0.35, color: 0x7aa7f0, parallax: 0.018, drift: 1.2, z: 5 },
    ];

    const layers: Layer[] = [...layerSpecs, ...accents].map((spec) => {
      const positions = new Float32Array(spec.count * 3);
      for (let i = 0; i < spec.count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 340;
        positions[i * 3 + 1] = (Math.random() - 0.5) * WORLD_H * 2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        size: spec.size,
        map: speck,
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, material);
      points.position.z = spec.z;
      scene.add(points);
      return { points, parallax: spec.parallax, drift: spec.drift, material, baseOpacity: spec.opacity };
    });

    let scroll = window.scrollY;
    let velocity = 0;
    const onReefScroll = (event: Event) => {
      const detail = (event as CustomEvent<{ scroll: number; velocity: number }>).detail;
      scroll = detail.scroll;
      velocity = detail.velocity;
    };
    window.addEventListener('reef:scroll', onReefScroll);
    // Fallback when Lenis isn't driving (e.g. it failed to init).
    const onNativeScroll = () => {
      scroll = window.scrollY;
    };
    window.addEventListener('scroll', onNativeScroll, { passive: true });

    let pointerX = 0;
    let pointerY = 0;
    const onPointer = (event: PointerEvent) => {
      pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    let smoothedVelocity = 0;
    const clock = new THREE.Clock();
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const t = clock.getElapsedTime();
      smoothedVelocity += (velocity - smoothedVelocity) * 0.06;
      velocity *= 0.94;
      const speedBoost = Math.min(Math.abs(smoothedVelocity) * 0.02, 1.2);

      for (const layer of layers) {
        // Upward marine-snow drift + scroll parallax (scrolling down = world rises).
        const y = t * layer.drift + scroll * layer.parallax;
        layer.points.position.y = ((y % (WORLD_H * 2)) + WORLD_H * 2) % (WORLD_H * 2) - WORLD_H;
        layer.points.position.x = Math.sin(t * 0.05 * layer.drift) * 4;
        layer.material.opacity = layer.baseOpacity * (1 + speedBoost * 0.5);
      }
      camera.position.x += (pointerX * 6 - camera.position.x) * 0.03;
      camera.position.y += (-pointerY * 4 - camera.position.y) * 0.03;
      renderer.render(scene, camera);
    };
    render();

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
      } else {
        clock.getDelta();
        render();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('reef:scroll', onReefScroll);
      window.removeEventListener('scroll', onNativeScroll);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', onResize);
      for (const layer of layers) {
        layer.points.geometry.dispose();
        layer.material.dispose();
      }
      speck.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <>
      {/* soft caustic glows behind the particles (cheap: plain CSS) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 38% at 68% -6%, oklch(0.42 0.07 220 / 0.35), transparent 70%), radial-gradient(ellipse 40% 30% at 12% 30%, oklch(0.3 0.06 255 / 0.3), transparent 70%)',
        }}
      />
      <div ref={mountRef} aria-hidden className="pointer-events-none fixed inset-0 z-0" />
      <div className="term-scan" aria-hidden />
    </>
  );
}
