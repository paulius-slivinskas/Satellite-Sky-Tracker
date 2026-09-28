import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: { ignored: ['**/test-results*/**', '**/playwright-report/**'] },
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'map', test: /node_modules\/(leaflet|satellite\.js)\// },
            {
              name: 'ui',
              test: /node_modules\/(@heroui|react-aria|react-stately|@react-aria|@react-stately|@internationalized)\//,
            },
          ],
        },
      },
    },
  },
});
