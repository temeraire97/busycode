import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/bin.tsx' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  banner: {
    js: "#!/usr/bin/env node\nimport{createRequire as _createRequire}from'module';const require=_createRequire(import.meta.url);",
  },
  noExternal: ['ink', 'react', 'chalk'],
  external: ['react-devtools-core'],
  clean: true,
  sourcemap: false,
  dts: false,
});
