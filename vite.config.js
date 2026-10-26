import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // ChatGPT Work's internal preview hostname; keep host checks enabled.
    allowedHosts: ['terminal.local'],
    strictPort: true
  },
  preview: { allowedHosts: ['terminal.local'], strictPort: true }
});
