import { get, writable } from 'svelte/store';

export type ScanPhase = 'IDLE' | 'UPLOADING' | 'ANALYZING' | 'COMPLETED';
export type ScanVerdict = 'VERIFICADO' | 'SOSPECHOSO' | 'ALERTA ROJA';

export interface ScannerState {
  phase: ScanPhase;
  progress: number;
  millis: number;
  fileName: string | null;
  fileSize: number;
  verdict: ScanVerdict | null;
  confidence: number;
  riskScore: number;
  reason: string;
  warnings: string[];
  logs: string[];
  completedAt: string | null;
}

const MAX_SCAN_SIZE_BYTES = 5 * 1024 * 1024;
const ANALYSIS_DURATION_MS = 20000;

const BASE_LOGS = [
  'BOOTSTRAP_ENGINE...',
  'CALIBRATING_NEURAL_LATTICE...',
  'SYNCING_AUDIO...',
  'EXTRACTING_MICRO_EXPRESSIONS...',
  'THERMAL_MAPPING_COMPLETE',
  'PIXEL_CONSISTENCY: 99%',
  'VOICEFORM_SIGNATURE_LOCKED',
  'TEMPORAL_FINGERPRINT_READY'
];

const initialState: ScannerState = {
  phase: 'IDLE',
  progress: 0,
  millis: 0,
  fileName: null,
  fileSize: 0,
  verdict: null,
  confidence: 0,
  riskScore: 0,
  reason: '',
  warnings: [],
  logs: [],
  completedAt: null
};

export const scannerState = writable<ScannerState>({ ...initialState });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getFinalReason(file: File, isAlert: boolean) {
  if (!isAlert) {
    return 'Coherencia biometrica estable. No se detectaron indicios de sintesis maliciosa.';
  }

  if (file.size > MAX_SCAN_SIZE_BYTES) {
    return 'El archivo supera el limite seguro de 5MB y requiere validacion manual.';
  }

  return "Patron nominal sospechoso detectado en el nombre del archivo ('fake').";
}

export async function analyzeVideo(file: File) {
  scannerState.update((state) => ({
    ...state,
    phase: 'UPLOADING',
    progress: 8,
    millis: 0,
    fileName: file.name,
    fileSize: file.size,
    verdict: null,
    confidence: 0,
    riskScore: 0,
    reason: '',
    warnings: [],
    logs: [...BASE_LOGS.slice(0, 2)],
    completedAt: null
  }));

  await wait(700);

  const isAlert = file.size > MAX_SCAN_SIZE_BYTES || /fake/i.test(file.name);
  const start = Date.now();
  const interval = 85;

  scannerState.update((state) => ({
    ...state,
    phase: 'ANALYZING',
    progress: 15,
    logs: [...BASE_LOGS]
  }));

  while (Date.now() - start < ANALYSIS_DURATION_MS) {
    const elapsed = Date.now() - start;
    const progress = Math.min(98, 15 + (elapsed / ANALYSIS_DURATION_MS) * 83);

    scannerState.update((state) => ({
      ...state,
      progress,
      millis: elapsed
    }));

    await wait(interval);
  }

  const verdict: ScanVerdict = isAlert ? 'ALERTA ROJA' : 'VERIFICADO';
  const confidence = isAlert ? 33.7 : 99.1;
  const riskScore = isAlert ? 92 : 8;

  scannerState.update((state) => ({
    ...state,
    phase: 'COMPLETED',
    progress: 100,
    millis: ANALYSIS_DURATION_MS,
    verdict,
    confidence,
    riskScore,
    reason: getFinalReason(file, isAlert),
    warnings: [],
    logs: [
      ...BASE_LOGS,
      isAlert ? 'DEEPFAKE_PROBABILITY: HIGH' : 'AUTHENTICITY_LOCK: CONFIRMED',
      'FORENSIC_SEQUENCE_COMPLETE'
    ],
    completedAt: new Date().toISOString()
  }));

  return get(scannerState);
}

export function resetScanner() {
  scannerState.set({ ...initialState });
}

export { ANALYSIS_DURATION_MS, MAX_SCAN_SIZE_BYTES };

export function beginScan(file: File) {
  scannerState.set({
    ...initialState,
    phase: 'UPLOADING',
    progress: 8,
    millis: 0,
    fileName: file.name,
    fileSize: file.size,
    logs: [...BASE_LOGS.slice(0, 2)]
  });
}

export function setAnalyzing() {
  scannerState.update((state) => ({
    ...state,
    phase: 'ANALYZING',
    progress: Math.max(state.progress, 15),
    logs: state.logs.length ? state.logs : [...BASE_LOGS]
  }));
}

export function tickScan(millis: number, progress: number) {
  scannerState.update((state) => ({
    ...state,
    millis,
    progress
  }));
}

export function completeScan(input: {
  verdict: ScanVerdict;
  confidence: number;
  riskScore: number;
  reason: string;
  warnings?: string[];
  logsExtra?: string[];
}) {
  scannerState.update((state) => ({
    ...state,
    phase: 'COMPLETED',
    progress: 100,
    verdict: input.verdict,
    confidence: input.confidence,
    riskScore: input.riskScore,
    reason: input.reason,
    warnings: input.warnings ?? [],
    logs: [...state.logs, ...(input.logsExtra ?? []), 'FORENSIC_SEQUENCE_COMPLETE'],
    completedAt: new Date().toISOString()
  }));
}
