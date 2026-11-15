/**
 * Copies the two libraries the tab renders Markdown with into
 * wheelhouse/ui/vendor/, where Wheelhouse serves them beside the UI bundle.
 * They are the versions Wheelhouse's own document reader uses, pinned in
 * package.json; test/vendor.test.js checks the copies match.
 *
 * Run after changing either version: npm install && npm run vendor
 */

import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VENDORED = [
	['marked/lib/marked.esm.js', 'marked.esm.js'],
	['dompurify/dist/purify.es.mjs', 'purify.es.mjs']
];

const root = new URL('../', import.meta.url);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	for (const [from, to] of VENDORED) {
		copyFileSync(
			new URL(`node_modules/${from}`, root),
			new URL(`wheelhouse/ui/vendor/${to}`, root)
		);
		console.log(`wheelhouse/ui/vendor/${to} ← node_modules/${from}`);
	}
}
