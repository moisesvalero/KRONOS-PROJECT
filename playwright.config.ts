import { defineConfig } from '@playwright/test';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.spec.{js,ts}',
	fullyParallel: true,
	use: {
		baseURL: 'http://127.0.0.1:5173'
	},
	webServer: {
		command: `${pnpmCommand} run dev --host 127.0.0.1`,
		url: 'http://127.0.0.1:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
