import { esbuildPlugin } from '@web/dev-server-esbuild';
import { fromRollup } from '@web/dev-server-rollup';
import rollupCommonjs from '@rollup/plugin-commonjs';
import { importMapsPlugin } from '@web/dev-server-import-maps';
//import { summaryReporter } from '@web/test-runner';
import { chromeLauncher } from '@web/test-runner';
import { visualRegressionPlugin } from "@web/test-runner-visual-regression/plugin";

const commonjs = fromRollup(rollupCommonjs);

export default {
  plugins: [
    importMapsPlugin({
      inject: {
        importMap: {
          imports: {
            // use compiled version of JSZip
            jszip: './node_modules/jszip/dist/jszip.js',
          },
        },
      },
    }),
    commonjs({
      include: ['**/node_modules/**/*', 'node_modules/**'],
      esmExternals: true,
      defaultIsModuleExports: true,
      requireReturnsDefault: true,
    }),
    esbuildPlugin({ ts: true }),
    visualRegressionPlugin({
      update: process.argv.includes('--update-visual-baseline'),
      failureThreshold: 0.01, // 1% threshold
      failureThresholdType: 'percent',
    }),
  ],
  nodeResolve: true,
  port: 9876,
  browsers: [
    chromeLauncher({
      launchOptions: {
        headless: false,
        args: [],
      },
    }),
  ],
  // reporters: [summaryReporter()],
};
