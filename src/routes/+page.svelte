<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { fade, fly } from 'svelte/transition';
  import VideoProcessor from '$lib/components/Scanner/VideoProcessor.svelte';
  import { seo, setSeo } from '$lib/seo';

  const baseUrl = new URL(env.PUBLIC_SITE_URL || 'http://localhost:5173').toString().replace(/\/$/, '');
  const clients = ['AUREA BANK', 'NEXUS CAPITAL', 'TITAN INSURANCE', 'HELIOS GROUP', 'OBSIDIAN PAY'];

  setSeo({
    title: 'KRONOS | Deepfake Defense Suite',
    description: 'Proteccion de identidad digital mediante analisis forense neuronal para entornos corporativos.',
    ogTitle: 'KRONOS: La Verdad es Atemporal',
    ogDescription: 'Suite SaaS para deteccion de deepfakes con telemetria forense en tiempo real.',
    canonical: `${baseUrl}/`,
    ogUrl: `${baseUrl}/`,
    ogImage: `${baseUrl}/og-image.png`,
    twitterCard: 'summary_large_image'
  });
</script>

<svelte:head>
  <title>{$seo.title}</title>
  <meta name="description" content={$seo.description} />
  <link rel="canonical" href={$seo.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={$seo.ogTitle} />
  <meta property="og:description" content={$seo.ogDescription} />
  <meta property="og:url" content={$seo.ogUrl} />
  <meta property="og:image" content={$seo.ogImage} />
  <meta name="twitter:card" content={$seo.twitterCard} />
  <meta name="twitter:title" content={$seo.ogTitle} />
  <meta name="twitter:description" content={$seo.ogDescription} />
  <meta name="twitter:image" content={$seo.ogImage} />
</svelte:head>

<main class="kronos-page">
  <section class="hero" in:fade={{ duration: 300 }}>
    <p class="eyebrow">KRONOS DEFENSE SUITE</p>
    <h1>KRONOS: <span>La Verdad es Atemporal</span></h1>
    <p class="subtitle">Proteccion de identidad digital mediante analisis forense neuronal.</p>
  </section>

  <section class="processor-wrap" in:fly={{ y: 18, duration: 300 }}>
    <VideoProcessor />
  </section>

  <section class="clients">
    <p>Confianza institucional</p>
    <div class="logos">
      {#each clients as client}
        <article>{client}</article>
      {/each}
    </div>
  </section>

  <p class="version-note">KRONOS v1.0 - Secured by Neural Encryption</p>
</main>

<style>
  .kronos-page {
    min-height: 100vh;
    background:
      radial-gradient(circle at 12% 8%, rgba(212, 175, 55, 0.08), transparent 28%),
      radial-gradient(circle at 85% 4%, rgba(230, 57, 70, 0.08), transparent 26%),
      #020202;
    color: #f6f6f6;
    padding: clamp(3.6rem, 8vw, 4.8rem) 1rem 2.4rem;
  }

  .hero {
    width: min(100%, 1020px);
    margin: 0 auto;
    text-align: center;
  }

  .eyebrow {
    font-size: 0.74rem;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.65);
  }

  h1 {
    margin-top: 0.45rem;
    font-size: clamp(2rem, 5.4vw, 4rem);
    line-height: 1.03;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  h1 span {
    background: linear-gradient(120deg, #d4af37 0%, #f5de95 44%, #e63946 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    margin: 0.82rem auto 0;
    max-width: 62ch;
    color: rgba(255, 255, 255, 0.73);
  }

  .processor-wrap {
    width: min(100%, 1080px);
    margin: 1.5rem auto 0;
  }

  .clients {
    width: min(100%, 1080px);
    margin: 1.3rem auto 0;
    border: 1px solid #1a1a1a;
    border-radius: 16px;
    background: rgba(10, 10, 10, 0.9);
    backdrop-filter: blur(10px);
    padding: 1rem;
  }

  .clients p {
    color: rgba(255, 255, 255, 0.56);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .logos {
    margin-top: 0.72rem;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .logos article {
    border: 1px solid #1b1b1b;
    border-radius: 10px;
    min-height: 60px;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.52);
    filter: grayscale(1);
    letter-spacing: 0.09em;
    font-size: 0.74rem;
    background: rgba(255, 255, 255, 0.01);
  }

  .version-note {
    margin: 1.25rem auto 0;
    width: min(100%, 1080px);
    text-align: center;
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
  }

  @media (max-width: 980px) {
    .logos {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>