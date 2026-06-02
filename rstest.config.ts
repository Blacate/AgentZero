import { defineConfig } from '@rstest/core';
import { withRslibConfig } from '@rstest/adapter-rslib';

export default defineConfig({
  extends: withRslibConfig(),
  setupFiles: ['./tests/setup.ts'],
  unstubGlobals: true,
  unstubEnvs: true,
});
