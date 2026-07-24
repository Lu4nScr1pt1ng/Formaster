import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifestVersion: 3,
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'Formaster',
    description:
      'Automatic form filling with mocked data, visual field mapping, and programmable per-site scripts',
    permissions: ['storage', 'tabs'],
    // Options/popup pages run custom generators through a QuickJS WASM VM
    // (see src/lib/generators/quickjs-runner.ts) for the live preview.
    // Compiling WASM needs 'wasm-unsafe-eval' explicitly — Chrome does NOT
    // grant it by default for extension pages (only content scripts get
    // that leeway). This is the store-sanctioned directive for WASM, unlike
    // 'unsafe-eval', so it needs no sandboxed page and no per-browser split.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: '{528dc21e-5250-4eb5-9b02-5a63d49e9a1f}',
          // Formaster never transmits data anywhere; everything stays in local storage.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
