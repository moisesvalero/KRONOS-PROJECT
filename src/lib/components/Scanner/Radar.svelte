<script lang="ts">
  import { fade, scale } from 'svelte/transition';

  type Verdict = 'VERIFICADO' | 'SOSPECHOSO' | 'ALERTA ROJA' | null;

  interface Props {
    active?: boolean;
    progress?: number;
    verdict?: Verdict;
  }

  let { active = false, progress = 0, verdict = null }: Props = $props();

  let tone = $derived(verdict === 'ALERTA ROJA' ? '#E63946' : '#D4AF37');
</script>

<div class="radar-shell" in:scale={{ duration: 350, start: 0.95 }} out:fade>
  <div class="radar-grid">
    <span class="ring ring-1"></span>
    <span class="ring ring-2"></span>
    <span class="ring ring-3"></span>
    <span class="cross cross-h"></span>
    <span class="cross cross-v"></span>
    <span class="pulse"></span>

    <div class="sweep" class:active style={`--tone: ${tone};`}></div>
  </div>

  <div class="readout">
    <span>BIO-RADAR</span>
    <strong>{Math.round(progress)}%</strong>
  </div>
</div>

<style>
  .radar-shell {
    position: relative;
    width: 220px;
    max-width: 100%;
    aspect-ratio: 1;
    border-radius: 999px;
    border: 1px solid rgba(212, 175, 55, 0.2);
    background: radial-gradient(circle at center, rgba(212, 175, 55, 0.12), rgba(2, 2, 2, 0.86) 62%);
    box-shadow:
      0 0 30px rgba(212, 175, 55, 0.13),
      inset 0 0 45px rgba(212, 175, 55, 0.05);
    overflow: hidden;
  }

  .radar-grid {
    position: absolute;
    inset: 0;
  }

  .ring,
  .cross,
  .pulse {
    position: absolute;
    border-radius: 999px;
  }

  .ring {
    border: 1px solid rgba(212, 175, 55, 0.18);
    inset: 12%;
  }

  .ring-2 {
    inset: 24%;
  }

  .ring-3 {
    inset: 36%;
  }

  .cross {
    background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.24), transparent);
  }

  .cross-h {
    inset: 49.5% 8% auto;
    height: 1px;
  }

  .cross-v {
    inset: 8% auto 8% 49.5%;
    width: 1px;
    height: auto;
    background: linear-gradient(180deg, transparent, rgba(212, 175, 55, 0.24), transparent);
  }

  .pulse {
    width: 8px;
    height: 8px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: #d4af37;
    box-shadow: 0 0 18px rgba(212, 175, 55, 0.8);
    animation: pulse 1.4s ease-in-out infinite;
  }

  .sweep {
    position: absolute;
    inset: -2px;
    border-radius: 999px;
    background: conic-gradient(from 0deg, transparent 0deg, transparent 288deg, color-mix(in srgb, var(--tone) 55%, #ffffff 2%) 344deg, transparent 360deg);
    mix-blend-mode: screen;
    opacity: 0.18;
    transform: rotate(0deg);
  }

  .sweep.active {
    opacity: 0.32;
    animation: sweep 2.25s linear infinite;
  }

  .readout {
    position: absolute;
    bottom: 11px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.76);
    background: rgba(10, 10, 10, 0.74);
    border: 1px solid rgba(212, 175, 55, 0.25);
    border-radius: 999px;
    padding: 0.28rem 0.62rem;
    backdrop-filter: blur(8px);
  }

  .readout strong {
    color: #d4af37;
  }

  @keyframes sweep {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 0.9;
    }
    50% {
      transform: translate(-50%, -50%) scale(1.36);
      opacity: 0.45;
    }
  }
</style>
