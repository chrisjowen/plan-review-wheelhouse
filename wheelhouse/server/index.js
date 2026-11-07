/**
 * Plan review: a page of its own in Wheelhouse's menu where the captain picks
 * a task's plan (or any Markdown file), reads it, comments on its lines or a
 * passage, approves it or asks for changes, and sends it all to Firstmate as
 * one feedback list.
 *
 * Wheelhouse's side is small and read-only. The `plans` provider lists, for
 * each task, the Markdown documents a plan review is about: the ones
 * Firstmate keeps for it in the home (`data/<task>/plan.md`, `spec.md`,
 * `report.md` and the rest) and the Markdown files the task changed in its
 * worktree. It hands the page their paths, not their text: the page reads the
 * one the captain opens through Wheelhouse's document reader, whole. Sending
 * is the page's own, through Wheelhouse's `feedback` capability
 * (host.sendFeedback), on the captain's click.
 */

const MAX_TASKS = 40;
const MAX_HOME_DOCS = 8;
const MAX_TASK_DOCS = 4;
const TIMEOUT_MS = 8_000;
/** The documents a plan review is usually about, first in this order. */
export const FIRST = ['plan.md', 'spec.md', 'report.md'];
/** Firstmate's own instructions to the worker: listed, but after the rest. */
const LAST = ['brief.md', 'launch-brief.md'];
const MARKDOWN = /\.(md|markdown)$/i;
/** Tasks whose plan no longer needs reviewing. */
const OVER = new Set(['landed']);
/** Tasks with no worktree worth asking git about. */
const NO_WORKTREE = new Set(['landed', 'done', 'queued']);

/** The order the page offers documents in: plan, spec, report, the rest by name, briefs last. */
export function rank(names) {
	const weight = (n) => {
		const lower = n.toLowerCase();
		if (FIRST.includes(lower)) return FIRST.indexOf(lower);
		if (LAST.includes(lower)) return 100 + LAST.indexOf(lower);
		return 10;
	};
	return [...names].sort((a, b) => weight(a) - weight(b) || a.localeCompare(b));
}

/** The task's Markdown documents in the Firstmate home: `data/<task>/*.md`. */
async function homeDocs(ctx, taskId) {
	const dir = `data/${taskId}`;
	const names = ((await ctx.listDir(dir, { root: 'home' }).catch(() => null)) ?? []).filter((n) =>
		MARKDOWN.test(n)
	);
	return rank(names)
		.slice(0, MAX_HOME_DOCS)
		.map((name) => ({ path: `${dir}/${name}`, name, source: 'home', file: null }));
}

/**
 * Each branch's worktree in a project, from `git worktree list`: branch → full
 * path. Empty when Wheelhouse cannot run git there.
 */
export async function worktrees(ctx, projectId) {
	try {
		const r = await ctx.exec({
			argv: ['git', 'worktree', 'list', '--porcelain'],
			cwd: 'project',
			project: projectId,
			timeoutMs: 2_000,
			maxBytes: 256 * 1024
		});
		return r?.ok ? parseWorktrees(String(r.stdout)) : new Map();
	} catch {
		return new Map();
	}
}

/** `git worktree list --porcelain` as branch → path. */
export function parseWorktrees(out) {
	const map = new Map();
	for (const block of out.split(/\n\s*\n/)) {
		const path = block.match(/^worktree (.+)$/m)?.[1];
		const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
		if (path?.startsWith('/') && branch) map.set(branch, path);
	}
	return map;
}

/**
 * Markdown files the task changed in its worktree, such as a plan the worker
 * committed, each with its full path for the page to read it by. Only those
 * whose worktree git names: without it, the page has no way to read them.
 */
async function taskDocs(ctx, task, trees) {
	if (NO_WORKTREE.has(task.status) || !task.branch) return [];
	const changed = ((await ctx.changedFiles(task.id).catch(() => null)) ?? []).filter((f) =>
		MARKDOWN.test(f)
	);
	if (!changed.length) return [];
	const top = (await trees(task.projectId)).get(task.branch);
	if (!top) return [];
	return changed.slice(0, MAX_TASK_DOCS).map((path) => ({
		path,
		name: path.split('/').pop(),
		source: 'task',
		file: `${top}/${path}`
	}));
}

/** Whether the task is waiting on the captain. */
const waiting = (t) => t.status === 'needs-decision' || t.status === 'needs-review';

async function fetch(ctx) {
	const tasks = (ctx.tasks ?? []).filter((t) => !OVER.has(t.status)).slice(0, MAX_TASKS);
	// One `git worktree list` per project, shared by its tasks.
	const lists = new Map();
	const trees = (projectId) => {
		if (!lists.has(projectId)) lists.set(projectId, worktrees(ctx, projectId));
		return lists.get(projectId);
	};
	const found = await Promise.all(
		tasks.map(async (t) => {
			const docs = [...(await homeDocs(ctx, t.id)), ...(await taskDocs(ctx, t, trees))];
			return docs.length
				? {
						id: t.id,
						title: t.shortTitle || t.title,
						project: t.projectId,
						status: t.statusLabel ?? null,
						waiting: waiting(t),
						docs
					}
				: null;
		})
	);
	const list = found.filter(Boolean);
	// Plans waiting on the captain first; otherwise as Wheelhouse lists the tasks.
	list.sort((a, b) => Number(b.waiting) - Number(a.waiting));
	return {
		available: true,
		value: { schema: 'plan-review.v2', tasks: list },
		source: list.length ? 'the tasks’ documents' : 'the tasks',
		observedAt: new Date().toISOString()
	};
}

export function createPlugin() {
	return {
		providers: [{ id: 'plans', scope: 'fleet', ttlMs: 15_000, timeoutMs: TIMEOUT_MS, fetch }],
		contributions: [
			{
				slot: 'nav.page',
				id: 'review',
				title: 'Plan review',
				provider: 'plans',
				render: { element: 'plan-review-page' }
			}
		]
	};
}

export default createPlugin();
