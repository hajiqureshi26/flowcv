import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const standaloneNext = path.join(standalone, '.next');

await mkdir(standaloneNext, { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(standaloneNext, 'static'), { recursive: true });

try {
  await access(path.join(root, 'public'));
  await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}