// Load only our own frozen engine source for an interleaved before/after comparison.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export default { plugins: [{ name: 'frozen-performance-reference', enforce: 'pre', transform(code, id) {
  if (!id.endsWith('/engine/pve/celestial.js?perfReference')
    && !(process.env.ELDARYN_PERF_ALL_REFERENCE === '1' && id.endsWith('/engine/pve/celestial.js'))) return;
  const folder = process.env.ELDARYN_PERF_REFERENCE;
  if (!folder) throw new Error('Set ELDARYN_PERF_REFERENCE to a frozen benchmark folder');
  const manifest = JSON.parse(readFileSync(`${folder}/manifest.json`, 'utf8'));
  const source = readFileSync(`${folder}/celestial-source.local.txt`, 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== manifest.celestialSourceDigest) throw new Error('Frozen reference source checksum mismatch');
  return { code: `${source}\nexport const __BENCHMARK_REFERENCE_DIGEST = ${JSON.stringify(manifest.celestialSourceDigest)};\n`, map: null };
} }] };
