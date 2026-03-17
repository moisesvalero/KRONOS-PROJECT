<script lang="ts">
  type Variant = 'body' | 'muted' | 'small' | 'label';
  type Align = 'left' | 'center' | 'right';

  export let as: keyof HTMLElementTagNameMap = 'p';
  export let variant: Variant = 'body';
  export let align: Align = 'left';
  export let className = '';
</script>

<svelte:element
  this={as}
  class={`nk-text nk-text--${variant} nk-text--${align} ${className}`.trim()}
>
  <slot />
</svelte:element>

<style>
  .nk-text {
    margin: 0;
    color: var(--text-main, #0f172a);
  }

  .nk-text--muted {
    color: var(--text-secondary, #6b7280);
  }

  .nk-text--small {
    font-size: 0.82rem;
    color: var(--text-secondary, #6b7280);
  }

  .nk-text--label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--text-secondary, #6b7280);
  }

  .nk-text--center {
    text-align: center;
  }

  .nk-text--right {
    text-align: right;
  }
</style>

