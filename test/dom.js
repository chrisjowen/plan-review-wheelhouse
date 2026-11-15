/**
 * A page for the browser-side tests (jsdom, which DOMPurify supports), its
 * globals set before the UI modules load, since DOMPurify binds to `window`
 * when imported.
 */

import { JSDOM } from 'jsdom';

export function page(url = 'http://127.0.0.1:4310/projects/lumen/tasks/lumen-plan') {
	const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
		url,
		pretendToBeVisual: true
	});
	for (const k of [
		'window',
		'document',
		'HTMLElement',
		'customElements',
		'Node',
		'NodeFilter',
		'localStorage',
		'navigator',
		'Event',
		'MouseEvent',
		'KeyboardEvent'
	]) {
		Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });
	}
	return window;
}

/** A made-up plan, the kind a worker writes, with its lines numbered as in the file. */
export const PLAN = [
	'# Share links for boards', // 1
	'', // 2
	'Let a captain share a read-only board with a link.', // 3
	'', // 4
	'## Steps', // 5
	'', // 6
	'1. Add the widget table.', // 7
	'2. Add a `share` route that signs links.', // 8
	'   - Links expire after 7 days.', // 9
	'3. Show **Share** on the board header.', // 10
	'', // 11
	'## Risks', // 12
	'', // 13
	'| Risk | Plan |', // 14
	'| --- | --- |', // 15
	'| Leaked link | Expiry and revoke |', // 16
	'| Slow board | Cache the snapshot |', // 17
	'', // 18
	'```sh', // 19
	'npm run migrate', // 20
	'```', // 21
	''
].join('\n');
