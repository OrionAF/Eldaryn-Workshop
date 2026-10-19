import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Refuse to interpret timings until the complete semantic workloads and outcomes match. */
export function compareReports(reference, candidate) {
  for (const key of ['schema', 'command', 'datasetDigest', 'seed', 'reps', 'fights', 'warmup']) {
    if (reference[key] !== candidate[key]) throw new Error(`Incompatible benchmark ${key}`);
  }
  if (reference.stoppingReason !== 'completed' || candidate.stoppingReason !== 'completed') throw new Error('Partial runs cannot support a complete comparison');
  if (reference.cases.length !== candidate.cases.length) throw new Error('Different case coverage');
  const cases = reference.cases.map((before, i) => {
    const after = candidate.cases[i];
    if (before.name !== after.name || !before.inputDigest || before.inputDigest !== after.inputDigest) throw new Error(`Different workload: ${before.name}`);
    if (!!before.search !== !!after.search || (before.search && (before.search.status !== 'done' || after.search.status !== 'done'))) {
      throw new Error(`Incomplete or mismatched search: ${before.name}`);
    }
    if (before.checksum !== after.checksum || before.search?.outcomeDigest !== after.search?.outcomeDigest) throw new Error(`Different outcomes: ${before.name}`);
    const ratio = (a, b) => Number.isFinite(a) && a > 0 && Number.isFinite(b) ? 1 - b / a : null;
    return { name: before.name, referenceMsPerFight: before.msPerFight.median, candidateMsPerFight: after.msPerFight.median,
      kernelTimeReduction: ratio(before.msPerFight.median, after.msPerFight.median),
      referenceSearchMs: before.search?.elapsedMs ?? null, candidateSearchMs: after.search?.elapsedMs ?? null,
      searchTimeReduction: ratio(before.search?.elapsedMs, after.search?.elapsedMs) };
  });
  return { cases, identicalInputsAndOutcomes: true, referenceElapsedMs: reference.elapsedMs, candidateElapsedMs: candidate.elapsedMs,
    caveat: 'Fresh-process end-to-end timings are descriptive; use repeated/interleaved measurements before claiming a general gain.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b] = process.argv.slice(2);
  console.log(JSON.stringify(compareReports(JSON.parse(readFileSync(a, 'utf8')), JSON.parse(readFileSync(b, 'utf8'))), null, 2));
}
