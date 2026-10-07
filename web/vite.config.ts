import { defineConfig } from 'vite';
// Relative assets work both at username.github.io/ and /repository/.
export default defineConfig(({ command }) => ({
  base: './',
  build: { target: 'es2022' },
  plugins: command === 'build' ? [{
    name: 'local-only-csp',
    transformIndexHtml(html: string) {
      return html.replace('<!-- production-csp -->', `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; worker-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'">`);
    },
  }] : [],
}));
