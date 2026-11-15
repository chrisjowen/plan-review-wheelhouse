import js from '@eslint/js';
import globals from 'globals';

export default [
	{ ignores: ['node_modules/', 'wheelhouse/ui/vendor/'] },
	js.configs.recommended,
	{
		files: ['wheelhouse/server/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
		languageOptions: { globals: globals.node }
	},
	{
		files: ['wheelhouse/ui/**/*.js', 'test/ui.test.js', 'test/doc.test.js', 'test/dom.js'],
		languageOptions: { globals: globals.browser }
	}
];
