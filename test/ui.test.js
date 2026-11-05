/**
 * The section in a page (jsdom), as Wheelhouse hosts it: `host` (with
 * sendFeedback), `entry` and `data` set on the element. Comments by line and
 * by selected passage, the verdict, sending, drafts, a document that changes
 * under a draft or before it is sent, and opening another file by path.
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { page, PLAN } from './dom.js';

const window = page();
const TASK = 'lumen-plan';
const ENTRY = {
	key: 'task.section:plan-review:plan:lumen-plan',
	slot: 'task.section',
	pluginId: 'plan-review',
	contributionId: 'plan',
	title: 'Plan review',
	projectId: 'lumen',
	taskId: TASK
};
const SPEC = '# Spec\n\nThe link is signed with the board key.\n';
const data = (docs) => ({
	schema: 'plan-review.v1',
	task: { id: TASK, title: 'Plan the share links' },
	docs: docs ?? [
		{
			path: 'data/lumen-plan/plan.md',
			name: 'plan.md',
			source: 'home',
			text: PLAN,
			truncated: false
		},
		{
			path: 'data/lumen-plan/spec.md',
			name: 'spec.md',
			source: 'home',
			text: SPEC,
			truncated: false
		}
	]
});

/** A host whose sendFeedback answers with `answer` and records each list. */
function fakeHost(answer = { ok: true, pending: false }) {
	const sent = [];
	return {
		sent,
		pluginId: 'plan-review',
		service: async () => null,
		launch: async () => null,
		sendFeedback(list) {
			sent.push(list);
			return Promise.resolve(typeof answer === 'function' ? answer(list) : answer);
		}
	};
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
	for (let i = 0; i < 5; i++) await tick();
};

/** The files Wheelhouse's reader serves (/api/files): path → text. */
let disk = new Map();
const realFetch = globalThis.fetch;
async function reader(url) {
	const p = new URL(url, 'http://127.0.0.1').searchParams.get('path');
	if (disk.has(p)) return new Response(disk.get(p), { status: 200 });
	return new Response(JSON.stringify({ message: 'There is no such file.' }), {
		status: 404,
		headers: { 'content-type': 'application/json' }
	});
}
const $ = (el, sel) => el.querySelector(sel);
const $$ = (el, sel) => [...el.querySelectorAll(sel)];
const byText = (el, sel, text) =>
	$$(el, sel).find((x) => x.textContent.trim() === text) ??
	assert.fail(`no ${sel} reading “${text}”`);

function mount({ host = fakeHost(), d = data(), entry = ENTRY } = {}) {
	const el = document.createElement('plan-review-section');
	el.host = host;
	el.entry = entry;
	el.data = d;
	document.body.replaceChildren(el);
	return el;
}

/** The part of the document that starts at `line`. */
const unitAt = (el, line) =>
	$(el, `.u[data-from="${line}"]`) ?? assert.fail(`no part starts at line ${line}`);

function type(field, text) {
	field.value = text;
	field.dispatchEvent(new window.Event('input', { bubbles: true }));
}

/** Click + on a line, write the note and add it. */
function comment(el, line, text) {
	$(unitAt(el, line), ':scope > .gutter .add').click();
	const area = $(el, '.composer textarea');
	type(area, text);
	byText(el, '.composer button', 'Add note').click();
}

before(async () => {
	await import('../wheelhouse/ui/index.js');
});
after(() => {
	globalThis.fetch = realFetch;
	window.close();
});
beforeEach(() => {
	localStorage.clear();
	document.body.replaceChildren();
	disk = new Map(data().docs.map((d) => [d.path, d.text]));
	globalThis.fetch = reader;
});

