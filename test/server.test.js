import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import plugin, { parseWorktrees, rank } from '../wheelhouse/server/index.js';

/** A task as Wheelhouse hands a fleet provider one (the fields the provider reads). */
const task = (id, more = {}) => ({
	id,
	title: `Lumen: ${id}`,
	shortTitle: id,
	projectId: 'lumen',
	status: 'working',
	statusLabel: 'Working',
	branch: `fm/${id}`,
	...more
});

const WORKTREES = [
	'worktree /p/lumen',
	'HEAD 1111111',
	'branch refs/heads/main',
	'',
	'worktree /w/lumen-plan',
	'HEAD 2222222',
	'branch refs/heads/fm/lumen-plan',
	'',
	'worktree /w/detached',
	'HEAD 3333333',
	'detached',
	''
].join('\n');

/**
 * A fleet provider context over made-up files: `home` maps paths in the
 * Firstmate home to text, `changed` task ids to the files they changed.
 */
function ctx({
	tasks = [task('lumen-plan')],
	home = {},
	changed = {},
	git = { ok: true, stdout: WORKTREES }
} = {}) {
	const calls = [];
	return {
		calls,
		task: null,
		project: null,
		tasks,
		projects: [{ id: 'lumen', name: 'Lumen', description: null, path: '/p/lumen' }],
		settings: {},
		async listDir(rel, o) {
			calls.push(['listDir', rel, o.root]);
			const names = Object.keys(home)
				.filter((p) => p.startsWith(`${rel}/`))
				.map((p) => p.slice(rel.length + 1))
				.filter((p) => !p.includes('/'));
			return names.length ? names.sort() : null;
		},
		async readFile(rel, o) {
			calls.push(['readFile', rel, o.root]);
			return home[rel] ?? null;
		},
		async changedFiles(id) {
			calls.push(['changedFiles', id]);
			return changed[id] ?? null;
		},
		async exec(c) {
			calls.push(['exec', c.argv, c.cwd, c.project]);
			return typeof git === 'function' ? git(c) : git;
		}
	};
}

const provider = plugin.providers[0];

describe('the plans provider', () => {
	it('offers each task’s plan, spec and report first, then its other Markdown, briefs last', async () => {
		const c = ctx({
			home: {
				'data/lumen-plan/brief.md': '# Brief',
				'data/lumen-plan/report.md': '# Report',
				'data/lumen-plan/notes.md': '# Notes',
				'data/lumen-plan/plan.md': '# Plan\n\nDo it.',
				'data/lumen-plan/status.log': 'not markdown',
				'data/other-task/plan.md': '# Not one of the tasks'
			}
		});
		const r = await provider.fetch(c);
		assert.equal(r.available, true);
		assert.equal(r.value.schema, 'plan-review.v2');
		assert.equal(r.value.tasks.length, 1);
		const [t] = r.value.tasks;
		assert.deepEqual(
			{ ...t, docs: undefined },
			{
				id: 'lumen-plan',
				title: 'lumen-plan',
				project: 'lumen',
				status: 'Working',
				waiting: false,
				docs: undefined
			}
		);
		assert.deepEqual(
			t.docs.map((d) => [d.path, d.name, d.source, d.file]),
			[
				['data/lumen-plan/plan.md', 'plan.md', 'home', null],
				['data/lumen-plan/report.md', 'report.md', 'home', null],
				['data/lumen-plan/notes.md', 'notes.md', 'home', null],
				['data/lumen-plan/brief.md', 'brief.md', 'home', null]
			]
		);
		// It hands the page paths, not text: the page reads the one it opens, whole.
		assert.ok(c.calls.every((x) => x[0] !== 'readFile'));
		assert.ok(!('text' in t.docs[0]));
	});

	it('adds the Markdown files a task changed in its worktree, with their full paths', async () => {
		const c = ctx({
			changed: { 'lumen-plan': ['src/a.ts', 'docs/plans/share-links.md', 'README.md'] }
		});
		const r = await provider.fetch(c);
		assert.deepEqual(
			r.value.tasks[0].docs.map((d) => [d.path, d.name, d.source, d.file]),
			[
				[
					'docs/plans/share-links.md',
					'share-links.md',
					'task',
					'/w/lumen-plan/docs/plans/share-links.md'
				],
				['README.md', 'README.md', 'task', '/w/lumen-plan/README.md']
			]
		);
		assert.deepEqual(
			c.calls.find((x) => x[0] === 'exec'),
			['exec', ['git', 'worktree', 'list', '--porcelain'], 'project', 'lumen']
		);
	});

	it('asks git once per project, and skips worktree files it cannot find the way to', async () => {
		const tasks = [
			task('lumen-plan'),
			task('lumen-two', { branch: 'fm/lumen-two' }),
			task('lumen-done', { status: 'done' })
		];
		const changed = {
			'lumen-plan': ['plan.md'],
			'lumen-two': ['notes.md'],
			'lumen-done': ['old.md']
		};
		const c = ctx({ tasks, changed, home: { 'data/lumen-two/plan.md': '# Two' } });
		const r = await provider.fetch(c);
		assert.equal(c.calls.filter((x) => x[0] === 'exec').length, 1);
		// lumen-two's branch has no worktree, so only its home plan is offered; a done task is not asked about.
		assert.deepEqual(
			r.value.tasks.map((t) => [t.id, t.docs.map((d) => d.path)]),
			[
				['lumen-plan', ['plan.md']],
				['lumen-two', ['data/lumen-two/plan.md']]
			]
		);
		assert.ok(!c.calls.some((x) => x[0] === 'changedFiles' && x[1] === 'lumen-done'));
		// When Wheelhouse cannot run git at all, the home plans still show.
		for (const git of [
			{ ok: false, reason: 'no git', stdout: '', stderr: '' },
			() => {
				throw new Error('timed out');
			}
		]) {
			const r2 = await provider.fetch(
				ctx({ tasks, changed, git, home: { 'data/lumen-two/plan.md': '# Two' } })
			);
			assert.deepEqual(
				r2.value.tasks.map((t) => [t.id, t.docs.map((d) => d.path)]),
				[['lumen-two', ['data/lumen-two/plan.md']]]
			);
		}
	});

	it('lists the tasks waiting on the captain first, and leaves out landed ones and those with nothing to read', async () => {
		const tasks = [
			task('a-working'),
			task('b-landed', { status: 'landed' }),
			task('c-decide', { status: 'needs-decision', statusLabel: 'Needs your decision' }),
			task('d-nothing')
		];
		const home = {
			'data/a-working/plan.md': '#',
			'data/b-landed/plan.md': '#',
			'data/c-decide/plan.md': '#'
		};
		const r = await provider.fetch(ctx({ tasks, home }));
		assert.deepEqual(
			r.value.tasks.map((t) => [t.id, t.waiting]),
			[
				['c-decide', true],
				['a-working', false]
			]
		);
	});

	it('is there with no plans yet', async () => {
		const r = await provider.fetch(ctx({ tasks: [] }));
		assert.equal(r.available, true);
		assert.deepEqual(r.value.tasks, []);
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

	it('reads git’s worktree list', () => {
		assert.deepEqual(
			[...parseWorktrees(WORKTREES)],
			[
				['main', '/p/lumen'],
				['fm/lumen-plan', '/w/lumen-plan']
			]
		);
		assert.deepEqual([...parseWorktrees('')], []);
	});
});
