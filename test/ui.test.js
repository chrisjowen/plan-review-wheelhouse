/**
 * The page in a browser (jsdom), as Wheelhouse hosts it on the plugin's own
 * page: `host` (with sendFeedback), `entry` and `data` set on the element,
 * and documents read through Wheelhouse's reader (/api/files, faked here).
 * Picking a task and a document, comments by line and by selected passage,
 * the review thread, the verdict, sending, drafts, a document that changes
 * under a draft or before it is sent, links to a task's plan, and opening
 * another file by path.
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { page, PLAN } from './dom.js';

const window = page('http://127.0.0.1:4310/plugins/plan-review/review');
const TASK = 'lumen-plan';
const ENTRY = {
	key: 'nav.page:plan-review:review',
	slot: 'nav.page',
	pluginId: 'plan-review',
	contributionId: 'review',
	title: 'Plan review',
	projectId: null
};
const SPEC = '# Spec\n\nThe link is signed with the board key.\n';
const OTHER = '# Ops plan\n\nMove the cron jobs.\n';
const home = (task, name) => ({
	path: `data/${task}/${name}`,
	name,
	source: 'home',
	file: null
});
const LUMEN = {
	id: TASK,
	title: 'Plan the share links',
	project: 'lumen',
	status: 'Needs your decision',
	waiting: true,
	docs: [home(TASK, 'plan.md'), home(TASK, 'spec.md')]
};
const OPS = {
	id: 'ops-cron',
	title: 'Move the cron jobs',
	project: 'ops',
	status: 'Working',
	waiting: false,
	docs: [home('ops-cron', 'plan.md')]
};
const data = (tasks = [LUMEN]) => ({ schema: 'plan-review.v2', tasks });

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
	for (let i = 0; i < 8; i++) await tick();
};

/** The files Wheelhouse's reader serves (/api/files): path → text. */
let disk = new Map();
let asked = [];
const realFetch = globalThis.fetch;
async function reader(url) {
	asked.push(url);
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
/** The round send button in the reply box, named by its label. */
const sendButton = (el) => $(el, '.thread .reply button.send') ?? assert.fail('no send button');
const draftOf = (task, path) => JSON.parse(localStorage.getItem(`plan-review:v1:${task}:${path}`));

async function mount({ host = fakeHost(), d = data() } = {}) {
	const el = document.createElement('plan-review-page');
	el.host = host;
	el.entry = ENTRY;
	el.data = d;
	document.body.replaceChildren(el);
	await settle();
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

/** Pick a document by its chip. */
async function open(el, name) {
	byText(el, '.picker .chip', name).click();
	await settle();
}

/** The window regains focus, and the page reads the open document again. */
async function refocus() {
	window.dispatchEvent(new window.Event('focus'));
	await settle();
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
	window.history.replaceState(null, '', '/plugins/plan-review/review');
	disk = new Map([
		[`data/${TASK}/plan.md`, PLAN],
		[`data/${TASK}/spec.md`, SPEC],
		['data/ops-cron/plan.md', OTHER]
	]);
	asked = [];
	globalThis.fetch = reader;
});

describe('picking a plan', () => {
	it('shows a task’s documents, plan first, read whole through Wheelhouse’s reader', async () => {
		const el = await mount();
		assert.deepEqual(
			$$(el, '.picker .chip').map((c) => [c.textContent, c.getAttribute('aria-pressed')]),
			[
				['plan.md', 'true'],
				['spec.md', 'false'],
				['Another file…', null]
			]
		);
		assert.deepEqual(asked, [`/api/files?path=${encodeURIComponent(`data/${TASK}/plan.md`)}`]);
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
		await open(el, 'spec.md');
		assert.equal($(el, '.doc h1').textContent, 'Spec');
		assert.equal(localStorage.getItem(`plan-review:v1:last:${TASK}`), '"data/lumen-plan/spec.md"');
	});

	it('picks between tasks, waiting ones marked, and keeps each task’s draft apart', async () => {
		const el = await mount({ d: data([LUMEN, OPS]) });
		const select = $(el, '.task select');
		assert.deepEqual(
			$$(select, 'option').map((o) => [o.value, o.textContent]),
			[
				[TASK, 'Plan the share links · waiting on you'],
				['ops-cron', 'Move the cron jobs']
			]
		);
		assert.equal($(el, '.task .status').textContent, 'lumen-plan · Needs your decision');
		assert.match($(el, '.thread-head .sub').textContent, /plan\.md · Plan the share links/);
		comment(el, 7, 'Use a migration');
		select.value = 'ops-cron';
		select.dispatchEvent(new window.Event('change', { bubbles: true }));
		await settle();
		assert.equal($(el, '.doc h1').textContent, 'Ops plan');
		assert.deepEqual(
			$$(el, '.picker .chip').map((c) => c.textContent),
			['plan.md', 'Another file…']
		);
		assert.equal($(el, '.note'), null);
		assert.equal(localStorage.getItem('plan-review:v1:task'), '"ops-cron"');
		// The page opens on the last task next time, and the first task's draft is where it was left.
		const again = await mount({ d: data([LUMEN, OPS]) });
		assert.equal($(again, '.task select').value, 'ops-cron');
		const back = $(again, '.task select');
		back.value = TASK;
		back.dispatchEvent(new window.Event('change', { bubbles: true }));
		await settle();
		assert.match($(unitAt(again, 7), '.note').textContent, /Use a migration/);
	});

	it('opens the task and document a link names', async () => {
		window.history.replaceState(
			null,
			'',
			`/plugins/plan-review/review?task=${TASK}&doc=${encodeURIComponent(`data/${TASK}/spec.md`)}`
		);
		const el = await mount({ d: data([OPS, LUMEN]) });
		assert.equal($(el, '.task select').value, TASK);
		assert.equal($(el, '.doc h1').textContent, 'Spec');
	});

	it('opens a link’s file for a task with no documents on offer yet', async () => {
		disk.set('data/new-task/plan.md', '# New plan\n\nFirst cut.\n');
		window.history.replaceState(
			null,
			'',
			'/plugins/plan-review/review?task=new-task&doc=data%2Fnew-task%2Fplan.md'
		);
		const host = fakeHost();
		const el = await mount({ host, d: data([LUMEN]) });
		assert.equal($(el, '.task select').value, 'new-task');
		assert.equal($(el, '.doc h1').textContent, 'New plan');
		byText(el, '.verdict button', 'Approve').click();
		sendButton(el).click();
		await settle();
		assert.equal(host.sent[0].task, 'new-task');
	});

	it('shows nothing that runs, whatever the document holds', async () => {
		disk.set(
			'data/x/plan.md',
			'# Plan\n\n<script>window.ran = true</script><img src=x onerror="window.ran = true">\n'
		);
		const el = await mount({
			d: data([{ ...LUMEN, id: 'x', docs: [home('x', 'plan.md')] }])
		});
		assert.equal($(el, '.doc script'), null);
		assert.equal($(el, '.doc img').getAttribute('onerror'), null);
		assert.equal(window.ran, undefined);
	});

	it('says when there are no plans yet', async () => {
		const el = await mount({ d: data([]) });
		assert.equal($(el, 'h1.title').textContent, 'No plans to review');
		assert.match($(el, '.doc .empty').textContent, /data\/<task>\/plan\.md/);
		assert.equal($(el, '.task select'), null);
		assert.deepEqual($$(el, '.picker .chip'), []);
		assert.match($(el, '.thread').textContent, /Open a document to review it/);
	});

	it('says when a document cannot be read', async () => {
		disk.delete(`data/${TASK}/plan.md`);
		const el = await mount();
		assert.equal($(el, 'h1.title').textContent, 'Could not read plan.md');
		assert.equal($(el, '.doc .empty').textContent, 'There is no such file.');
	});

	it('tries a document it could not read again, when the window comes back and when it is picked again', async () => {
		disk.delete(`data/${TASK}/plan.md`);
		const el = await mount();
		assert.equal($(el, 'h1.title').textContent, 'Could not read plan.md');
		disk.set(`data/${TASK}/plan.md`, PLAN);
		await refocus();
		assert.equal($(el, '.doc h1').textContent, 'Share links for boards');

		disk.delete(`data/${TASK}/spec.md`);
		await open(el, 'spec.md');
		assert.equal($(el, 'h1.title').textContent, 'Could not read spec.md');
		await open(el, 'plan.md');
		disk.set(`data/${TASK}/spec.md`, SPEC);
		await open(el, 'spec.md');
		assert.equal($(el, '.doc h1').textContent, 'Spec');
	});

	it('keeps the task shown, its document and a half-written note, when a refresh no longer lists it', async () => {
		const el = await mount({ d: data([OPS, LUMEN]) });
		byText(el, '.task select option', 'Plan the share links · waiting on you');
		$(el, '.task select').value = TASK;
		$(el, '.task select').dispatchEvent(new window.Event('change'));
		await settle();
		await open(el, 'spec.md');
		$(unitAt(el, 3), ':scope > .gutter .add').click();
		type($(el, '.composer textarea'), 'half written');
		el.data = data([OPS]);
		await settle();
		assert.equal($(el, '.task select').value, TASK);
		assert.equal($(el, '.doc h1').textContent, 'Spec');
		assert.equal($(el, '.composer textarea').value, 'half written');
		el.data = data([OPS, LUMEN]);
		await settle();
		assert.equal($(el, '.task select').value, TASK);
		assert.equal($(el, '.composer textarea').value, 'half written');
	});
});

describe('commenting', () => {
	it('takes a note on a line, shows it there and in the thread, and keeps the draft', async () => {
		const el = await mount();
		comment(el, 7, 'Use a migration, not a raw table');
		const note = $(unitAt(el, 7), '.slot .note');
		assert.match($(note, '.meta').textContent, /You · line 7/);
		assert.ok($(note, '.bubble.bubble-captain'));
		assert.match($(note, '.reply-quote').textContent, /“Add the widget table\.”/);
		assert.match($(note, '.text').textContent, /Use a migration, not a raw table/);
		assert.ok(unitAt(el, 7).classList.contains('noted'));
		// In the thread: the captain's bubble, quoting what it is about.
		const msgs = $$(el, '.thread .msgs .msg-captain');
		assert.equal(msgs.length, 1);
		assert.equal($(msgs[0], '.reply-quote-who').textContent, 'Line 7');
		assert.equal($(msgs[0], '.reply-quote-text').textContent, '“Add the widget table.”');
		assert.equal($(msgs[0], '.text').textContent, 'Use a migration, not a raw table');
		const draft = draftOf(TASK, 'data/lumen-plan/plan.md');
		assert.equal(draft.notes.length, 1);
		assert.equal(draft.notes[0].from, 7);
		// The picker marks a document with a draft.
		assert.ok($(byText(el, '.picker .chip', 'plan.md'), '.dot'));
		// And it is still there on the next visit.
		const again = await mount();
		assert.match($(unitAt(again, 7), '.slot .note').textContent, /Use a migration/);
	});

	it('writes a note in a bubble, quoting its passage; edits, removes, and Escape leaves', async () => {
		const el = await mount();
		$(unitAt(el, 3), ':scope > .gutter .add').click();
		const box = $(el, '.composer');
		assert.ok($(box, '.bubble.bubble-captain textarea'));
		assert.match($(box, '.reply-quote').textContent, /Line 3.*Let a captain share/s);
		type($(box, 'textarea'), 'Who is “a captain” here?');
		byText(el, '.composer button', 'Add note').click();
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
		// Edit from the thread opens the same box in the document.
		byText(el, '.thread .msg button', 'Edit').click();
		assert.equal($(unitAt(el, 3), '.composer textarea').value, 'Say who may share');
		$(el, '.composer textarea').dispatchEvent(
			new window.KeyboardEvent('keydown', { key: 'Escape' })
		);
		byText(el, '.thread .msg button', 'Remove').click();
		assert.equal($(el, '.note'), null);
		assert.equal($(el, '.thread .msg-captain'), null);
		assert.equal(localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`), null);
	});

	it('comments on a selected passage, with its quote and lines', async () => {
		const el = await mount();
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
		assert.match($(el, '.composer .reply-quote-text').textContent, /^“read-only board”$/);
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
			$$(el, '.thread .msg-captain .reply-quote-who').map((w) => w.textContent),
			['Line 3', 'Line 17']
		);
	});

	it('shows a note’s lines in the document from its quote in the thread', async () => {
		const el = await mount();
		comment(el, 10, 'Put Share in the menu');
		$(el, '.thread .msg-captain button.reply-quote').click();
		assert.ok(unitAt(el, 10).classList.contains('flash'));
	});
});

describe('sending the review', () => {
	it('needs a verdict, then sends every note to Firstmate as one list about the task', async () => {
		const host = fakeHost();
		const el = await mount({ host });
		comment(el, 7, 'Use a migration, not a raw table');
		comment(el, 1, 'Call it “share links”, not “sharing”');
		assert.equal(sendButton(el).getAttribute('aria-label'), 'Send to Firstmate');
		assert.equal(sendButton(el).disabled, true);
		assert.equal($(el, '.thread .why').textContent, 'Choose Approve or Request changes.');
		byText(el, '.verdict button', 'Request changes').click();
		type($(el, '.thread textarea[name="overall"]'), 'Close. Tighten the rollout.');
		assert.equal(sendButton(el).disabled, false);
		assert.match($(el, '.thread .why').textContent, /then sends 3 lines to Firstmate as one list/);
		sendButton(el).click();
		assert.equal(sendButton(el).getAttribute('aria-label'), 'Sending…');
		assert.equal(sendButton(el).disabled, true);
		await settle();
		assert.deepEqual(host.sent, [
			{
				task: TASK,
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
		const sent = $(el, '.thread .msgs .sent');
		assert.match(sent.textContent, /Sent to Firstmate\. Request changes, 2 notes\./);
		assert.ok($(sent, '.bubble.bubble-captain'));
		assert.equal($(el, '.note'), null, 'the sent notes leave the document');
		assert.equal(localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`), null);
		// The next visit remembers what was sent, and says it quietly once a new draft starts.
		const again = await mount();
		assert.match(
			$(again, '.thread .sent').textContent,
			/^Sent just now\. Request changes, 2 notes\./
		);
		comment(again, 3, 'One more thing');
		assert.equal($(again, '.thread .sent'), null);
		assert.match($(again, '.thread').textContent, /Last sent just now: Request changes, 2 notes\./);
	});

	it('approves with nothing to add', async () => {
		const host = fakeHost({ ok: true, pending: true });
		const el = await mount({ host });
		byText(el, '.verdict button', 'Approve').click();
		assert.equal(byText(el, '.verdict button', 'Approve').getAttribute('aria-checked'), 'true');
		sendButton(el).click();
		await settle();
		assert.deepEqual(host.sent, [
			{
				task: TASK,
				subject: 'data/lumen-plan/plan.md: Approve',
				items: [{ text: 'Approved as written. Go ahead.' }]
			}
		]);
		assert.match($(el, '.thread .sent').textContent, /still confirming Firstmate has it/);
	});

	it('sends with ⌘↵ from the note on the whole plan', async () => {
		const host = fakeHost();
		const el = await mount({ host });
		byText(el, '.verdict button', 'Approve').click();
		const overall = $(el, '.thread textarea[name="overall"]');
		type(overall, 'Good to go.');
		overall.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
		await settle();
		assert.deepEqual(host.sent[0].items, [{ text: 'Good to go.' }]);
	});

	it('keeps the draft and says why when Wheelhouse refuses the list', async () => {
		const host = fakeHost({ ok: false, error: 'Firstmate is not running.' });
		const el = await mount({ host });
		comment(el, 10, 'Put Share in the menu instead');
		byText(el, '.verdict button', 'Request changes').click();
		sendButton(el).click();
		await settle();
		const why = $(el, '.thread .why');
		assert.equal(why.textContent, 'Firstmate is not running.');
		assert.ok(why.classList.contains('error'));
		assert.ok($(unitAt(el, 10), '.note'));
		assert.equal(sendButton(el).disabled, false);
	});

	it('says so, and sends nothing, on a Wheelhouse that cannot send from plugins', async () => {
		const host = fakeHost();
		delete host.sendFeedback;
		const el = await mount({ host });
		byText(el, '.verdict button', 'Approve').click();
		assert.equal(sendButton(el).disabled, true);
		assert.equal($(el, '.dock button').disabled, true);
		assert.match($(el, '.thread .why').textContent, /too old to send plan reviews/);
	});

	it('settles only the document it sent, whichever is open when Wheelhouse answers', async () => {
		let answer;
		const host = fakeHost(() => new Promise((r) => (answer = r)));
		const el = await mount({ host });
		await open(el, 'spec.md');
		comment(el, 3, 'Which key?');
		await open(el, 'plan.md');
		comment(el, 7, 'Use a migration');
		byText(el, '.verdict button', 'Request changes').click();
		sendButton(el).click();
		await settle();
		assert.equal(host.sent.length, 1);
		await open(el, 'spec.md');
		answer({ ok: true, pending: false });
		await settle();
		assert.equal(localStorage.getItem(`plan-review:v1:${TASK}:data/lumen-plan/plan.md`), null);
		assert.equal(draftOf(TASK, 'data/lumen-plan/spec.md').notes[0].text, 'Which key?');
		assert.match($(unitAt(el, 3), '.note').textContent, /Which key\?/);
		await open(el, 'plan.md');
		assert.equal($(el, '.note'), null);
		assert.match($(el, '.thread .sent').textContent, /Request changes, 1 note\./);
	});

	it('holds the notes and verdict still while it sends', async () => {
		let answer;
		const host = fakeHost(() => new Promise((r) => (answer = r)));
		const el = await mount({ host });
		comment(el, 7, 'Use a migration');
		byText(el, '.verdict button', 'Request changes').click();
		sendButton(el).click();
		await settle();
		assert.equal(host.sent.length, 1);
		// Nothing can be added or changed until Wheelhouse answers, so nothing unsent is lost.
		$(unitAt(el, 10), ':scope > .gutter .add').click();
		assert.equal($(el, '.composer'), null);
		assert.ok($$(el, '.verdict button').every((b) => b.disabled));
		assert.equal($(el, '.thread textarea[name="overall"]').disabled, true);
		assert.ok($$(el, '.thread .msg button.quiet').every((b) => b.disabled));
		answer({ ok: true, pending: false });
		await settle();
		assert.equal($(unitAt(el, 7), '.note'), null);
		assert.equal($(el, '.thread textarea[name="overall"]').disabled, false);
		comment(el, 10, 'Put Share in the menu');
		assert.match($(unitAt(el, 10), '.note').textContent, /Put Share in the menu/);
	});

	it('keeps a bar with Send in view, which leads to the verdict until there is one', async () => {
		const host = fakeHost();
		const el = await mount({ host });
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

	it('discards a draft', async () => {
		const el = await mount();
		comment(el, 5, 'Number the steps');
		byText(el, '.thread button', 'Discard this draft').click();
		assert.equal($(el, '.note'), null);
		assert.match($(el, '.thread').textContent, /No notes yet/);
	});
});

describe('when the document changes', () => {
	const NEW = PLAN.replace('## Steps\n', '## Steps\n\nIn three steps:\n');
	const stored = () => draftOf(TASK, 'data/lumen-plan/plan.md');

	it('shows the new text when it is read again, and moves the notes only when asked', async () => {
		const el = await mount();
		comment(el, 7, 'Use a migration, not a raw table');
		const before = stored();
		disk.set('data/lumen-plan/plan.md', NEW);
		await refocus();
		assert.match($(el, '.doc').textContent, /In three steps:/);
		assert.match($(el, '.banner').textContent, /changed since you started your review/);
		assert.deepEqual(stored(), before);
		assert.match($(unitAt(el, 7), '.note').textContent, /You · line 7/);
		byText(el, '.banner button', 'Move notes onto this text').click();
		assert.equal($(el, '.banner'), null);
		assert.match($(unitAt(el, 9), '.note').textContent, /You · line 9/);
		assert.equal(stored().notes[0].from, 9);
		assert.notEqual(stored().hash, before.hash);
	});

	it('keeps “text changed” on a note whose quote is gone, after the draft is opened again', async () => {
		const el = await mount();
		comment(el, 7, 'Use a migration, not a raw table');
		disk.set(
			'data/lumen-plan/plan.md',
			PLAN.replace('1. Add the widget table.\n', '1. Add the board column.\n')
		);
		await refocus();
		byText(el, '.banner button', 'Move notes onto this text').click();
		assert.match($(unitAt(el, 7), '.note .moved').textContent, /text changed/);
		assert.match($(el, '.thread .msg-captain .moved').textContent, /text changed/);
		const again = await mount();
		assert.match($(unitAt(again, 7), '.note .moved').textContent, /text changed/);
		assert.equal($(again, '.banner'), null);
	});

	it('sends nothing after new text showed, until the notes move onto it', async () => {
		const host = fakeHost();
		const el = await mount({ host });
		comment(el, 7, 'Use a migration, not a raw table');
		byText(el, '.verdict button', 'Request changes').click();
		disk.set('data/lumen-plan/plan.md', NEW);
		await refocus();
		sendButton(el).click();
		await settle();
		assert.equal(host.sent.length, 0);
		assert.match(
			$(el, '.thread [role="alert"]').textContent,
			/plan\.md changed since you opened it/
		);
		byText(el, '.thread button', 'Use the new text').click();
		assert.match($(unitAt(el, 9), '.note').textContent, /You · line 9/);
		sendButton(el).click();
		await settle();
		assert.equal(host.sent[0].items[0].points, '“Add the widget table.” (line 9)');
	});

	it('reads it again on Send, and sends nothing if it changed, until the notes move onto the new text', async () => {
		const host = fakeHost();
		const el = await mount({ host });
		comment(el, 7, 'Use a migration, not a raw table');
		byText(el, '.verdict button', 'Request changes').click();
		disk.set('data/lumen-plan/plan.md', NEW);
		sendButton(el).click();
		await settle();
		assert.equal(host.sent.length, 0);
		assert.match(
			$(el, '.thread [role="alert"]').textContent,
			/plan\.md changed since you opened it/
		);
		assert.equal(sendButton(el).disabled, false);
		byText(el, '.thread button', 'Use the new text').click();
		assert.equal($(el, '.thread [role="alert"]'), null);
		assert.match($(unitAt(el, 9), '.note').textContent, /You · line 9/);
		assert.equal($(el, '.banner'), null);
		sendButton(el).click();
		await settle();
		assert.equal(host.sent[0].items[0].points, '“Add the widget table.” (line 9)');
	});

	it('sends nothing when it cannot read the document again', async () => {
		const host = fakeHost();
		const el = await mount({ host });
		byText(el, '.verdict button', 'Approve').click();
		disk.delete('data/lumen-plan/plan.md');
		sendButton(el).click();
		await settle();
		assert.equal(host.sent.length, 0);
		assert.match($(el, '.thread .why.error').textContent, /Could not read plan\.md again/);
	});

	it('leaves the page alone when the same text comes again', async () => {
		const el = await mount();
		$(unitAt(el, 3), ':scope > .gutter .add').click();
		type($(el, '.composer textarea'), 'half written');
		el.data = data();
		await refocus();
		assert.equal($(el, '.composer textarea').value, 'half written');
	});

	it('keeps the caret in the note on the whole plan when Wheelhouse refreshes the page', async () => {
		const el = await mount();
		const overall = $(el, '.thread textarea[name="overall"]');
		overall.focus();
		type(overall, 'Close, but');
		overall.setSelectionRange(5, 5);
		el.data = data();
		await settle();
		const now = $(el, '.thread textarea[name="overall"]');
		assert.equal(document.activeElement, now);
		assert.equal(now.value, 'Close, but');
		assert.deepEqual([now.selectionStart, now.selectionEnd], [5, 5]);
	});

	it('reads a file the task changed by its full path in the worktree', async () => {
		disk.set('/w/lumen-plan/docs/plan.md', PLAN);
		const host = fakeHost();
		const el = await mount({
			host,
			d: data([
				{
					...LUMEN,
					docs: [
						{
							path: 'docs/plan.md',
							name: 'plan.md',
							source: 'task',
							file: '/w/lumen-plan/docs/plan.md'
						}
					]
				}
			])
		});
		assert.equal($(el, '.source').textContent, 'docs/plan.md (in the worktree)');
		byText(el, '.verdict button', 'Approve').click();
		sendButton(el).click();
		await settle();
		assert.equal(host.sent[0].subject, 'docs/plan.md: Approve');
		assert.ok(asked.every((u) => u === '/api/files?path=%2Fw%2Flumen-plan%2Fdocs%2Fplan.md'));
	});
});

describe('another file', () => {
	it('opens a Markdown file by path through Wheelhouse’s reader, and remembers it for the task', async () => {
		disk.set('data/other/plan.md', '# Other plan\n\nHello.\n');
		const el = await mount();
		byText(el, '.picker .chip', 'Another file…').click();
		const input = $(el, '.other input');
		input.value = '/etc/notes.md';
		byText(el, '.other button', 'Open').click();
		await settle();
		assert.match($(el, '.other').textContent, /There is no such file/);
		for (const p of ['notes.txt', 'notes.markdown']) {
			input.value = p;
			byText(el, '.other button', 'Open').click();
			await tick();
			assert.match($(el, '.other').textContent, /opens Markdown files/);
		}
		input.value = 'data/other/plan.md';
		byText(el, '.other button', 'Open').click();
		await settle();
		assert.equal($(el, '.doc h1').textContent, 'Other plan');
		assert.deepEqual(
			$$(el, '.picker .chip').map((c) => c.textContent),
			['plan.md', 'spec.md', 'plan.md', 'Another file…']
		);
		assert.equal(el.querySelector('.other').hidden, true);
		assert.deepEqual(JSON.parse(localStorage.getItem(`plan-review:v1:extra:${TASK}`)), [
			'data/other/plan.md'
		]);
		// It comes back on the next visit, for this task only.
		const again = await mount({ d: data([LUMEN, OPS]) });
		assert.equal($$(again, '.picker .chip').length, 4);
		const select = $(again, '.task select');
		select.value = 'ops-cron';
		select.dispatchEvent(new window.Event('change', { bubbles: true }));
		await settle();
		assert.equal($$(again, '.picker .chip').length, 2);
	});

	it('guards a file opened by path the same way on Send', async () => {
		disk.set('data/other/plan.md', '# Other plan\n\nHello.\n');
		const host = fakeHost();
		const el = await mount({ host });
		byText(el, '.picker .chip', 'Another file…').click();
		$(el, '.other input').value = 'data/other/plan.md';
		byText(el, '.other button', 'Open').click();
		await settle();
		byText(el, '.verdict button', 'Approve').click();
		disk.set('data/other/plan.md', '# Other plan\n\nHello again.\n');
		sendButton(el).click();
		await settle();
		assert.equal(host.sent.length, 0);
		byText(el, '.thread button', 'Use the new text').click();
		assert.match($(el, '.doc').textContent, /Hello again\./);
		sendButton(el).click();
		await settle();
		assert.equal(host.sent[0].subject, 'data/other/plan.md: Approve');
		assert.equal(host.sent[0].task, TASK);
	});
});
