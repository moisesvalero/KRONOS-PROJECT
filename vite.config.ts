import { sveltekit } from '@sveltejs/kit/vite';
import { createLogger, defineConfig } from 'vite';

const logger = createLogger();
const warn = logger.warn.bind(logger);
const warnOnce = logger.warnOnce.bind(logger);

logger.warn = (message, options) => {
	if (String(message).includes('MediaInfoModule.wasm')) return;
	warn(message, options);
};

logger.warnOnce = (message, options) => {
	if (String(message).includes('MediaInfoModule.wasm')) return;
	warnOnce(message, options);
};

export default defineConfig({
	build: {
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			onwarn(warning, warn) {
				if (warning.message.includes('MediaInfoModule.wasm')) return;
				warn(warning);
			}
		}
	},
	customLogger: logger,
	plugins: [sveltekit()]
});
