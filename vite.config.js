import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // 관리자 화면은 별도 진입점이다 — src/main.js를 건드리지 않아 화면 파일 겹침이 줄어든다(#67).
    rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } }
  },
  server: {
    // ChatGPT Work's internal preview hostname; keep host checks enabled.
    allowedHosts: ['terminal.local'],
    strictPort: true
  },
  preview: { allowedHosts: ['terminal.local'], strictPort: true }
});
