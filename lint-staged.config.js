const runFullValidation = () =>
	'pnpm run lint:ox && pnpm run check && pnpm run typecheck && pnpm run test && pnpm run test:e2e';

export default {
	'*.{js,ts,svelte,css,html,json,md,svx}': 'prettier --write',
	'*.{js,ts,svelte}': ['oxlint', 'eslint'],
	'*.{ts,svelte}': runFullValidation
};
