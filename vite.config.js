import { defineConfig } from 'vite';

// Keep the raw shell HTML for public-directory fixtures; production replaces it
// with the HTML emitted by the same build as home (one shared module graph).
function shellEntry() {
  let root;
  return {
    configResolved(config) { root = config.root.replaceAll('\\', '/'); },
    name: 'v41-shell-entry',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.path !== '/public/v41/index.html') return html;
        return html
          .replace(/<!-- modulepreload:start[\s\S]*?<!-- modulepreload:end -->/, '')
          .replace('src="shell.mjs"', 'src="/public/v41/shell.mjs"')
          .replace(/(<(?:link|script)\b[^>]*?\b(?:href|src)=")(?![a-z]+:|\/)([^"]+)"/g, '$1/v41/$2"');
      }
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entry = bundle['public/v41/index.html'];
        if (!entry || entry.type !== 'asset') throw new Error('Missing built v41 shell HTML');
        this.emitFile({ type: 'asset', fileName: 'v41/index.html', source: entry.source });
        delete bundle[entry.fileName];
        // Record the actual chunk membership; source-graph overlap alone cannot
        // tell whether a shared module is transferred in two different chunks.
        const chunks = Object.values(bundle).filter(item => item.type === 'chunk')
          .map(item => ({
            file: item.fileName,
            imports: item.imports,
            modules: item.moduleIds.map(id => id.replaceAll('\\', '/'))
              .filter(id => id.startsWith(root + '/'))
              .map(id => id.slice(root.length + 1)).sort()
          }));
        this.emitFile({ type: 'asset', fileName: '.vite/v41-module-graph.json', source: JSON.stringify(chunks) });
      }
    }
  };
}

export default defineConfig({
  plugins: [shellEntry()],
  build: {
    // All entry points share one module graph.
    manifest: true,
    rollupOptions: { input: { main: 'index.html', admin: 'admin.html', v41home: 'v41/home.html', v41shell: 'public/v41/index.html' } }
  },
  server: {
    // ChatGPT Work's internal preview hostname; keep host checks enabled.
    allowedHosts: ['terminal.local'],
    strictPort: true
  },
  preview: { allowedHosts: ['terminal.local'], strictPort: true }
});
