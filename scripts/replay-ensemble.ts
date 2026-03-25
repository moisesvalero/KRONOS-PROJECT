/**
 * Recalcula riskScore y ensembleVotes en cada *.kronos.json de imagen
 * usando las métricas guardadas en features.forensic (sin abrir el navegador).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { ForensicInputs, SpecialistVote } from '../src/lib/ensemble/EnsembleManager.ts';
import { EnsembleManager } from '../src/lib/ensemble/EnsembleManager.ts';

const ROOT = process.cwd();
const DIRS = [path.join(ROOT, 'tests', 'dataset', 'reales'), path.join(ROOT, 'tests', 'dataset', 'fakes')];

function metadataFromWarnings(warnings: string[]) {
  const w = warnings ?? [];
  return {
    thirdParty: w.some((s) => /Software de Terceros|Terceros detected/i.test(s)),
    originNoVerify: w.some((s) => /Origen Digital No Verificado/i.test(s)),
    missingCameraMeta: w.some((s) => /Metadatos de Cámara Incompletos/i.test(s))
  };
}

function forensicFromFeatures(f: Record<string, unknown>): ForensicInputs {
  return {
    roiPerfectPts: Number(f.roiPerfectPts ?? 0),
    roiNoiseMismatchPts: Number(f.roiNoiseMismatchPts ?? 0),
    elaSynthetic: Boolean(f.elaSynthetic),
    elaUniformity: Number(f.elaUniformity ?? 0),
    frequencySynthetic: Boolean(f.frequencySynthetic),
    freqPeakiness: Number(f.freqPeakiness ?? 0),
    freqRadialVar: Number(f.freqRadialVar ?? 0),
    textureSynthetic: Boolean(f.textureSynthetic),
    textureRepeatScore: Number(f.textureRepeatScore ?? 0),
    edgesSmoothedSynthetic: Boolean(f.edgesSmoothedSynthetic),
    localEditLikely: Boolean(f.localEditLikely),
    vectorGraphicLike: Boolean(f.vectorGraphicLike),
    noiseMean: Number(f.noiseMean ?? 0),
    noiseUniformity: Number(f.noiseUniformity ?? 0),
    edgePerfectionScore: Number(f.edgePerfectionScore ?? 0),
    edgeSharpnessMean: Number(f.edgeSharpnessMean ?? 0),
    renderSignatureScore: Number(f.renderSignatureScore ?? 0),
    lightingInconsistencyScore: Number(f.lightingInconsistencyScore ?? 0),
    localElaCv: Number(f.localElaCv ?? 0),
    localElaPeakRatio: Number(f.localElaPeakRatio ?? 0)
  };
}

function toExportVotes(votes: SpecialistVote[]) {
  return votes.map((v) => {
    const fake = Math.max(0, Math.min(100, v.fakeScore0to100));
    return {
      key: String(v.key ?? ''),
      label: String(v.label ?? v.key ?? 'unknown'),
      fake,
      real: Math.max(0, Math.min(100, 100 - fake)),
      weight: Number(v.weight ?? 0),
      applicable: Boolean(v.applicable ?? true),
      notes: Array.isArray(v.notes) ? v.notes.map(String) : []
    };
  });
}

function verdictFromScore(s: number) {
  if (s > 70) return 'ALERTA ROJA';
  if (s > 40) return 'SOSPECHOSO';
  return 'VERIFICADO';
}

function confidenceFromScore(s: number) {
  return Math.max(0, Math.min(100, 100 - s));
}

const em = new EnsembleManager();
let n = 0;

for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (!fs.statSync(fp).isFile()) continue;
    if (!/\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(name)) continue;

    const sidecarPath = `${fp}.kronos.json`;
    if (!fs.existsSync(sidecarPath)) continue;

    const raw = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as {
      file?: { kind?: string };
      warnings?: string[];
      features?: { forensic?: Record<string, unknown> };
    };

    if (raw.file?.kind !== 'image' || !raw.features?.forensic) continue;

    const ens = em.evaluate({
      kind: 'image',
      forensic: forensicFromFeatures(raw.features.forensic),
      metadata: metadataFromWarnings(raw.warnings ?? [])
    });

    const riskScore = Math.round(ens.finalFakeScore0to100);
    const full = raw as Record<string, unknown>;
    full.riskScore = riskScore;
    full.verdict = verdictFromScore(riskScore);
    full.confidence = Number(confidenceFromScore(riskScore).toFixed(2));
    full.ensembleVotes = toExportVotes(ens.votes);
    full.replayedEnsembleAt = new Date().toISOString();

    fs.writeFileSync(sidecarPath, JSON.stringify(full, null, 2), 'utf8');
    console.log(path.relative(ROOT, sidecarPath), '->', riskScore, full.verdict);
    n += 1;
  }
}

console.log(`\nReplayed ${n} image sidecar(s).`);
