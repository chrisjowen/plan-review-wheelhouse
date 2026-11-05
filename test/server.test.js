import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import plugin, { MAX_BYTES, rank } from '../wheelhouse/server/index.js';

const TASK = { id: 'lumen-plan', title: 'Plan the share links', projectId: 'lumen' };

/** A provider context over made-up files: `home` and `task` map paths to text. */
function ctx({ task = TASK, home = {}, worktree = {}, changed = null } = {}) {
	const calls = [];
	const files = { home, task: worktree };
	return {
		calls,
		task,
		project: { id: 'lumen', name: 'Lumen', description: null, path: '/p' },
		settings: {},
		async listDir(rel, o) {
			calls.push(['listDir', rel, o.root]);
			const names = Object.keys(files[o.root] ?? {})
				.filter((p) => p.startsWith(`${rel}/`))
				.map((p) => p.slice(rel.length + 1))
				.filter((p) => !p.includes('/'));
			return names.length ? names.sort() : null;
		},
		async readFile(rel, o) {
			calls.push(['readFile', rel, o.root, o.maxBytes]);
			const text = files[o.root]?.[rel];
			return text === undefined ? null : Buffer.from(text).subarray(0, o.maxBytes).toString('utf8');
		},
		async changedFiles(id) {
			calls.push(['changedFiles', id]);
			return changed;
		}
	};
}

const provider = plugin.providers[0];

describe('the docs provider', () => {
	it('offers the task’s plan, spec and report first, then its other Markdown, briefs last', async () => {
		const c = ctx({
			home: {
				'data/lumen-plan/brief.md': '# Brief',
				'data/lumen-plan/report.md': '# Report',
				'data/lumen-plan/notes.md': '# Notes',
				'data/lumen-plan/plan.md': '# Plan\n\nDo it.',
				'data/lumen-plan/status.log': 'not markdown',
				'data/other-task/plan.md': '# Not ours'
			}
		});
		const r = await provider.fetch(c);
		assert.equal(r.available, true);
		assert.equal(r.value.schema, 'plan-review.v1');
		assert.deepEqual(r.value.task, { id: 'lumen-plan', title: 'Plan the share links' });
		assert.deepEqual(
			r.value.docs.map((d) => [d.path, d.name, d.source, d.truncated]),
			[
				['data/lumen-plan/plan.md', 'plan.md', 'home', false],
				['data/lumen-plan/report.md', 'report.md', 'home', false],
				['data/lumen-plan/notes.md', 'notes.md', 'home', false],
				['data/lumen-plan/brief.md', 'brief.md', 'home', false]
			]
		);
		assert.equal(r.value.docs[0].text, '# Plan\n\nDo it.');
		assert.ok(c.calls.every((x) => x[0] !== 'readFile' || x[3] === MAX_BYTES));
	});

	it('adds the Markdown files the task changed in its worktree', async () => {
		const r = await provider.fetch(
			ctx({
				changed: ['src/a.ts', 'docs/plans/share-links.md', 'README.md'],
				worktree: { 'docs/plans/share-links.md': '# Share links', 'README.md': '# Lumen' }
			})
		);
		assert.deepEqual(
			r.value.docs.map((d) => [d.path, d.name, d.source]),
			[
				['docs/plans/share-links.md', 'share-links.md', 'task'],
				['README.md', 'README.md', 'task']
			]
		);
	});

	it('says when Wheelhouse’s read limit cut a long document short', async () => {
		const long = `# Long\n\n${'é'.repeat(MAX_BYTES)}`;
		const r = await provider.fetch(ctx({ home: { 'data/lumen-plan/plan.md': long } }));
		const [d] = r.value.docs;
		assert.equal(d.truncated, true);
		assert.ok(!d.text.endsWith('�'));
	});

	it('is there with no documents yet, and not for something that is not a task', async () => {
		const r = await provider.fetch(ctx());
		assert.equal(r.available, true);
		assert.deepEqual(r.value.docs, []);
		assert.deepEqual(await provider.fetch(ctx({ task: null })), {
			available: false,
			reason: 'There is no task to review a plan for.'
		});
	});

	it('ranks names', () => {
		assert.deepEqual(rank(['z.md', 'launch-brief.md', 'SPEC.md', 'a.md', 'plan.md']), [
			'plan.md',
			'SPEC.md',
			'a.md',
			'z.md',
			'launch-brief.md'
		]);
	});
});
