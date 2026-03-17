<script lang="ts">
  import HeroSection from '$lib/components/ui/HeroSection.svelte';
  import FeaturesSection from '$lib/components/ui/FeaturesSection.svelte';
</script>

<HeroSection
  eyebrow="Starter SvelteKit"
  title="Plantilla lista para lanzar tus próximas interfaces."
  subtitle="Usa esta base como punto de partida para landings, productos SaaS o paneles internos. Personaliza colores, tipografía y secciones sin pelearte con el layout."
  primaryLabel="Ver ejemplo completo"
  primaryHref="/examples/landing"
  secondaryLabel="Explorar componentes base"
  secondaryHref="#features"
/>

<FeaturesSection
  id="features"
  eyebrow="Componentes base incluidos"
  title="Bloques UI reutilizables desde el primer día."
  subtitle="Combina secciones y componentes para crear nuevas pantallas rápido, manteniendo una estética limpia y consistente."
  items={[
    {
      icon: '✨',
      title: 'Hero adaptable',
      description: 'Título, subtítulo y CTAs listos para reutilizar en cualquier página de tu app.'
    },
    {
      icon: '⚡',
      title: 'Grid de features',
      description: 'Resume el valor de tu producto con una cuadrícula de características clara.'
    },
    {
      icon: '🎨',
      title: 'Tokens de estilo',
      description: 'Colores y tipografía definidos en un solo lugar para adaptar la marca.'
    },
    {
      icon: '🧩',
      title: 'Composición flexible',
      description: 'Crea nuevas secciones combinando Container, Section, Card y Button.'
    }
  ]}
/>