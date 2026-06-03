import { describe, expect, it } from 'vitest';

import { parseSiteLocaleCookie, resolveSiteLocale } from './site-locale';

describe('site locale helpers', () => {
	it('normalizes supported locale cookie values', () => {
		expect(parseSiteLocaleCookie(' ES ')).toBe('es');
		expect(parseSiteLocaleCookie('fr')).toBe('fr');
	});

	it('rejects unsupported values and falls back to English', () => {
		expect(parseSiteLocaleCookie('it')).toBeNull();
		expect(resolveSiteLocale('it')).toBe('en');
		expect(resolveSiteLocale(undefined)).toBe('en');
	});
});
