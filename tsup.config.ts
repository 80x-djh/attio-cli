import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['bin/attio.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
});
