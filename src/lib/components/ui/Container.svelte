<script lang="ts">
  export let as: keyof HTMLElementTagNameMap = 'div';
  export let className = '';
</script>

<svelte:element
  this={as}
  class={`nk-container ${className}`.trim()}
>
  <slot />
</svelte:element>

<style>
  .nk-container {
    width: 100%;
    max-width: 1200px;
    margin-inline: auto;
    padding-inline: 1.5rem;
  }

  @media (max-width: 640px) {
    .nk-container {
      padding-inline: 1.25rem;
    }
  }

  @media (min-width: 1600px) {
    .nk-container {
      max-width: 1320px;
    }
  }
</style>

