<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import * as faceapi from 'face-api.js';
  import exifr from 'exifr';
  import mediaInfoFactory from 'mediainfo.js';
  import Radar from '$lib/components/Scanner/Radar.svelte';
  import ReportModal from '$lib/components/ui/ReportModal.svelte';
  import {
    ANALYSIS_DURATION_MS,
    MAX_SCAN_SIZE_BYTES,
    beginScan,
    completeScan,
    resetScanner,
    scannerState,
    setAnalyzing,
    tickScan
  } from '$lib/stores/scanner';

  let isDragActive = $state(false);
  let selectedFile: File | null = $state(null);
  let videoUrl = $state('');
  let videoRef: HTMLVideoElement | null = $state(null);
  let canvasRef: HTMLCanvasElement | null = $state(null);
  let showReport = $state(false);
  let isBusy = $state(false);
  let raf = $state(0);

  let scan = $derived($scannerState);
  let hasVideo = $derived(Boolean(videoUrl));
  let displayMillis = $derived(Math.min(scan.millis, ANALYSIS_DURATION_MS));
  let laserProgress = $derived(Math.min(100, (displayMillis / ANALYSIS_DURATION_MS) * 100));

  let animatedLogIndex = $derived(
    scan.phase === 'ANALYZING'
      ? Math.min(
          scan.logs.length,
          Math.floor((displayMillis / ANALYSIS_DURATION_MS) * scan.logs.length) + 1
        )
      : scan.phase === 'COMPLETED'
        ? scan.logs.length
        : Math.max(2, Math.min(3, scan.logs.length))
  );

  let telemetry = $derived(scan.logs.slice(0, Math.max(2, animatedLogIndex)));
  let verdictClass = $derived(scan.verdict === 'ALERTA ROJA' ? 'danger' : 'safe');
  let badgeLabel = $derived(scan.verdict ?? scan.phase);

  const MODEL_BASE_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
  let modelsReady = $state(false);
  let modelLoading = $state(false);
  let lastLandmarks = $state<{ x: number; y: number }[] | null>(null);
  let jitterSeries = $state<number[]>([]);
  let scoreSeries = $state<number[]>([]);
  let lastFrameScore = $state<number>(0);
  let lastFrameJitter = $state<number>(0);

  // Cache para el overlay de bordes (solo se actualiza durante el escaneo)
  let edgeOverlayCanvas: HTMLCanvasElement | null = null;
  let neckEdgeCanvas: HTMLCanvasElement | null = null;
  let edgeOverlayRect: { x: number; y: number; w: number; h: number } | null = null;
  let lastMaskJitterScore = 0;

  let mediaInfoReady = $state(false);
  let mediaInfoLoading = $state(false);
  let mediaInfoInstance: { analyzeData: Function; close: Function } | null = null;

  function pushSeries(series: number[], next: number, max = 64) {
    const arr = [...series, next];
    if (arr.length > max) arr.splice(0, arr.length - max);
    return arr;
  }

  function sparklinePoints(values: number[], w: number, h: number, clampMax: number) {
    if (!values.length) return '';
    const min = 0;
    const max = clampMax || Math.max(1e-6, ...values);
    const usable = values.slice(-64);
    const step = usable.length > 1 ? w / (usable.length - 1) : w;
    return usable
      .map((v, i) => {
        const vv = Number.isFinite(v) ? v : 0;
        const t = Math.max(0, Math.min(1, (vv - min) / (max - min)));
        const x = i * step;
        const y = h - t * h;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  async function ensureModelsLoaded() {
    if (modelsReady || modelLoading) return;
    modelLoading = true;
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_BASE_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_BASE_URL)
      ]);
      modelsReady = true;
    } finally {
      modelLoading = false;
    }
  }

  async function readCameraMetadata(file: File) {
    try {
      const meta = await exifr.parse(file as unknown as Blob);
      const make = (meta?.Make ?? meta?.make ?? '').toString();
      const model = (meta?.Model ?? meta?.model ?? '').toString();
      const iso = Number(meta?.ISO ?? meta?.iso ?? NaN);
      const fNumber = Number(meta?.FNumber ?? meta?.fNumber ?? meta?.ApertureValue ?? NaN);
      const combined = `${make} ${model}`.trim();
      return { make, model, combined, iso: Number.isFinite(iso) ? iso : null, fNumber: Number.isFinite(fNumber) ? fNumber : null };
    } catch {
      return { make: '', model: '', combined: '', iso: null, fNumber: null };
    }
  }

  function isKnownCamera(makeOrModel: string) {
    return /(apple|samsung|sony)/i.test(makeOrModel);
  }

  async function ensureMediaInfoLoaded() {
    if (mediaInfoReady || mediaInfoLoading) return;
    mediaInfoLoading = true;
    try {
      mediaInfoInstance = (await mediaInfoFactory({
        format: 'object',
        full: true
      })) as unknown as { analyzeData: Function; close: Function };
      mediaInfoReady = true;
    } finally {
      mediaInfoLoading = false;
    }
  }

  function flattenStrings(input: unknown, out: string[] = []) {
    if (input == null) return out;
    if (typeof input === 'string') {
      out.push(input);
      return out;
    }
    if (typeof input === 'number' || typeof input === 'boolean') return out;
    if (Array.isArray(input)) {
      for (const v of input) flattenStrings(v, out);
      return out;
    }
    if (typeof input === 'object') {
      for (const v of Object.values(input as Record<string, unknown>)) flattenStrings(v, out);
    }
    return out;
  }

  async function auditMediaInfo(file: File) {
    await ensureMediaInfoLoaded();
    if (!mediaInfoInstance) return { thirdParty: false, encoderHints: [] as string[] };

    const readChunk = async (chunkSize: number, offset: number) => {
      const buffer = await file.slice(offset, offset + chunkSize).arrayBuffer();
      return new Uint8Array(buffer);
    };

    const result = await (mediaInfoInstance.analyzeData as any)(file.size, readChunk);
    const strings = flattenStrings(result);
    const haystack = strings.join(' | ');

    const encoderHints: string[] = [];
    const pushHint = (label: string) => {
      if (!encoderHints.includes(label)) encoderHints.push(label);
    };

    if (/lavf/i.test(haystack)) pushHint('Lavf');
    if (/ffmpeg/i.test(haystack)) pushHint('FFmpeg');
    if (/handbrake/i.test(haystack)) pushHint('HandBrake');

    // También detecta campos típicos de editor/encoder (Encoded_Application/Writing_library, etc.)
    if (/(encoded_?application|writing_?library|encoder)/i.test(haystack) && encoderHints.length === 0) {
      if (/adobe|premiere|after effects|davinci|resolve|capcut|final cut|kinemaster|vlc/i.test(haystack)) {
        pushHint('Editor');
      }
    }

    return { thirdParty: encoderHints.length > 0, encoderHints };
  }

  function meanLandmarkJitter(prev: { x: number; y: number }[], next: { x: number; y: number }[], norm: number) {
    const n = Math.min(prev.length, next.length);
    if (!n || !norm) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const dx = next[i].x - prev[i].x;
      const dy = next[i].y - prev[i].y;
      sum += Math.hypot(dx, dy);
    }
    return (sum / n) / norm;
  }

  function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Eye Aspect Ratio (EAR) usando 6 puntos por ojo (landmarks 68)
  // EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
  function earForEye(pts: { x: number; y: number }[], start: number) {
    const p1 = pts[start + 0];
    const p2 = pts[start + 1];
    const p3 = pts[start + 2];
    const p4 = pts[start + 3];
    const p5 = pts[start + 4];
    const p6 = pts[start + 5];
    if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;
    const vertical = dist(p2, p6) + dist(p3, p5);
    const horizontal = 2 * dist(p1, p4);
    return horizontal ? vertical / horizontal : 0;
  }

  function mean(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function std(values: number[]) {
    if (values.length < 2) return 0;
    const m = mean(values);
    const v = values.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (values.length - 1);
    return Math.sqrt(v);
  }

  async function seekTo(video: HTMLVideoElement, time: number) {
    const t = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : time));
    if (Math.abs(video.currentTime - t) < 0.02) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done, { once: true });
      video.currentTime = t;
      setTimeout(() => {
        video.removeEventListener('seeked', done);
        resolve();
      }, 800);
    });
  }

  function getVideoToCanvasTransform() {
    if (!videoRef || !canvasRef) return null;
    const vw = videoRef.videoWidth || 0;
    const vh = videoRef.videoHeight || 0;
    const cw = canvasRef.width || 0;
    const ch = canvasRef.height || 0;
    if (!vw || !vh || !cw || !ch) return null;

    // CSS: object-fit: cover (ver en estilos del componente)
    const scale = Math.max(cw / vw, ch / vh);
    const displayedW = vw * scale;
    const displayedH = vh * scale;
    const offsetX = (cw - displayedW) / 2;
    const offsetY = (ch - displayedH) / 2;

    return { scale, offsetX, offsetY };
  }

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  function sobelFaceStatsAndMag2(
    imageData: ImageData,
    topBandFrac: number,
    bottomBandFrac: number
  ) {
    const { data, width: w, height: h } = imageData;
    const gray = new Float32Array(w * h);

    // Grayscale
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4 + 0];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = r * 0.299 + g * 0.587 + b * 0.114;
    }

    const mag2 = new Float32Array(w * h);
    let maxMag2 = 0;

    const topBand = Math.floor(h * topBandFrac);
    const bottomBandStart = Math.floor(h * (1 - bottomBandFrac));

    let bSum = 0;
    let bSumSq = 0;
    let bCount = 0;

    let iSum = 0;
    let iSumSq = 0;
    let iCount = 0;

    const idx = (x: number, y: number) => y * w + x;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const tl = gray[idx(x - 1, y - 1)];
        const tc = gray[idx(x, y - 1)];
        const tr = gray[idx(x + 1, y - 1)];

        const ml = gray[idx(x - 1, y)];
        const mr = gray[idx(x + 1, y)];

        const bl = gray[idx(x - 1, y + 1)];
        const bc = gray[idx(x, y + 1)];
        const br = gray[idx(x + 1, y + 1)];

        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = tl + 2 * tc + tr - bl - 2 * bc - br;

        const m2 = gx * gx + gy * gy;
        mag2[idx(x, y)] = m2;
        if (m2 > maxMag2) maxMag2 = m2;

        const isBoundary = y < topBand || y >= bottomBandStart;
        if (isBoundary) {
          bSum += m2;
          bSumSq += m2 * m2;
          bCount += 1;
        } else {
          iSum += m2;
          iSumSq += m2 * m2;
          iCount += 1;
        }
      }
    }

    const bMean = bCount ? bSum / bCount : 0;
    const iMean = iCount ? iSum / iCount : 0;

    const bVar = bCount ? bSumSq / bCount - bMean * bMean : 0;
    const iVar = iCount ? iSumSq / iCount - iMean * iMean : 0;

    return {
      mag2,
      maxMag2,
      boundaryMean: bMean,
      interiorMean: iMean,
      boundaryStd: Math.sqrt(Math.max(0, bVar)),
      interiorStd: Math.sqrt(Math.max(0, iVar))
    };
  }

  function sobelStatsOnly(imageData: ImageData) {
    const { data, width: w, height: h } = imageData;
    const gray = new Float32Array(w * h);

    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4 + 0];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = r * 0.299 + g * 0.587 + b * 0.114;
    }

    const idx = (x: number, y: number) => y * w + x;

    let sum = 0;
    let sumSq = 0;
    let count = 0;
    let maxMag2 = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const tl = gray[idx(x - 1, y - 1)];
        const tc = gray[idx(x, y - 1)];
        const tr = gray[idx(x + 1, y - 1)];

        const ml = gray[idx(x - 1, y)];
        const mr = gray[idx(x + 1, y)];

        const bl = gray[idx(x - 1, y + 1)];
        const bc = gray[idx(x, y + 1)];
        const br = gray[idx(x + 1, y + 1)];

        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = tl + 2 * tc + tr - bl - 2 * bc - br;

        const m2 = gx * gx + gy * gy;
        if (m2 > maxMag2) maxMag2 = m2;

        sum += m2;
        sumSq += m2 * m2;
        count += 1;
      }
    }

    const mean = count ? sum / count : 0;
    const var_ = count ? sumSq / count - mean * mean : 0;

    return {
      mean,
      std: Math.sqrt(Math.max(0, var_)),
      maxMag2
    };
  }

  function analyzeMaskEdgesAndHalo(video: HTMLVideoElement, pts: { x: number; y: number }[]) {
    if (!pts.length) return { halo: false, score: 0, boundaryMean: 0, neckMean: 0 };
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) return { halo: false, score: 0, boundaryMean: 0, neckMean: 0 };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const faceW = Math.max(30, maxX - minX);
    const faceH = Math.max(30, maxY - minY);
    const padX = faceW * 0.12;
    const padY = faceH * 0.12;

    const roiX = clamp(minX - padX, 0, vw - 1);
    const roiY = clamp(minY - padY, 0, vh - 1);
    const roiW = clamp(faceW + padX * 2, 30, vw - roiX);
    const roiH = clamp(faceH + padY * 2, 30, vh - roiY);

    const neckX = roiX;
    const neckW = roiW;
    const neckY = clamp(roiY + roiH * 0.86, 0, vh - 1);
    const neckH = clamp(roiH * 0.45, 18, vh - neckY);

    // Tamaño reducido para CPU razonable
    const targetW = clamp(Math.floor(roiW * 0.85), 96, 160);
    const targetH = clamp(Math.floor((roiH / roiW) * targetW), 72, 140);

    const neckTargetW = targetW;
    const neckTargetH = clamp(Math.floor((neckH / neckW) * neckTargetW), 56, 120);

    const edgeCanvas =
      edgeOverlayCanvas ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!edgeCanvas) return { halo: false, score: 0, boundaryMean: 0, neckMean: 0 };

    // Face ROI
    edgeCanvas.width = targetW;
    edgeCanvas.height = targetH;
    const edgeCtx = edgeCanvas.getContext('2d', { willReadFrequently: true });
    if (!edgeCtx) return { halo: false, score: 0, boundaryMean: 0, neckMean: 0 };
    edgeCtx.clearRect(0, 0, targetW, targetH);
    edgeCtx.drawImage(video, roiX, roiY, roiW, roiH, 0, 0, targetW, targetH);
    const faceImg = edgeCtx.getImageData(0, 0, targetW, targetH);

    const faceStats = sobelFaceStatsAndMag2(faceImg, 0.22, 0.18);

    // Neck ROI (stats only)
    const neckCanvas =
      neckEdgeCanvas ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!neckCanvas) {
      return { halo: false, score: 0, boundaryMean: faceStats.boundaryMean, neckMean: 0 };
    }
    neckEdgeCanvas = neckCanvas;
    neckCanvas.width = neckTargetW;
    neckCanvas.height = neckTargetH;
    const neckCtx = neckCanvas.getContext('2d', { willReadFrequently: true });
    if (!neckCtx) {
      return { halo: false, score: 0, boundaryMean: faceStats.boundaryMean, neckMean: 0 };
    }
    neckCtx.drawImage(video, neckX, neckY, neckW, neckH, 0, 0, neckTargetW, neckTargetH);
    const neckImg = neckCtx.getImageData(0, 0, neckTargetW, neckTargetH);
    const neckStats = sobelStatsOnly(neckImg);

    const eps = 1e-6;
    const ratioFaceInterior = faceStats.boundaryMean / (faceStats.interiorMean + eps);
    const ratioFaceNeck = faceStats.boundaryMean / (neckStats.mean + eps);
    const ratioStd = faceStats.boundaryStd / (neckStats.std + eps);

    const halo =
      ratioFaceInterior > 1.45 &&
      ratioFaceNeck > 1.7 &&
      ratioStd > 1.15 &&
      faceStats.boundaryMean > 15;

    const score = ratioFaceNeck + ratioStd + ratioFaceInterior;

    // Visualización del filtro de bordes
    const ctx = edgeCanvas.getContext('2d');
    if (ctx) {
      const img = ctx.createImageData(targetW, targetH);
      const baseGold = { r: 212, g: 175, b: 55 };
      const baseRed = { r: 230, g: 57, b: 70 };
      const base = halo ? baseRed : baseGold;

      const max = faceStats.maxMag2 + eps;
      for (let i = 0; i < targetW * targetH; i++) {
        const y = Math.floor(i / targetW);
        const isBoundary = y < Math.floor(targetH * 0.22) || y >= Math.floor(targetH * (1 - 0.18));

        const v = faceStats.mag2[i] / max; // 0..1 aprox.
        const intensity = isBoundary ? Math.min(1, v * 1.2) : Math.min(1, v * 0.35);
        const a = Math.floor(20 + intensity * 210 * (isBoundary ? 1 : 0.6));
        img.data[i * 4 + 0] = Math.floor(base.r * intensity);
        img.data[i * 4 + 1] = Math.floor(base.g * intensity);
        img.data[i * 4 + 2] = Math.floor(base.b * intensity);
        img.data[i * 4 + 3] = clamp(a, 0, 255);
      }
      ctx.putImageData(img, 0, 0);
    }

    edgeOverlayCanvas = edgeCanvas;
    edgeOverlayRect = { x: roiX, y: roiY, w: roiW, h: roiH };
    lastMaskJitterScore = score;

    return {
      halo,
      score,
      boundaryMean: faceStats.boundaryMean,
      neckMean: neckStats.mean
    };
  }

  async function analyzeFramesReal() {
    if (!videoRef)
      return {
        suspicious: true,
        minScore: 0,
        maxJitter: 0,
        suspiciousLowConfidence: true,
        suspiciousJitter: false,
        blinkWarning: false,
        blinkCount: 0,
        maskJitterWarning: false,
        maskJitterMaxScore: 0
      };

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.2
    });

    const start = performance.now();
    let prevPoints: { x: number; y: number }[] | null = null;
    let minScore = 1;
    let maxJitter = 0;
    let suspiciousLowConfidence = false;
    let suspiciousJitter = false;
    let blinkCount = 0;
    let blinkWarning = false;
    let blinkStartTs: number | null = null;
    let blinkMinEar = 1;
    const blinkDurationsMs: number[] = [];
    const blinkDepths: number[] = [];

    let maskJitterWarning = false;
    let maskJitterMaxScore = 0;

    lastLandmarks = null;
    jitterSeries = [];
    scoreSeries = [];
    lastFrameScore = 0;
    lastFrameJitter = 0;
    edgeOverlayRect = null;
    lastMaskJitterScore = 0;

    // Reproducimos en client-side para analizar "los primeros 20s del timeline" sin hacer seeks costosos.
    const windowSeconds = 20;
    const maxWallMs = 45000;
    const sampleDelayMs = 220; // muestreo temporal (EAR/jitter/bordes)

    let detectCount = 0;

    const baseTime = videoRef.currentTime || 0;
    try {
      videoRef.muted = true;
      (videoRef as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      // Reinicia desde el inicio para cubrir consistentemente los primeros 20s.
      videoRef.currentTime = 0;
      await seekTo(videoRef, 0);
      await videoRef.play();
    } catch {
      suspiciousLowConfidence = true;
    }

    while ((videoRef.currentTime - baseTime) < windowSeconds && performance.now() - start < maxWallMs) {
      const analyzedSeconds = Math.max(0, videoRef.currentTime - baseTime);
      const progress = Math.min(98, 15 + (analyzedSeconds / windowSeconds) * 83);
      tickScan(Math.floor(analyzedSeconds * 1000), progress);

      const result = await faceapi
        .detectSingleFace(videoRef, options)
        .withFaceLandmarks(true);
      detectCount += 1;

      if (!result) {
        suspiciousLowConfidence = true;
        minScore = Math.min(minScore, 0);
        lastFrameScore = 0;
        lastFrameJitter = 0;
        scoreSeries = pushSeries(scoreSeries, 0);
        jitterSeries = pushSeries(jitterSeries, 0);
      } else {
        const score = result.detection.score ?? 0;
        minScore = Math.min(minScore, score);
        if (score < 0.8) suspiciousLowConfidence = true;
        lastFrameScore = score;
        scoreSeries = pushSeries(scoreSeries, score);

        const box = result.detection.box;
        const norm = Math.max(80, box.width);
        const pts = result.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));

        // Blink detection (EAR)
        const leftEar = earForEye(pts, 36);
        const rightEar = earForEye(pts, 42);
        const ear = (leftEar + rightEar) / 2;
        const blinkClosedThreshold = 0.21;
        const blinkOpenThreshold = 0.25;

        if (ear > 0 && ear < blinkClosedThreshold) {
          if (blinkStartTs === null) blinkStartTs = performance.now();
          blinkMinEar = Math.min(blinkMinEar, ear);
        } else if (blinkStartTs !== null && ear > blinkOpenThreshold) {
          const dur = performance.now() - blinkStartTs;
          // filtros para evitar falsos positivos
          if (dur >= 60 && dur <= 800) {
            blinkCount += 1;
            blinkDurationsMs.push(dur);
            blinkDepths.push(1 - Math.max(0, Math.min(1, blinkMinEar)));
          }
          blinkStartTs = null;
          blinkMinEar = 1;
        }

        if (prevPoints) {
          const jitter = meanLandmarkJitter(prevPoints, pts, norm);
          maxJitter = Math.max(maxJitter, jitter);
          if (jitter > 0.03) suspiciousJitter = true;
          lastFrameJitter = jitter;
          jitterSeries = pushSeries(jitterSeries, jitter);
        } else {
          lastFrameJitter = 0;
          jitterSeries = pushSeries(jitterSeries, 0);
        }

        // Mask Jitter (bordes/halo entre cara y cuello)
        if (detectCount % 2 === 0) {
          const edgeRes = analyzeMaskEdgesAndHalo(videoRef, pts);
          if (edgeRes.halo) {
            maskJitterWarning = true;
            maskJitterMaxScore = Math.max(maskJitterMaxScore, edgeRes.score);
          }
        }

        prevPoints = pts;
        lastLandmarks = pts;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, sampleDelayMs));
    }

    try {
      videoRef.pause();
    } catch {
      // ignore
    }

    // Blink warnings:
    // - No blink in 20s
    // - Mechanically identical blink (muy baja variación)
    if (blinkCount === 0) {
      blinkWarning = true;
    } else if (blinkCount >= 3) {
      const durMean = mean(blinkDurationsMs);
      const durStd = std(blinkDurationsMs);
      const depthMean = mean(blinkDepths);
      const depthStd = std(blinkDepths);
      const durCv = durMean ? durStd / durMean : 0;
      const depthCv = depthMean ? depthStd / depthMean : 0;
      if (durCv < 0.08 && depthCv < 0.12) {
        blinkWarning = true;
      }
    }

    return {
      suspicious: suspiciousLowConfidence || suspiciousJitter,
      suspiciousLowConfidence,
      suspiciousJitter,
      minScore,
      maxJitter,
      blinkWarning,
      blinkCount,
      maskJitterWarning,
      maskJitterMaxScore
    };
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    isDragActive = true;
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragActive = false;
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    isDragActive = false;

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await loadFile(file);
  }

  async function onFileInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await loadFile(file);
  }

  async function loadFile(file: File) {
    if (file.type && !file.type.startsWith('video/')) return;

    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    selectedFile = file;
    showReport = false;
    resetScanner();

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    videoUrl = URL.createObjectURL(file);
    isBusy = true;

    try {
      beginScan(file);
      await ensureModelsLoaded();

      const camera = await readCameraMetadata(file);
      const warnings: string[] = [];
      if (!camera.combined || !isKnownCamera(camera.combined)) {
        warnings.push('Origen Digital No Verificado');
      }

      // Auditoría profunda (MediaInfo) para rastros de encoder/editor
      const mi = await auditMediaInfo(file);
      if (mi.thirdParty) {
        warnings.push('Origen: Software de Terceros detected. Integridad de Cámara: Comprometida');
      }

      // Verificación de metadatos típicos móviles (Make/Model/ISO/Apertura)
      const missingMobile: string[] = [];
      if (!camera.make) missingMobile.push('Marca');
      if (!camera.model) missingMobile.push('Modelo');
      if (!camera.iso) missingMobile.push('ISO');
      if (!camera.fNumber) missingMobile.push('Apertura');
      if (missingMobile.length) {
        warnings.push(`Metadatos de Cámara Incompletos: ${missingMobile.join(', ')}`);
      }

      // Reglas de alerta dura (mantiene el comportamiento original)
      const hardAlert = file.size > MAX_SCAN_SIZE_BYTES || /fake/i.test(file.name);
      setAnalyzing();

      const frameResult = await analyzeFramesReal();

      let verdict: 'VERIFICADO' | 'SOSPECHOSO' | 'ALERTA ROJA' = 'VERIFICADO';
      if (hardAlert) {
        verdict = 'ALERTA ROJA';
      } else if (frameResult.suspicious || frameResult.blinkWarning || frameResult.maskJitterWarning) {
        verdict = 'SOSPECHOSO';
      } else if (mi.thirdParty || missingMobile.length) {
        verdict = 'SOSPECHOSO';
      }

      const confidencePct = Math.max(0, Math.min(100, frameResult.minScore * 100));
      const confidence = verdict === 'VERIFICADO' ? Math.max(92, confidencePct || 99.1) : confidencePct || 72;
      const riskScore = verdict === 'ALERTA ROJA' ? 92 : verdict === 'SOSPECHOSO' ? 64 : 8;

      if (frameResult.blinkWarning) {
        warnings.push('Patrón de Parpadeo Sintético');
      }

      if (frameResult.maskJitterWarning) {
        warnings.push('Inconsistencia de Bordes (Mask Jitter)');
      }

      const reason =
        verdict === 'ALERTA ROJA'
          ? file.size > MAX_SCAN_SIZE_BYTES
            ? 'El archivo supera el limite seguro de 5MB y requiere validacion manual.'
            : "Patron nominal sospechoso detectado en el nombre del archivo ('fake')."
          : verdict === 'SOSPECHOSO'
            ? frameResult.suspiciousLowConfidence
              ? 'Confianza de deteccion facial por debajo del 80% en al menos un frame.'
              : frameResult.suspiciousJitter
                ? 'Jitter detectado en landmarks faciales (vibracion / inconsistencia temporal).'
                : frameResult.blinkWarning
                  ? 'Patron de parpadeo sintetico detectado (EAR anomala en 20s).'
                  : 'Inconsistencia de bordes detectada entre cara y cuello (Mask Jitter).'
            : 'Coherencia biometrica estable. No se detectaron indicios de sintesis maliciosa.';

      completeScan({
        verdict,
        confidence,
        riskScore,
        reason,
        warnings,
        logsExtra: [
          modelsReady ? 'FACE_MODELS: READY' : 'FACE_MODELS: OFFLINE',
          `MIN_FACE_CONFIDENCE: ${(frameResult.minScore * 100).toFixed(1)}%`,
          `MAX_LANDMARK_JITTER: ${(frameResult.maxJitter * 100).toFixed(2)}%`,
          `BLINK_COUNT_20S: ${frameResult.blinkCount}`,
          frameResult.blinkWarning ? 'BLINK_PATTERN: SYNTHETIC' : 'BLINK_PATTERN: OK',
          `MASK_JITTER_MAX_SCORE: ${frameResult.maskJitterMaxScore.toFixed(2)}`,
          frameResult.maskJitterWarning ? 'MASK_JITTER: HALO_DETECTED' : 'MASK_JITTER: OK',
          mi.thirdParty ? `ENCODER_FOOTPRINT: ${mi.encoderHints.join(', ')}` : 'ENCODER_FOOTPRINT: NONE',
          missingMobile.length ? `CAMERA_META_MISSING: ${missingMobile.join(', ')}` : 'CAMERA_META_MISSING: NONE',
          warnings.includes('Origen Digital No Verificado')
            ? 'CAMERA_ORIGIN: UNVERIFIED'
            : 'CAMERA_ORIGIN: VERIFIED'
        ]
      });

      showReport = true;
    } finally {
      isBusy = false;
    }
  }

  function clearSession() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = '';
    selectedFile = null;
    showReport = false;
    resetScanner();
    lastLandmarks = null;
    edgeOverlayRect = null;
    lastMaskJitterScore = 0;
  }

  function ensureCanvasSize() {
    if (!videoRef || !canvasRef) return;
    const rect = videoRef.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvasRef.width = Math.floor(rect.width);
    canvasRef.height = Math.floor(rect.height);

    if (!raf) {
      raf = requestAnimationFrame(drawOverlay);
    }
  }

  function drawOverlay() {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasRef;
    if (!width || !height) {
      raf = requestAnimationFrame(drawOverlay);
      return;
    }

    const t = performance.now();

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 8, 8, 0.12)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.11)';
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const pulse = (Math.sin(t / 380) + 1) / 2;
    const markerX = width * (0.2 + pulse * 0.6);
    const markerY = height * (0.35 + Math.cos(t / 520) * 0.15);
    ctx.strokeStyle =
      scan.verdict === 'ALERTA ROJA' ? 'rgba(230, 57, 70, 0.7)' : 'rgba(212, 175, 55, 0.7)';
    ctx.strokeRect(markerX - 20, markerY - 20, 40, 40);

    // Landmarks (solo durante el escaneo)
    if (scan.phase === 'ANALYZING' && lastLandmarks?.length) {
      const tr = getVideoToCanvasTransform();
      if (!tr) {
        raf = requestAnimationFrame(drawOverlay);
        return;
      }

      const tone =
        scan.verdict === 'ALERTA ROJA'
          ? 'rgba(230, 57, 70, 0.95)'
          : scan.verdict === 'SOSPECHOSO'
            ? 'rgba(242, 214, 126, 0.95)'
            : 'rgba(212, 175, 55, 0.95)';

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // Filtro de bordes (Mask Jitter) - dibuja el mapa de edges sobre la ROI facial
      if (edgeOverlayCanvas && edgeOverlayRect) {
        const x = edgeOverlayRect.x * tr.scale + tr.offsetX;
        const y = edgeOverlayRect.y * tr.scale + tr.offsetY;
        const w = edgeOverlayRect.w * tr.scale;
        const h = edgeOverlayRect.h * tr.scale;
        ctx.globalAlpha = 0.78;
        ctx.drawImage(edgeOverlayCanvas, x, y, w, h);
        ctx.globalAlpha = 1;
      }

      // Halo suave
      ctx.fillStyle = tone;
      for (const p of lastLandmarks) {
        const x = p.x * tr.scale + tr.offsetX;
        const y = p.y * tr.scale + tr.offsetY;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, 1.6 * tr.scale), 0, Math.PI * 2);
        ctx.fill();
      }

      // Conexiones simples (nariz/cejas/ojos/boca)
      ctx.strokeStyle = tone;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.75;

      const pts = lastLandmarks;
      const drawChain = (from: number, to: number, close = false) => {
        ctx.beginPath();
        for (let i = from; i <= to; i++) {
          const p = pts?.[i];
          if (!p) continue;
          const x = p.x * tr.scale + tr.offsetX;
          const y = p.y * tr.scale + tr.offsetY;
          if (i === from) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        if (close) ctx.closePath();
        ctx.stroke();
      };

      // Jaw (0-16), brows (17-21, 22-26), nose (27-35), eyes (36-41, 42-47), mouth (48-59)
      drawChain(0, 16);
      drawChain(17, 21);
      drawChain(22, 26);
      drawChain(27, 35);
      drawChain(36, 41, true);
      drawChain(42, 47, true);
      drawChain(48, 59, true);

      // HUD pequeño: score/jitter en la esquina
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(10, 10, 10, 0.65)';
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.22)';
      ctx.lineWidth = 1;
      const pad = 10;
      const boxW = 190;
      const boxH = 52;
      ctx.beginPath();
      ctx.roundRect(pad, pad, boxW, boxH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.font = '12px Consolas, Monaco, monospace';
      ctx.fillText(`FACE_SCORE: ${(lastFrameScore * 100).toFixed(1)}%`, pad + 12, pad + 22);
      ctx.fillStyle = tone;
      ctx.fillText(`JITTER: ${(lastFrameJitter * 100).toFixed(2)}%`, pad + 12, pad + 40);

      ctx.restore();
    }

    raf = requestAnimationFrame(drawOverlay);
  }

  function downloadCertificate() {
    if (!selectedFile || !scan.verdict) return;
    const content = [
      '=== KRONOS CERTIFICATE ===',
      `Archivo: ${selectedFile.name}`,
      `Tamano(bytes): ${selectedFile.size}`,
      `Estado: ${scan.verdict}`,
      `Confianza: ${scan.confidence.toFixed(1)}%`,
      `Riesgo: ${scan.riskScore}/100`,
      `Avisos: ${scan.warnings?.length ? scan.warnings.join(', ') : 'Ninguno'}`,
      `Fecha: ${new Date().toISOString()}`,
      `Resumen: ${scan.reason}`
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `KRONOS-CERT-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function closeReport() {
    showReport = false;
  }

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  });
</script>

<section class="processor">
  <div class="main-card">
    <header>
      <div>
        <p class="chip">NEURAL FORENSIC ENGINE</p>
        <h2>Video Processor Core</h2>
      </div>
      <span class="status" class:danger={scan.verdict === 'ALERTA ROJA'}>{badgeLabel}</span>
    </header>

    <div
      class="dropzone"
      class:dragging={isDragActive}
      role="button"
      tabindex="0"
      aria-label="Zona de carga de video"
      on:dragover={onDragOver}
      on:dragleave={onDragLeave}
      on:drop={onDrop}
    >
      <input id="video-input" type="file" accept="video/*" on:change={onFileInput} />
      <label for="video-input">
        <strong>Arrastra un video aqui o pulsa para cargar</strong>
        <span>Formato recomendado: MP4 · Tamano maximo simulado seguro: 5MB</span>
      </label>
    </div>

    <div class="viewport" class:danger={verdictClass === 'danger'}>
      {#if hasVideo}
        <video bind:this={videoRef} src={videoUrl} controls on:loadedmetadata={ensureCanvasSize}></video>
        <canvas bind:this={canvasRef} aria-hidden="true"></canvas>

        {#if scan.phase === 'ANALYZING'}
          <div class="laser-wrap" in:fade={{ duration: 120 }} out:fade={{ duration: 120 }}>
            <div class="laser" style={`top:${laserProgress}%;`}></div>
          </div>
        {/if}
      {:else}
        <div class="empty-state">
          <Radar active={scan.phase === 'ANALYZING'} progress={scan.progress} verdict={scan.verdict} />
          <p>Esperando evidencia audiovisual para iniciar escaneo neuronal.</p>
        </div>
      {/if}
    </div>

    <footer>
      <div class="meter">
        <div class="fill" style={`width:${scan.progress}%;`}></div>
      </div>
      <p>{displayMillis}ms · {Math.round(scan.progress)}%</p>
      <button type="button" on:click={clearSession} disabled={isBusy}>Reiniciar Sesion</button>
    </footer>
  </div>

  <aside class="telemetry" in:fly={{ x: 20, duration: 250 }}>
    <h3>Telemetria</h3>
    <p class="sub">Canal de eventos en tiempo real</p>

    <div class="stream">
      {#each telemetry as line, index (line + index)}
        <p class="line" transition:fade={{ duration: 180 }}>
          <span>&gt;</span>{line}
        </p>
      {/each}
    </div>

    <div class="meta">
      <div class="mini-charts">
        <div class="mini">
          <div class="mini-head">
            <span>JITTER</span>
            <strong class={lastFrameJitter > 0.03 ? 'danger' : 'safe'}>{(lastFrameJitter * 100).toFixed(2)}%</strong>
          </div>
          <svg viewBox="0 0 120 26" aria-label="Sparkline jitter">
            <polyline
              fill="none"
              stroke="rgba(212, 175, 55, 0.85)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              points={sparklinePoints(jitterSeries, 120, 26, 0.06)}
            />
          </svg>
        </div>

        <div class="mini">
          <div class="mini-head">
            <span>FACE</span>
            <strong class={lastFrameScore < 0.8 ? 'danger' : 'safe'}>{(lastFrameScore * 100).toFixed(1)}%</strong>
          </div>
          <svg viewBox="0 0 120 26" aria-label="Sparkline confianza facial">
            <polyline
              fill="none"
              stroke="rgba(255, 255, 255, 0.7)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              points={sparklinePoints(scoreSeries, 120, 26, 1)}
            />
          </svg>
        </div>
      </div>

      <p><span>Archivo</span> <strong>{selectedFile?.name ?? 'N/A'}</strong></p>
      <p><span>Peso</span> <strong>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}</strong></p>
      <p><span>Resultado</span> <strong class={verdictClass}>{scan.verdict ?? '-'}</strong></p>
      <p><span>Confianza</span> <strong>{scan.confidence ? `${scan.confidence.toFixed(1)}%` : '-'}</strong></p>
      <p><span>Origen</span> <strong class={scan.warnings?.includes('Origen Digital No Verificado') ? 'danger' : 'safe'}>{scan.warnings?.includes('Origen Digital No Verificado') ? 'NO VERIFICADO' : 'VERIFICADO'}</strong></p>
      <p><span>Parpadeo</span> <strong class={scan.warnings?.includes('Patrón de Parpadeo Sintético') ? 'danger' : 'safe'}>{scan.warnings?.includes('Patrón de Parpadeo Sintético') ? 'SINTETICO' : 'OK'}</strong></p>
      <p><span>Bordes</span> <strong class={scan.warnings?.includes('Inconsistencia de Bordes (Mask Jitter)') ? 'danger' : 'safe'}>{scan.warnings?.includes('Inconsistencia de Bordes (Mask Jitter)') ? 'MASK_JITTER' : 'OK'}</strong></p>
    </div>
  </aside>
</section>

<ReportModal
  open={showReport}
  verdict={scan.verdict}
  confidence={scan.confidence}
  riskScore={scan.riskScore}
  fileName={selectedFile?.name ?? ''}
  reason={scan.reason}
  warnings={scan.warnings}
  completedAt={scan.completedAt ?? ''}
  on:close={closeReport}
  on:download={downloadCertificate}
/>

<style>
  .processor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 1rem;
  }

  .main-card,
  .telemetry {
    border-radius: 18px;
    border: 1px solid #1a1a1a;
    background: linear-gradient(180deg, rgba(10, 10, 10, 0.96), rgba(5, 5, 5, 0.96));
    backdrop-filter: blur(14px);
  }

  .main-card {
    padding: 1rem;
    box-shadow:
      0 0 0 1px rgba(212, 175, 55, 0.06) inset,
      0 0 34px rgba(212, 175, 55, 0.1);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.7rem;
    margin-bottom: 0.85rem;
  }

  .chip {
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.58);
    font-size: 0.71rem;
  }

  h2 {
    margin-top: 0.18rem;
    font-size: clamp(1.15rem, 2vw, 1.44rem);
    color: #f3f3f3;
    font-weight: 600;
  }

  .status {
    border: 1px solid rgba(212, 175, 55, 0.4);
    border-radius: 999px;
    color: #d4af37;
    font-size: 0.75rem;
    letter-spacing: 0.09em;
    padding: 0.4rem 0.67rem;
  }

  .status.danger {
    border-color: rgba(230, 57, 70, 0.42);
    color: #e63946;
  }

  .dropzone {
    border: 1px dashed rgba(212, 175, 55, 0.34);
    border-radius: 14px;
    background: rgba(212, 175, 55, 0.05);
    position: relative;
    margin-bottom: 0.85rem;
    transition: border-color 200ms ease, background-color 200ms ease, transform 200ms ease;
  }

  .dropzone.dragging {
    border-color: #d4af37;
    background: rgba(212, 175, 55, 0.1);
    transform: translateY(-1px);
  }

  input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  label {
    min-height: 96px;
    display: grid;
    place-content: center;
    text-align: center;
    gap: 0.36rem;
    color: rgba(255, 255, 255, 0.84);
    font-size: 0.94rem;
    padding: 1rem;
  }

  label span {
    color: rgba(255, 255, 255, 0.58);
    font-size: 0.8rem;
  }

  .viewport {
    position: relative;
    min-height: 360px;
    border-radius: 14px;
    border: 1px solid rgba(212, 175, 55, 0.24);
    background: radial-gradient(circle at 20% 20%, rgba(212, 175, 55, 0.08), rgba(2, 2, 2, 0.9) 55%);
    overflow: hidden;
  }

  .viewport.danger {
    border-color: rgba(230, 57, 70, 0.3);
    box-shadow: 0 0 28px rgba(230, 57, 70, 0.16) inset;
  }

  video,
  canvas,
  .laser-wrap {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  video {
    object-fit: cover;
    background: #000;
  }

  canvas {
    pointer-events: none;
  }

  .laser-wrap {
    pointer-events: none;
  }

  .laser {
    position: absolute;
    left: 0;
    width: 100%;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.96), transparent);
    box-shadow:
      0 0 20px rgba(212, 175, 55, 0.62),
      0 0 35px rgba(212, 175, 55, 0.25);
    transform: translateY(-50%);
    transition: top 80ms linear;
  }

  .viewport.danger .laser {
    background: linear-gradient(90deg, transparent, rgba(230, 57, 70, 0.96), transparent);
    box-shadow:
      0 0 20px rgba(230, 57, 70, 0.62),
      0 0 35px rgba(230, 57, 70, 0.25);
  }

  .empty-state {
    min-height: 360px;
    display: grid;
    place-items: center;
    text-align: center;
    gap: 0.8rem;
    color: rgba(255, 255, 255, 0.74);
    padding: 1rem;
  }

  .empty-state p {
    max-width: 44ch;
  }

  footer {
    margin-top: 0.85rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 0.7rem;
    align-items: center;
  }

  .meter {
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: linear-gradient(90deg, #d4af37, #f2d67e);
    box-shadow: 0 0 14px rgba(212, 175, 55, 0.52);
    transition: width 120ms linear;
  }

  footer p {
    color: rgba(255, 255, 255, 0.68);
    font-size: 0.82rem;
  }

  footer button {
    border: 1px solid #222;
    border-radius: 9px;
    background: #0f0f0f;
    color: rgba(255, 255, 255, 0.86);
    padding: 0.45rem 0.7rem;
    cursor: pointer;
  }

  footer button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .telemetry {
    padding: 0.95rem;
    color: #f3f3f3;
  }

  .telemetry h3 {
    font-size: 1.02rem;
    font-weight: 600;
  }

  .sub {
    color: rgba(255, 255, 255, 0.58);
    font-size: 0.8rem;
    margin-top: 0.2rem;
  }

  .stream {
    margin-top: 0.8rem;
    border: 1px solid #1a1a1a;
    border-radius: 12px;
    padding: 0.7rem;
    height: 260px;
    overflow: auto;
    background: rgba(0, 0, 0, 0.26);
  }

  .line {
    color: rgba(255, 255, 255, 0.87);
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    margin-bottom: 0.4rem;
    font-family: Consolas, Monaco, monospace;
  }

  .line span {
    color: #d4af37;
    margin-right: 0.32rem;
  }

  .meta {
    margin-top: 0.75rem;
    border: 1px solid #1a1a1a;
    border-radius: 12px;
    padding: 0.7rem;
    display: grid;
    gap: 0.48rem;
    background: rgba(255, 255, 255, 0.015);
  }

  .mini-charts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
    margin-bottom: 0.25rem;
    padding-bottom: 0.55rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .mini {
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 0.45rem 0.55rem;
    background: rgba(0, 0, 0, 0.22);
  }

  .mini-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.28rem;
  }

  .mini-head span {
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
  }

  .mini-head strong {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.75rem;
  }

  .mini svg {
    width: 100%;
    height: 26px;
    display: block;
    opacity: 0.95;
  }

  .meta p {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    font-size: 0.79rem;
  }

  .meta span {
    color: rgba(255, 255, 255, 0.58);
  }

  .meta strong.safe {
    color: #d4af37;
  }

  .meta strong.danger {
    color: #e63946;
  }

  @media (max-width: 980px) {
    .processor {
      grid-template-columns: 1fr;
    }

    .stream {
      height: 180px;
    }
  }

  @media (max-width: 720px) {
    footer {
      grid-template-columns: 1fr;
    }
  }
</style>
