import {defineConfig} from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/index.ts',
    'src/db.ts',
    'src/ucd.js',
    'src/ucdFile.ts',
    'src/utils.ts',
  ],
  format: 'esm',
  minify: true,
  outDir: 'lib',
  sourcemap: false,
  splitting: false,
  target: 'es2022',
  bundle: false,
});
