import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'dist'), { recursive: true });
await mkdir(path.join(root, 'release'), { recursive: true });
const result = await build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, write: false,
  minify: true, format: 'iife', target: ['es2022'], legalComments: 'inline',
  define: { __BUILD_VERSION__: JSON.stringify('0.1.0') },
});
const js = result.outputFiles[0].text;
const template = await readFile(path.join(root, 'src/index.html'), 'utf8');
const css = await readFile(path.join(root, 'src/styles.css'), 'utf8');
await writeFile(path.join(root, 'dist/game.js'), js);
await writeFile(path.join(root, 'dist/styles.css'), css);
await writeFile(path.join(root, 'dist/index.html'), template.replace('<!--STYLE-->', '<link rel="stylesheet" href="./styles.css">').replace('<!--SCRIPT-->', '<script src="./game.js" defer></script>'));
await writeFile(path.join(root, 'release/Little_Moon_Play.html'), template.replace('<!--STYLE-->', `<style>${css}</style>`).replace('<!--SCRIPT-->', `<script>${js}</script>`));
console.log(`Built browser app and offline standalone (${Math.round((js.length + css.length) / 1024)} KiB).`);
