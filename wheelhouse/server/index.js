/**
 * Plan review: a section on each task where the captain reads the task's plan
 * (or any Markdown file), comments on its lines or a passage, approves it or
 * asks for changes, and sends it all to Firstmate as one feedback list.
 *
 * Wheelhouse's side is small and read-only. The `docs` provider finds the
 * task's Markdown documents: the ones Firstmate keeps for it in the home
 * (`data/<task>/plan.md`, `spec.md`, `report.md` and the rest) and the
 * Markdown files the task changed in its worktree, and hands the section
 * their text. Sending is the section's own, through Wheelhouse's `feedback`
 * capability (host.sendFeedback), on the captain's click.
 */

export const MAX_BYTES = 64 * 1024;
const MAX_HOME_DOCS = 8;
const MAX_TASK_DOCS = 4;
const TIMEOUT_MS = 5_000;
/** The documents a plan review is usually about, first in this order. */
export const FIRST = ['plan.md', 'spec.md', 'report.md'];
/** Firstmate's own instructions to the worker: listed, but after the rest. */
const LAST = ['brief.md', 'launch-brief.md'];
const MARKDOWN = /\.(md|markdown)$/i;

/** The order the section offers documents in: plan, spec, report, the rest by name, briefs last. */
export function rank(names) {
	const weight = (n) => {
		const lower = n.toLowerCase();
		if (FIRST.includes(lower)) return FIRST.indexOf(lower);
		if (LAST.includes(lower)) return 100 + LAST.indexOf(lower);
		return 10;
	};
	return [...names].sort((a, b) => weight(a) - weight(b) || a.localeCompare(b));
}

/** A file's text, and whether Wheelhouse's read limit cut it short. */
async function read(ctx, rel, root) {
	const text = await ctx.readFile(rel, { root, maxBytes: MAX_BYTES });
	if (text === null) return null;
	const truncated = Buffer.byteLength(text, 'utf8') >= MAX_BYTES;
	// A cut can split a character; drop the partial one.
	return { text: truncated ? text.replace(/�$/, '') : text, truncated };
}

/** The task's Markdown documents in the Firstmate home: `data/<task>/*.md`. */
async function homeDocs(ctx, taskId) {
	const dir = `data/${taskId}`;
	const names = ((await ctx.listDir(dir, { root: 'home' })) ?? []).filter((n) => MARKDOWN.test(n));
	const docs = [];
	for (const name of rank(names).slice(0, MAX_HOME_DOCS)) {
		const path = `${dir}/${name}`;
		const r = await read(ctx, path, 'home');
		if (r) docs.push({ path, name, source: 'home', ...r });
	}
	return docs;
}

/** The task worktree's full path, for the tab to read a file there again through Wheelhouse's reader. */
async function worktree(ctx) {
	const r = await ctx.exec({
		argv: ['git', 'rev-parse', '--show-toplevel'],
		cwd: 'task',
		timeoutMs: 2_000,
		maxBytes: 4096
	});
	const top = r.ok ? r.stdout.trim() : '';
	return top.startsWith('/') ? top : null;
}

/** Markdown files the task changed in its worktree, such as a plan the worker committed. */
async function taskDocs(ctx, taskId) {
	const changed = ((await ctx.changedFiles(taskId)) ?? []).filter((f) => MARKDOWN.test(f));
	if (!changed.length) return [];
	const top = await worktree(ctx);
	const docs = [];
	for (const path of changed.slice(0, MAX_TASK_DOCS)) {
		const r = await read(ctx, path, 'task');
		const file = top ? `${top}/${path}` : null;
		if (r) docs.push({ path, name: path.split('/').pop(), source: 'task', file, ...r });
	}
	return docs;
}

async function fetch(ctx) {
	const task = ctx.task;
	if (!task) return { available: false, reason: 'There is no task to review a plan for.' };
	const docs = [...(await homeDocs(ctx, task.id)), ...(await taskDocs(ctx, task.id))];
	return {
		available: true,
		value: {
			schema: 'plan-review.v1',
			task: { id: task.id, title: task.title },
			docs
		},
		source: docs.length ? 'the task’s documents' : 'the task',
		observedAt: new Date().toISOString()
	};
}

export function createPlugin() {
	return {
		providers: [{ id: 'docs', scope: 'task', ttlMs: 15_000, timeoutMs: TIMEOUT_MS, fetch }],
		contributions: [
			{
				slot: 'task.section',
				id: 'plan',
				title: 'Plan review',
				provider: 'docs',
				render: { element: 'plan-review-section' }
			}
		]
	};
}

export default createPlugin();
