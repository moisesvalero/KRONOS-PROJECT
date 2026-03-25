<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import Radar from '$lib/components/Scanner/Radar.svelte';
  import ReportModal from '$lib/components/ui/ReportModal.svelte';
  import { ANALYSIS_DURATION_MS, analyzeVideo, resetScanner, scannerState } from '$lib/stores/scanner';

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
      const result = await analyzeVideo(file);
      showReport = result.phase === 'COMPLETED';
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
      <p><span>Archivo</span> <strong>{selectedFile?.name ?? 'N/A'}</strong></p>
      <p><span>Peso</span> <strong>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}</strong></p>
      <p><span>Resultado</span> <strong class={verdictClass}>{scan.verdict ?? '-'}</strong></p>
      <p><span>Confianza</span> <strong>{scan.confidence ? `${scan.confidence.toFixed(1)}%` : '-'}</strong></p>
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