describe('reading the plan', () => {
	it('shows the task’s documents, plan first, as Wheelhouse’s reader draws them', () => {
		const el = mount();
		assert.deepEqual(
			$$(el, '.picker .chip').map((c) => [c.textContent, c.getAttribute('aria-pressed')]),
			[
				['plan.md', 'true'],
				['spec.md', 'false'],
				['Another file…', null]
			]
		);
		// The plan's own title shows once, in the document, where it can take a note.
		assert.equal($(el, 'h1.title'), null);
		assert.equal($(el, '.doc h1').textContent, 'Share links for boards');
		assert.equal($(el, '.source').textContent, 'data/lumen-plan/plan.md');
		assert.match($(el, '.how').textContent, /^21 lines\./);
		// Each block, list item and table takes a note, by its first line.
		assert.deepEqual(
			$$(el, '.doc .u').map((u) => u.dataset.from),
			['1', '3', '5', '7', '8', '10', '12', '14', '19']
		);
		assert.equal(
			$(unitAt(el, 8), ':scope > .gutter .add').getAttribute('aria-label'),
			'Comment on lines 8–9'
		);
		assert.ok($(el, '.doc code.language-sh'));
		assert.ok($(el, '.doc tbody tr[data-from="16"]'));
		byText(el, '.picker .chip', 'spec.md').click();
		assert.equal($(el, '.doc h1').textContent, 'Spec');
		assert.equal(localStorage.getItem(`plan-review:v1:last:${TASK}`), '"data/lumen-plan/spec.md"');
	});

	it('shows nothing that runs, whatever the document holds', () => {
		const text =
			'# Plan\n\n<script>window.ran = true</script><img src=x onerror="window.ran = true">\n';
		const el = mount({
			d: data([{ path: 'data/x/plan.md', name: 'plan.md', source: 'home', text, truncated: false }])
		});
		assert.equal($(el, '.doc script'), null);
		assert.equal($(el, '.doc img').getAttribute('onerror'), null);
		assert.equal(window.ran, undefined);
	});

	it('says when there is no plan yet, and offers to open a file', () => {
		const el = mount({ d: data([]) });
		assert.equal($(el, 'h1.title').textContent, 'No plan here yet');
		assert.match($(el, '.doc .empty').textContent, /data\/lumen-plan\/plan\.md/);
		assert.deepEqual(
			$$(el, '.picker .chip').map((c) => c.textContent),
			['Open a Markdown file…']
		);
		assert.match($(el, '.panel').textContent, /Open a document to review it/);
	});
});

describe('commenting', () => {
	it('takes a note on a line, shows it there and in the review, and keeps the draft', () => {
		const el = mount();
		comment(el, 7, 'Use a migration, not a raw table');
		const note = $(unitAt(el, 7), '.slot .note');
		assert.match(note.textContent, /Your note · line 7/);
		assert.match(note.textContent, /“Add the widget table\.”/);
		assert.match(note.textContent, /Use a migration, not a raw table/);
		assert.ok(unitAt(el, 7).classList.contains('noted'));
		assert.deepEqual(
			$$(el, '.panel .list li').map((li) => li.textContent),
			['line 7Use a migration, not a raw table']
		);
		const draft = JSON.parse(
			localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`)
		);
		assert.equal(draft.notes.length, 1);
		assert.equal(draft.notes[0].from, 7);
		// The picker marks a document with a draft.
		assert.ok($(byText(el, '.picker .chip', 'plan.md'), '.dot'));
		// And it is still there on the next visit.
		const again = mount();
		assert.match($(unitAt(again, 7), '.slot .note').textContent, /Use a migration/);
	});

	it('edits and removes a note; Escape leaves without saving', () => {
		const el = mount();
		comment(el, 3, 'Who is “a captain” here?');
		byText(el, '.note button', 'Edit').click();
		const area = $(el, '.composer textarea');
		assert.equal(area.value, 'Who is “a captain” here?');
		type(area, 'Say who may share');
		byText(el, '.composer button', 'Save').click();
		assert.match($(unitAt(el, 3), '.note .text').textContent, /^Say who may share$/);
		$(unitAt(el, 12), ':scope > .gutter .add').click();
		$(el, '.composer textarea').dispatchEvent(
			new window.KeyboardEvent('keydown', { key: 'Escape' })
		);
		assert.equal($(el, '.composer'), null);
		byText(el, '.note button', 'Remove').click();
		assert.equal($(el, '.note'), null);
		assert.equal(localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`), null);
	});

	it('comments on a selected passage, with its quote and lines', async () => {
		const el = mount();
		const p = $(unitAt(el, 3), '.c p');
		const text = p.firstChild;
		const range = document.createRange();
		range.setStart(text, text.data.indexOf('read-only'));
		range.setEnd(text, text.data.indexOf(' with'));
		document.getSelection().removeAllRanges();
		document.getSelection().addRange(range);
		$(el, '.doc').dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
		await tick();
		const floater = $(el, '.on-selection');
		assert.equal(floater.hidden, false);
		floater.click();
		assert.match($(el, '.composer .quote').textContent, /^“read-only board”$/);
		type($(el, '.composer textarea'), 'Read-only for now; editing later');
		byText(el, '.composer button', 'Add note').click();
		assert.match($(unitAt(el, 3), '.note').textContent, /line 3.*“read-only board”/s);

		// A passage in a table row points at that row's line.
		const cell = $(el, 'tbody tr[data-from="17"] td');
		const r2 = document.createRange();
		r2.selectNodeContents(cell);
		document.getSelection().removeAllRanges();
		document.getSelection().addRange(r2);
		$(el, '.doc').dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
		await tick();
		$(el, '.on-selection').click();
		type($(el, '.composer textarea'), 'Which cache?');
		byText(el, '.composer button', 'Add note').click();
		assert.deepEqual(
			$$(el, '.panel .list .where').map((w) => w.textContent),
			['line 3', 'line 17']
		);
	});
});

