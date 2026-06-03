import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
	},
	compilerOptions: {
		warningFilter: (warning) =>
			![
				'a11y_click_events_have_key_events',
				'a11y_interactive_supports_focus',
				'a11y_media_has_caption',
				'a11y_no_noninteractive_element_to_interactive_role',
				'css_unused_selector',
				'event_directive_deprecated',
				'slot_element_deprecated'
			].includes(warning.code)
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) => ({ runes: !filename.includes('node_modules') })
	}
};

export default config;
