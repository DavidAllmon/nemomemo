import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // Bundle the workspace package in; its npm deps stay external and are
  // declared in this package's dependencies so runtime resolution works.
  noExternal: ['@nemomemo/shared'],
});