describe('sending the review', () => {
	it('needs a verdict, then sends every note to Firstmate as one list', async () => {
		const host = fakeHost();
		const el = mount({ host });
		comment(el, 7, 'Use a migration, not a raw table');
		comment(el, 1, 'Call it “share links”, not “sharing”');
		const send = byText(el, '.panel button', 'Send to Firstmate');
		assert.equal(send.disabled, true);
		assert.equal($(el, '.panel .why').textContent, 'Choose Approve or Request changes.');
		byText(el, '.verdict button', 'Request changes').click();
		type($(el, '.panel textarea[name="overall"]'), 'Close. Tighten the rollout.');
		const ready = byText(el, '.panel button', 'Send to Firstmate');
		assert.equal(ready.disabled, false);
		assert.match($(el, '.panel .why').textContent, /then sends 3 lines to Firstmate as one list/);
		ready.click();
		assert.equal(byText(el, '.panel button', 'Sending…').disabled, true);
		await settle();
		assert.deepEqual(host.sent, [
			{
				subject: 'data/lumen-plan/plan.md: Request changes',
				items: [
					{ text: 'Close. Tighten the rollout.' },
					{
						text: 'Call it “share links”, not “sharing”',
						points: '“Share links for boards” (line 1)'
					},
					{ text: 'Use a migration, not a raw table', points: '“Add the widget table.” (line 7)' }
				]
			}
		]);
		assert.match(
			$(el, '.panel .sent').textContent,
			/Sent to Firstmate\. Request changes, 2 notes\./
		);
		assert.equal($(el, '.note'), null, 'the sent notes leave the document');
		assert.equal(localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`), null);
		// The next visit remembers what was sent, and says it quietly once a new draft starts.
		const again = mount();
		assert.match(
			$(again, '.panel .sent').textContent,
			/^Sent just now\. Request changes, 2 notes\./
		);
		comment(again, 3, 'One more thing');
		assert.equal($(again, '.panel .sent'), null);
		assert.match($(again, '.panel').textContent, /Last sent just now: Request changes, 2 notes\./);
	});

	it('approves with nothing to add', async () => {
		const host = fakeHost({ ok: true, pending: true });
		const el = mount({ host });
		byText(el, '.verdict button', 'Approve').click();
		assert.equal(byText(el, '.verdict button', 'Approve').getAttribute('aria-checked'), 'true');
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		assert.deepEqual(host.sent, [
			{
				subject: 'data/lumen-plan/plan.md: Approve',
				items: [{ text: 'Approved as written. Go ahead.' }]
			}
		]);
		assert.match($(el, '.panel .sent').textContent, /still confirming Firstmate has it/);
	});

	it('keeps the draft and says why when Wheelhouse refuses the list', async () => {
		const host = fakeHost({ ok: false, error: 'Firstmate is not running.' });
		const el = mount({ host });
		comment(el, 10, 'Put Share in the menu instead');
		byText(el, '.verdict button', 'Request changes').click();
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		const why = $(el, '.panel .why');
		assert.equal(why.textContent, 'Firstmate is not running.');
		assert.ok(why.classList.contains('error'));
		assert.ok($(unitAt(el, 10), '.note'));
		assert.equal(byText(el, '.panel button', 'Send to Firstmate').disabled, false);
	});

	it('says so, and sends nothing, on a Wheelhouse that cannot send from plugins', () => {
		const host = fakeHost();
		delete host.sendFeedback;
		const el = mount({ host });
		byText(el, '.verdict button', 'Approve').click();
		assert.equal(byText(el, '.panel button', 'Send to Firstmate').disabled, true);
		assert.equal($(el, '.dock button').disabled, true);
		assert.match($(el, '.panel .why').textContent, /too old to send plan reviews/);
	});

	it('settles only the document it sent, whichever is open when Wheelhouse answers', async () => {
		let answer;
		const host = fakeHost(() => new Promise((r) => (answer = r)));
		const el = mount({ host });
		byText(el, '.picker .chip', 'spec.md').click();
		comment(el, 3, 'Which key?');
		byText(el, '.picker .chip', 'plan.md').click();
		comment(el, 7, 'Use a migration');
		byText(el, '.verdict button', 'Request changes').click();
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		assert.equal(host.sent.length, 1);
		byText(el, '.picker .chip', 'spec.md').click();
		answer({ ok: true, pending: false });
		await settle();
		assert.equal(localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`), null);
		assert.equal(
			JSON.parse(localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/spec.md`)).notes[0]
				.text,
			'Which key?'
		);
		assert.match($(unitAt(el, 3), '.note').textContent, /Which key\?/);
		byText(el, '.picker .chip', 'plan.md').click();
		assert.equal($(el, '.note'), null);
		assert.match($(el, '.panel .sent').textContent, /Request changes, 1 note\./);
	});

	it('keeps a bar with Send in view, which leads to the verdict until there is one', async () => {
		const host = fakeHost();
		const el = mount({ host });
		const bar = () => $(el, '.dock');
		assert.equal(bar().hidden, false);
		assert.equal($(bar(), '.summary').textContent, 'No notes yet');
		assert.equal($(bar(), 'button').textContent, 'Finish your review');
		$(bar(), 'button').click();
		assert.equal(document.activeElement, $(el, '.verdict button'));
		assert.equal(host.sent.length, 0);
		comment(el, 7, 'Use a migration');
		byText(el, '.verdict button', 'Request changes').click();
		assert.equal($(bar(), '.summary').textContent, '1 note · Request changes');
		assert.equal($(bar(), 'button').textContent, 'Send to Firstmate');
		$(bar(), 'button').click();
		await settle();
		assert.equal(host.sent.length, 1);
	});

	it('discards a draft', () => {
		const el = mount();
		comment(el, 5, 'Number the steps');
		byText(el, '.panel button', 'Discard this draft').click();
		assert.equal($(el, '.note'), null);
		assert.match($(el, '.panel').textContent, /No notes yet/);
	});
});

describe('when the document changes', () => {
	it('moves notes with the text they quote, and says so', () => {
		const el = mount();
		comment(el, 7, 'Use a migration, not a raw table');
		const changed = PLAN.replace('## Steps\n', '## Steps\n\nIn three steps:\n');
		el.data = data([
			{
				path: 'data/lumen-plan/plan.md',
				name: 'plan.md',
				source: 'home',
				text: changed,
				truncated: false
			}
		]);
		assert.match($(unitAt(el, 9), '.note').textContent, /Your note · line 9/);
		assert.match($(el, '.banner').textContent, /changed since you started/);
		byText(el, '.banner button', 'OK').click();
		assert.equal($(el, '.banner'), null);
	});

	it('reads it again on Send, and sends nothing if it changed, until the notes move onto the new text', async () => {
		const host = fakeHost();
		const el = mount({ host });
		comment(el, 7, 'Use a migration, not a raw table');
		byText(el, '.verdict button', 'Request changes').click();
		disk.set(
			'data/lumen-plan/plan.md',
			PLAN.replace('## Steps\n', '## Steps\n\nIn three steps:\n')
		);
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		assert.equal(host.sent.length, 0);
		assert.match(
			$(el, '.panel [role="alert"]').textContent,
			/plan\.md changed since you opened it/
		);
		assert.equal(byText(el, '.panel button', 'Send to Firstmate').disabled, false);
		byText(el, '.panel button', 'Use the new text').click();
		assert.equal($(el, '.panel [role="alert"]'), null);
		assert.match($(unitAt(el, 9), '.note').textContent, /Your note · line 9/);
		assert.match($(el, '.banner').textContent, /changed since you started/);
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		assert.equal(host.sent[0].items[0].points, '“Add the widget table.” (line 9)');
	});

	it('sends nothing when it cannot read the document again', async () => {
		const host = fakeHost();
		const el = mount({ host });
		byText(el, '.verdict button', 'Approve').click();
		disk.delete('data/lumen-plan/plan.md');
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		assert.equal(host.sent.length, 0);
		assert.match($(el, '.panel .why.error').textContent, /Could not read plan\.md again/);
	});

	it('leaves the page alone when the same text comes again', () => {
		const el = mount();
		$(unitAt(el, 3), ':scope > .gutter .add').click();
		type($(el, '.composer textarea'), 'half written');
		el.data = data();
		assert.equal($(el, '.composer textarea').value, 'half written');
	});
});

describe('another file', () => {
	it('opens a Markdown file by path through Wheelhouse’s reader, and remembers it', async () => {
		const asked = [];
		const real = globalThis.fetch;
		globalThis.fetch = async (url) => {
			asked.push(url);
			if (url === '/api/files?path=data%2Fother%2Fplan.md')
				return new Response('# Other plan\n\nHello.\n', { status: 200 });
			return new Response(
				JSON.stringify({ message: 'That file is outside the folders Wheelhouse may read.' }),
				{
					status: 403,
					headers: { 'content-type': 'application/json' }
				}
			);
		};
		try {
			const el = mount();
			byText(el, '.picker .chip', 'Another file…').click();
			const input = $(el, '.other input');
			input.value = '/etc/notes.md';
			byText(el, '.other button', 'Open').click();
			await tick();
			await tick();
			assert.match($(el, '.other').textContent, /outside the folders Wheelhouse may read/);
			for (const p of ['notes.txt', 'notes.markdown']) {
				input.value = p;
				byText(el, '.other button', 'Open').click();
				await tick();
				assert.match($(el, '.other').textContent, /opens Markdown files/);
			}
			input.value = 'data/other/plan.md';
			byText(el, '.other button', 'Open').click();
			await tick();
			await tick();
			assert.equal($(el, '.doc h1').textContent, 'Other plan');
			assert.deepEqual(
				$$(el, '.picker .chip').map((c) => c.textContent),
				['plan.md', 'spec.md', 'plan.md', 'Another file…']
			);
			assert.equal(el.querySelector('.other').hidden, true);
			assert.deepEqual(JSON.parse(localStorage.getItem(`plan-review:v1:extra:${TASK}`)), [
				'data/other/plan.md'
			]);
			// It comes back on the next visit.
			const again = mount();
			await tick();
			await tick();
			assert.equal($$(again, '.picker .chip').length, 4);
		} finally {
			globalThis.fetch = real;
		}
	});

	it('guards a file opened by path the same way on Send', async () => {
		disk.set('data/other/plan.md', '# Other plan\n\nHello.\n');
		const host = fakeHost();
		const el = mount({ host });
		byText(el, '.picker .chip', 'Another file…').click();
		$(el, '.other input').value = 'data/other/plan.md';
		byText(el, '.other button', 'Open').click();
		await settle();
		byText(el, '.verdict button', 'Approve').click();
		disk.set('data/other/plan.md', '# Other plan\n\nHello again.\n');
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		assert.equal(host.sent.length, 0);
		byText(el, '.panel button', 'Use the new text').click();
		assert.match($(el, '.doc').textContent, /Hello again\./);
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		assert.equal(host.sent[0].subject, 'data/other/plan.md: Approve');
	});
});

describe('a long plan', () => {
	const WHOLE = `${PLAN}\n## Later\n\nThe end.\n`;
	const long = () =>
		data([
			{
				path: 'data/lumen-plan/plan.md',
				name: 'plan.md',
				source: 'home',
				text: PLAN.slice(0, 60),
				truncated: true
			}
		]);

	it('reads the whole of it when Wheelhouse’s plugin read cut it short', async () => {
		disk.set('data/lumen-plan/plan.md', WHOLE);
		const el = mount({ d: long() });
		assert.match($(el, '.banner').textContent, /only its first 64 KB/);
		assert.match($(el, '.panel').textContent, /Reading the whole document/);
		await settle();
		assert.match($(el, '.doc').textContent, /The end\./);
		assert.equal($(el, '.banner'), null);
	});

	it('keeps its notes in place, with no “changed”, each time it opens', async () => {
		disk.set('data/lumen-plan/plan.md', WHOLE);
		const el = mount({ d: long() });
		await settle();
		comment(el, 25, 'Say what happens later');
		const before = localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`);
		const again = mount({ d: long() });
		await settle();
		assert.equal($(again, '.banner'), null);
		assert.match($(unitAt(again, 25), '.note').textContent, /Say what happens later/);
		assert.equal(localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`), before);
	});

	it('notices a change past the first 64 KB on Send', async () => {
		disk.set('data/lumen-plan/plan.md', WHOLE);
		const host = fakeHost();
		const el = mount({ d: long(), host });
		await settle();
		byText(el, '.verdict button', 'Approve').click();
		disk.set('data/lumen-plan/plan.md', WHOLE.replace('The end.', 'The real end.'));
		byText(el, '.panel button', 'Send to Firstmate').click();
		await settle();
		assert.equal(host.sent.length, 0);
		assert.match($(el, '.panel [role="alert"]').textContent, /changed since you opened it/);
	});
});
