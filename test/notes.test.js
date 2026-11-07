import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	buildList,
	cut,
	draftKey,
	emptyDraft,
	fingerprint,
	lineLabel,
	MAX_POINTS,
	MAX_SUBJECT,
	pointsFor,
	readDraft,
	reanchor,
	subjectFor
} from '../wheelhouse/ui/notes.js';

const note = (over = {}) => ({
	id: 'n1',
	text: 'Use a migration, not a raw table',
	quote: '1. Add the widget table.',
	from: 7,
	to: 7,
	at: 1,
	...over
});

describe('the feedback list', () => {
	it('puts the overall note first, then each note in the order of the document', () => {
		const r = buildList({
			path: 'data/lumen-plan/plan.md',
			verdict: 'changes',
			overall: '  Close, but   tighten the rollout. ',
			notes: [
				note({ id: 'b', text: 'Say who owns the rollout', quote: 'Show Share', from: 10, to: 10 }),
				note({ id: 'a' })
			]
		});
		assert.equal(r.ok, true);
		assert.deepEqual(r.list, {
			subject: 'data/lumen-plan/plan.md: Request changes',
			items: [
				{ text: 'Close, but tighten the rollout.' },
				{ text: 'Use a migration, not a raw table', points: '“1. Add the widget table.” (line 7)' },
				{ text: 'Say who owns the rollout', points: '“Show Share” (line 10)' }
			]
		});
	});

	it('still tells Firstmate when the captain approves with nothing to add', () => {
		const r = buildList({ path: 'plan.md', verdict: 'approve', overall: ' ', notes: [] });
		assert.deepEqual(r, {
			ok: true,
			list: { subject: 'plan.md: Approve', items: [{ text: 'Approved as written. Go ahead.' }] }
		});
	});

	it('approves with notes, sending the notes', () => {
		const r = buildList({ path: 'plan.md', verdict: 'approve', overall: '', notes: [note()] });
		assert.equal(r.list.subject, 'plan.md: Approve');
		assert.equal(r.list.items.length, 1);
	});

	it('needs a verdict, and a note when asking for changes', () => {
		assert.deepEqual(buildList({ path: 'p.md', verdict: null, notes: [note()] }), {
			ok: false,
			reason: 'Choose Approve or Request changes.'
		});
		assert.deepEqual(buildList({ path: 'p.md', verdict: 'changes', overall: '', notes: [] }), {
			ok: false,
			reason: 'Add a note saying what should change.'
		});
	});

	it('refuses more notes than Firstmate takes at once, and notes that are too long', () => {
		const many = Array.from({ length: 31 }, (_, i) =>
			note({ id: `n${i}`, from: i + 1, to: i + 1 })
		);
		const r = buildList({ path: 'p.md', verdict: 'changes', notes: many });
		assert.equal(r.ok, false);
		assert.match(r.reason, /up to 30 notes at once; this review has 31/);
		const long = buildList({
			path: 'p.md',
			verdict: 'changes',
			notes: [note({ text: 'x'.repeat(501) })]
		});
		assert.equal(long.ok, false);
		assert.match(long.reason, /under 500 characters/);
	});

	it('says what a note points at within Wheelhouse’s limit, and only lines without a quote', () => {
		const p = pointsFor(note({ quote: 'word '.repeat(100), from: 5, to: 9 }));
		assert.ok([...p].length <= MAX_POINTS);
		assert.match(p, /^“word word .*…” \(lines 5–9\)$/);
		assert.equal(pointsFor(note({ quote: '' })), 'line 7');
		assert.equal(pointsFor(note({ quote: '', from: null, to: null })), null);
	});

	it('shortens a long path from the left so the verdict always shows', () => {
		const s = subjectFor(`data/${'deep/'.repeat(60)}plan.md`, 'changes');
		assert.ok([...s].length <= MAX_SUBJECT);
		assert.match(s, /^….*plan\.md: Request changes$/);
	});
});

describe('notes and drafts', () => {
	it('labels lines', () => {
		assert.equal(lineLabel(3), 'line 3');
		assert.equal(lineLabel(3, 3), 'line 3');
		assert.equal(lineLabel(3, 6), 'lines 3–6');
		assert.equal(lineLabel(null), '');
		assert.equal(cut('a  b   c', 10), 'a b c');
		assert.equal(cut('abcdefghij', 5), 'abcd…');
	});

	it('reads back a stored draft, dropping anything malformed', () => {
		assert.deepEqual(readDraft(null, 'h1'), emptyDraft('h1'));
		assert.deepEqual(readDraft({ notes: 'no' }, 'h1'), emptyDraft('h1'));
		const d = readDraft(
			{
				hash: 'h0',
				verdict: 'maybe',
				overall: 3,
				notes: [note(), { id: 2, text: 'x' }, null, { id: 'q', text: 'kept', from: 'x' }]
			},
			'h1'
		);
		assert.equal(d.hash, 'h0');
		assert.equal(d.verdict, null);
		assert.equal(d.overall, '');
		assert.deepEqual(
			d.notes.map((n) => [n.id, n.from]),
			[
				['n1', 7],
				['q', null]
			]
		);
		assert.equal(draftKey('t', 'data/t/plan.md'), 'plan-review:v1:t:data/t/plan.md');
	});

	it('moves notes to where their quote is after the document changes', () => {
		const units = [
			{ from: 1, to: 1, text: 'Intro' },
			{ from: 9, to: 9, text: '1. Add the widget table.' },
			{ from: 10, to: 11, text: 'Something new' }
		];
		const [moved, gone, none] = reanchor(
			[note(), note({ id: 'g', quote: 'Not there any more' }), note({ id: 'z', quote: '' })],
			units
		);
		assert.deepEqual([moved.from, moved.to, moved.moved], [9, 9, false]);
		assert.deepEqual([gone.from, gone.moved], [7, true]);
		assert.equal(none.moved, undefined);
	});

	it('fingerprints text', () => {
		assert.equal(fingerprint('a'), fingerprint('a'));
		assert.notEqual(fingerprint('a'), fingerprint('b'));
		assert.match(fingerprint(''), /^[0-9a-f]{8}$/);
	});
});
