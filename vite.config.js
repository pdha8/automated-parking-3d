import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Outil de développement : POST /__snap?name=xxx (data URL PNG) -> fichier PNG
// dans le dossier défini par SNAP_DIR (sert à comparer le rendu avec la vidéo).
function snapPlugin() {
  return {
    name: 'dev-snapshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__snap', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const dir = process.env.SNAP_DIR;
        if (!dir) {
          res.statusCode = 400;
          res.end('SNAP_DIR not set');
          return;
        }
        const url = new URL(req.url, 'http://localhost');
        const name = (url.searchParams.get('name') || 'snap').replace(/[^\w.-]/g, '_');
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          const b64 = body.replace(/^data:image\/png;base64,/, '');
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `${name}.png`);
          fs.writeFileSync(file, Buffer.from(b64, 'base64'));
          res.end(file);
        });
      });
    },
  };
}

// Outil de développement : POST /__save?path=blender/work/... (corps binaire) ->
// fichier dans le dossier du projet (export de la scène vers Blender).
function savePlugin() {
  return {
    name: 'dev-save',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      server.middlewares.use('/__save', (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const rel = (url.searchParams.get('path') || '').replace(/\\/g, '/');
        if (req.method !== 'POST' || !rel.startsWith('blender/work/') || rel.includes('..')) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const file = path.join(root, rel);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, Buffer.concat(chunks));
          res.end(rel);
        });
      });
    },
  };
}

export default defineConfig({
  // chemins relatifs : le dossier dist/ fonctionne à la racine d'un domaine comme dans un sous-dossier
  base: './',
  plugins: [snapPlugin(), savePlugin()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
});
