/**
 * The plan review page as a custom element, `plan-review-page`, on the
 * plugin's own page in Wheelhouse's menu (a `nav.page`). Wheelhouse sets
 * `host` (whose `sendFeedback` sends the review), `entry` and `data` (the
 * tasks with Markdown documents to review, from the `plans` provider).
 *
 * The captain picks a task and one of its documents (or opens another
 * Markdown file by path), reads it as Wheelhouse's reader draws it, and
 * comments: the + beside a line, or a selected passage. Beside the document,
 * the review reads as a chat thread: each note a bubble, then Approve or
 * Request changes, an optional note on the whole plan, and Send: one feedback
 * list to Firstmate about that task, once the document is read again and
 * found to be the text the notes were written on. The draft is kept in the
 * browser per task and file until it is sent.
 *
 * A link can open a task's plan directly: `?task=<id>&doc=<path>`.
 *
 * The element draws in light DOM so text in the document can be selected
 * and read back, and so Wheelhouse's own chat classes (`bubble`,
 * `bubble-captain`, `reply-quote`, `chat-grid`) style the thread as they
 * style Firstmate's chat. Its own styles are all scoped to its tag.
 */

import { ago, h, plural } from './dom.js';
import { parse, partElements, renderBlock } from './doc.js';
import {
	buildList,
	cut,
	draftKey,
	emptyDraft,
	fingerprint,
	inOrder,
	lineLabel,
	MAX_QUOTE,
	MAX_TEXT,
	noteId,
	readDraft,
	reanchor,
	sentKey,
	VERDICTS
} from './notes.js';
import { STYLE } from './styles.js';

export { buildList } from './notes.js';

/** How often the open document is read again, so a change on disk shows. */
const REREAD_MS = 15_000;

const store = {
	get(k) {
		try {
			return JSON.parse(localStorage.getItem(k) ?? 'null');
		} catch {
			return null;
		}
	},
	set(k, v) {
		try {
			if (v === null) localStorage.removeItem(k);
			else localStorage.setItem(k, JSON.stringify(v));
		} catch {
			// a private window: the page still works, it just won't remember
		}
	}
};

const TASK_KEY = 'plan-review:v1:task';
const lastKey = (task) => `plan-review:v1:last:${task}`;
const extraKey = (task) => `plan-review:v1:extra:${task}`;

const tidy = (s) =>
	String(s ?? '')
		.replace(/\s+/g, ' ')
		.trim();

export class PlanReviewPage extends HTMLElement {
	constructor() {
		super();
		/** @type {any} */
		this._data = null;
		this.host = null;
		this.entry = null;
		this.taskId = null;
		/** A task a link named that has no documents on offer, so a file can still be opened for it. */
		this.adhoc = null;
		/** What a link asked to open: `?task=…&doc=…`, used once. */
		this.want = null;
		/** Files the captain opened by path, for the task shown: path → { path, name, source, file } */
		this.extra = new Map();
		/** Documents as last read through Wheelhouse's reader: read path → { text } or { error } */
		this.texts = new Map();
		this.loading = new Set();
		this.path = null;
		this.draft = null;
		this.shown = null;
		this.tasksShown = null;
		this.units = [];
		this.composer = null;
		this.pending = null;
		this.changed = false;
		this.stale = null;
		this.otherOpen = false;
		this.sending = false;
		this.error = null;
		this.notice = null;
		this.onSelect = () => this.selectionChanged();
		this.onFocus = () => void this.reread();
	}

	set data(v) {
		this._data = v;
		if (this.isConnected) {
			this.sync();
			void this.reread();
		}
	}
	get data() {
		return this._data;
	}

	connectedCallback() {
		const style = document.createElement('style');
		style.textContent = STYLE;
		this.taskEl = h('div', { class: 'task' });
		this.picker = h('div', { class: 'picker' });
		this.other = h('div', { class: 'other', hidden: true });
		this.docEl = h('div', { class: 'doc' });
		this.headerEl = h('header');
		this.bannerEl = h('div');
		this.sheet = h(
			'article',
			{ class: 'sheet', 'aria-label': 'The document' },
			h('div', { class: 'sheet-inner' }, this.headerEl, this.bannerEl, this.docEl)
		);
		this.thread = h('aside', { class: 'thread', 'aria-label': 'Your review' });
		this.floater = h(
			'button',
			{
				type: 'button',
				class: 'pill on-selection',
				hidden: true,
				onmousedown: (e) => e.preventDefault(),
				onclick: () => this.commentOnSelection()
			},
			'Comment on this'
		);
		this.root = h(
			'div',
			{ class: 'pr' },
			h('div', { class: 'top' }, this.taskEl, this.picker),
			this.other,
			h('div', { class: 'layout' }, this.sheet, this.thread),
			(this.dock = h('div', { class: 'dock', role: 'region', 'aria-label': 'Send your review' })),
			this.floater
		);
		this.replaceChildren(style, this.root);
		this.docEl.addEventListener('mouseup', () => setTimeout(this.onSelect, 0));
		this.docEl.addEventListener('keyup', this.onSelect);
		document.addEventListener('selectionchange', this.onSelect);
		window.addEventListener('focus', this.onFocus);
		this.timer = setInterval(() => {
			if (document.visibilityState !== 'hidden') void this.reread();
		}, REREAD_MS);
		this.timer?.unref?.();
		const q = new URLSearchParams(window.location.search);
		this.want = q.get('task') ? { task: q.get('task'), doc: q.get('doc') } : null;
		// Nothing drawn yet, not even the empty state.
		this.shown = undefined;
		this.tasksShown = undefined;
		// The bar with Send steps aside while the review itself is on screen.
		if (typeof IntersectionObserver === 'function') {
			this.seen = new IntersectionObserver(([e]) =>
				this.dock.classList.toggle('aside', e.isIntersecting)
			);
			this.seen.observe(this.thread);
		}
		this.sync();
	}

	disconnectedCallback() {
		document.removeEventListener('selectionchange', this.onSelect);
		window.removeEventListener('focus', this.onFocus);
		clearInterval(this.timer);
		this.seen?.disconnect();
	}

	/** The tasks with documents to review, and one a link named. */
	get tasks() {
		const own = Array.isArray(this._data?.tasks) ? this._data.tasks : [];
		return this.adhoc && !own.some((t) => t.id === this.adhoc.id) ? [...own, this.adhoc] : own;
	}

	get task() {
		return this.tasks.find((t) => t.id === this.taskId) ?? null;
	}

	/** Every document on offer for the task shown: its own, then any opened by path. */
	get docs() {
		const own = Array.isArray(this.task?.docs) ? this.task.docs : [];
		const seen = new Set(own.map((d) => d.path));
		return [...own, ...[...this.extra.values()].filter((d) => !seen.has(d.path))];
	}

	/** The document shown, with its text once Wheelhouse's reader has read it. */
	get doc() {
		const d = this.docs.find((x) => x.path === this.path) ?? null;
		if (!d) return null;
		const t = this.texts.get(readPath(d));
		return { ...d, text: t?.text ?? null, error: t?.error ?? null };
	}

	/** The task to show: the one a link named, else the last one, else the first. */
	pickTask() {
		const tasks = this.tasks;
		const want = this.want;
		if (want && this._data) {
			this.want = null;
			if (!tasks.some((t) => t.id === want.task))
				this.adhoc = { id: want.task, title: want.task, status: null, docs: [] };
			this.showTask(want.task);
			const doc = want.doc;
			if (doc && this.docs.some((d) => d.path === doc)) this.path = doc;
			else if (doc) void this.openPath(doc);
			return;
		}
		if (this.task) return;
		const last = store.get(TASK_KEY);
		const next = tasks.find((t) => t.id === last) ?? tasks[0] ?? null;
		if (next) this.showTask(next.id);
		else this.taskId = null;
	}

	/** Bring everything in line with the data: the task, its documents, the one shown, its draft. */
	sync() {
		this.pickTask();
		const docs = this.docs;
		const task = this.taskId;
		if (!this.path || !docs.some((d) => d.path === this.path)) {
			const last = task ? store.get(lastKey(task)) : null;
			this.path = docs.find((d) => d.path === last)?.path ?? docs[0]?.path ?? null;
		}
		this.renderTask();
		this.renderPicker();
		const doc = this.doc;
		if (doc && doc.text === null && !doc.error) void this.load(doc);
		const hash = doc?.text != null ? fingerprint(doc.text) : null;
		const key = `${task}\n${doc?.path}\n${hash}\n${doc?.error ?? ''}`;
		if (key !== this.shown) {
			this.shown = key;
			this.loadDraft(hash ? doc : null, hash);
			this.renderDocument();
		}
		this.renderThread();
	}

	showTask(id) {
		if (id === this.taskId) return;
		this.taskId = id;
		this.path = null;
		this.extra = new Map();
		this.composer = null;
		this.changed = false;
		this.notice = null;
		this.error = null;
		this.stale = null;
		this.otherOpen = false;
		this.other.replaceChildren();
		store.set(TASK_KEY, id);
		void this.reopenExtra();
	}

	chooseTask(id) {
		this.showTask(id);
		this.sync();
	}

	choose(path) {
		this.path = path;
		this.composer = null;
		this.changed = false;
		this.notice = null;
		this.error = null;
		this.stale = null;
		if (this.taskId) store.set(lastKey(this.taskId), path);
		this.sync();
	}

	// ---- reading documents ----

	/** A document's text, through Wheelhouse's reader, the first time it is shown. */
	async load(d) {
		const p = readPath(d);
		if (this.loading.has(p)) return;
		this.loading.add(p);
		const r = await readThroughWheelhouse(p);
		this.loading.delete(p);
		this.texts.set(p, r.ok ? { text: r.text } : { error: r.error });
		if (this.isConnected) this.sync();
	}

	/**
	 * Read the document shown again; if it changed on disk, show the new text.
	 * Its draft keeps the text it was written on (see checkChanged).
	 */
	async reread() {
		const d = this.doc;
		if (!d || d.text === null || this.sending) return;
		const p = readPath(d);
		if (this.loading.has(p)) return;
		this.loading.add(p);
		const r = await readThroughWheelhouse(p);
		this.loading.delete(p);
		if (!r.ok || this.texts.get(p)?.text === r.text) return;
		this.texts.set(p, { text: r.text });
		if (this.isConnected) this.sync();
	}

	// ---- the draft ----

	loadDraft(doc, hash) {
		this.changed = false;
		if (!doc || !this.taskId) {
			this.draft = null;
			return;
		}
		this.draft = readDraft(store.get(draftKey(this.taskId, doc.path)), hash);
	}

	save() {
		const doc = this.doc;
		if (!doc || !this.taskId || !this.draft) return;
		const d = this.draft;
		store.set(draftKey(this.taskId, doc.path), blank(d) ? null : d);
	}

	/**
	 * After the document is drawn: a draft keeps the fingerprint of the text it
	 * was written on, so a document that changed under it is only flagged, until
	 * the captain moves the notes onto the new text.
	 */
	checkChanged(hash) {
		const d = this.draft;
		if (!d) return;
		if (d.hash && d.hash !== hash && !blank(d)) {
			this.changed = true;
			return;
		}
		d.hash = hash;
		this.save();
	}

	/** Move the notes onto the text shown now, to where their quotes are, and take it as the text reviewed. */
	moveNotes() {
		const d = this.draft;
		const doc = this.doc;
		if (!d || doc?.text == null) return;
		d.notes = reanchor(d.notes, this.units);
		d.hash = fingerprint(doc.text);
		this.changed = false;
		this.error = null;
		this.save();
		this.renderBanner();
		this.renderNotes();
		this.renderThread();
	}

	// ---- the task and document pickers ----

	renderTask() {
		const tasks = this.tasks;
		const shown = JSON.stringify([
			this.taskId,
			tasks.map((t) => [t.id, t.title, t.status, t.waiting])
		]);
		if (shown === this.tasksShown) return;
		this.tasksShown = shown;
		if (!tasks.length) {
			this.taskEl.replaceChildren();
			return;
		}
		const select = h(
			'select',
			{
				name: 'task',
				'aria-label': 'Task',
				onchange: (e) => this.chooseTask(e.target.value)
			},
			tasks.map((t) =>
				h(
					'option',
					{ value: t.id, selected: t.id === this.taskId },
					t.waiting ? `${t.title} · waiting on you` : t.title
				)
			)
		);
		const t = this.task;
		this.taskEl.replaceChildren(
			h('label', { class: 'label' }, 'Task', select),
			t ? h('p', { class: 'status' }, [t.id, t.status].filter(Boolean).join(' · ')) : null
		);
	}

	renderPicker() {
		if (!this.taskId) {
			this.picker.replaceChildren();
			this.other.hidden = true;
			return;
		}
		const docs = this.docs;
		const chips = docs.map((d) => {
			const draft = store.get(draftKey(this.taskId, d.path));
			const noted = Array.isArray(draft?.notes) && draft.notes.length > 0;
			return h(
				'button',
				{
					type: 'button',
					class: 'chip',
					'aria-pressed': String(d.path === this.path),
					title: d.path,
					onclick: () => this.choose(d.path)
				},
				d.name,
				noted ? h('span', { class: 'dot', title: 'Has a draft' }) : null
			);
		});
		this.picker.replaceChildren(
			...chips,
			h(
				'button',
				{
					type: 'button',
					class: 'chip',
					'aria-expanded': String(this.otherOpen),
					onclick: () => {
						this.otherOpen = !this.otherOpen;
						this.renderOther();
						if (this.otherOpen) this.other.querySelector('input')?.focus();
					}
				},
				docs.length ? 'Another file…' : 'Open a Markdown file…'
			)
		);
		this.renderOther();
	}

	renderOther() {
		this.other.hidden = !this.otherOpen;
		if (!this.otherOpen) return;
		if (this.other.childElementCount) return;
		const input = h('input', {
			type: 'text',
			name: 'path',
			placeholder: 'data/<task>/plan.md, or a full path',
			'aria-label': 'Path to a Markdown file',
			spellcheck: 'false',
			autocomplete: 'off'
		});
		const why = h('p', { class: 'hint' });
		const open = async () => {
			const p = input.value.trim();
			if (!p) return;
			why.textContent = 'Opening…';
			const r = await this.openPath(p);
			why.textContent = r.ok
				? ''
				: r.error ||
					'Wheelhouse shows Markdown files from the Firstmate home and the projects and worktrees of live tasks.';
			if (r.ok) {
				input.value = '';
				this.otherOpen = false;
				this.renderOther();
			}
		};
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				void open();
			}
		});
		this.other.replaceChildren(
			input,
			h('button', { type: 'button', class: 'pill', onclick: () => void open() }, 'Open'),
			h(
				'p',
				{ class: 'hint' },
				'A path relative to the Firstmate home, or a full path inside a live task’s project or worktree. Read through Wheelhouse’s document reader.'
			),
			why
		);
	}

	/** A Markdown file by path, read through Wheelhouse's reader (/api/files), then shown. */
	async openPath(p) {
		if (!isMarkdown(p)) return { ok: false, error: 'Plan review opens Markdown files (.md).' };
		const task = this.taskId;
		const r = await readThroughWheelhouse(p);
		if (!r.ok) return r;
		if (task !== this.taskId) return { ok: false, error: 'The task changed while it opened.' };
		this.texts.set(p, { text: r.text });
		this.extra.set(p, byPath(p));
		this.rememberExtra();
		this.choose(p);
		return { ok: true };
	}

	rememberExtra() {
		if (this.taskId) store.set(extraKey(this.taskId), [...this.extra.keys()]);
	}

	/** The files the captain opened by path for this task before, offered again. */
	async reopenExtra() {
		const task = this.taskId;
		const paths = task ? store.get(extraKey(task)) : null;
		if (!Array.isArray(paths)) return;
		for (const p of paths.filter(isMarkdown).slice(0, 10)) {
			const r = await readThroughWheelhouse(p);
			if (!r.ok || task !== this.taskId) continue;
			this.texts.set(p, { text: r.text });
			this.extra.set(p, byPath(p));
		}
		if (this.extra.size && this.isConnected && task === this.taskId) this.sync();
	}

	/** Show the document as it now is on disk, and move the notes onto it. */
	useNewText() {
		const s = this.stale;
		this.stale = null;
		if (s) this.texts.set(s.read, { text: s.text });
		this.sync();
		this.moveNotes();
	}

	// ---- the document ----

	renderDocument() {
		const doc = this.doc;
		this.units = [];
		this.hideFloater();
		if (!doc || doc.text === null) {
			const reading = doc && !doc.error;
			this.headerEl.replaceChildren(
				h('p', { class: 'kicker' }, 'Document'),
				h(
					'h1',
					{ class: 'title' },
					reading
						? `Reading ${doc.name}…`
						: doc
							? `Could not read ${doc.name}`
							: this.task
								? 'No plan here yet'
								: 'No plans to review'
				)
			);
			this.bannerEl.replaceChildren();
			const task = this.taskId ?? '<task>';
			this.docEl.replaceChildren(
				reading
					? h('p', { class: 'empty' }, 'Through Wheelhouse’s document reader.')
					: doc
						? h('p', { class: 'empty' }, doc.error)
						: h(
								'p',
								{ class: 'empty' },
								this.task
									? `When Firstmate writes this task’s plan (data/${task}/plan.md, spec.md or report.md), it shows here to read and comment on. You can also open any Markdown file with “Open a Markdown file…” above.`
									: 'When Firstmate writes a task’s plan (data/<task>/plan.md, spec.md or report.md), or a task changes a Markdown file in its worktree, the task shows here to read and comment on.'
							)
			);
			return;
		}
		const { blocks, links } = parse(doc.text);
		const lines = doc.text.replace(/\n$/, '').split('\n').length;
		// A document that opens with its title shows it once, as written (and open to comment).
		const first = blocks.find((b) => b.kind !== 'front');
		const titled = first?.kind === 'heading' && first.token.depth === 1;
		const header = [
			h('p', { class: 'kicker' }, 'Document'),
			titled ? null : h('h1', { class: 'title' }, doc.name),
			h(
				'p',
				{ class: 'source' },
				doc.source === 'task' ? `${doc.path} (in the worktree)` : doc.path
			),
			h(
				'p',
				{ class: 'how' },
				`${plural(lines, 'line')}. Hover over a line and click + to comment on it, or select a passage.`
			)
		];
		this.headerEl.replaceChildren(...header.filter(Boolean));
		const frag = document.createDocumentFragment();
		for (const b of blocks) frag.append(this.blockEl(b, links, doc));
		this.docEl.replaceChildren(frag);
		if (!blocks.length) {
			this.docEl.replaceChildren(h('p', { class: 'empty' }, 'This file is empty.'));
		}
		this.checkChanged(fingerprint(doc.text));
		this.renderBanner();
		this.renderNotes();
	}

	/** One block: a part with its own + (or, for a list, one per item). */
	blockEl(b, links, doc) {
		const t = renderBlock(b, links, doc);
		const content = h('div', { class: 'c' });
		content.append(t.content);
		if (b.kind === 'list') {
			const items = partElements(b, content);
			items.forEach((li, i) => {
				const p = b.parts[i];
				if (!p) return;
				this.unit(li, p.from, p.to);
				li.prepend(this.gutter(p.from, p.to));
				li.append(h('div', { class: 'slot' }));
			});
			return h('div', { class: 'u-list', 'data-from': b.from, 'data-to': b.to }, content);
		}
		if (b.kind === 'table') {
			partElements(b, content).forEach((tr, i) => {
				const p = b.parts[i];
				if (!p) return;
				tr.dataset.from = String(p.from);
				tr.dataset.to = String(p.to);
			});
		}
		const el = h(
			'div',
			{ class: b.kind === 'front' ? 'u front' : 'u' },
			this.gutter(b.from, b.to),
			content,
			h('div', { class: 'slot' })
		);
		this.unit(el, b.from, b.to);
		return el;
	}

	unit(el, from, to) {
		el.classList.add('u');
		el.dataset.from = String(from);
		el.dataset.to = String(to);
		this.units.push({
			el,
			from,
			to,
			get text() {
				return unitText(el);
			}
		});
	}

	gutter(from, to) {
		return h(
			'div',
			{ class: 'gutter' },
			h('span', { class: 'ln', 'aria-hidden': 'true' }, String(from)),
			h(
				'button',
				{
					type: 'button',
					class: 'add',
					title: `Comment on ${lineLabel(from, to)}`,
					'aria-label': `Comment on ${lineLabel(from, to)}`,
					onclick: (e) => {
						const u = e.currentTarget.closest('.u');
						this.openComposer({
							from,
							to,
							quote: opening(unitText(u))
						});
					}
				},
				'+'
			)
		);
	}

	renderBanner() {
		this.bannerEl.replaceChildren(
			...(this.changed
				? [
						h(
							'div',
							{ class: 'banner', role: 'status' },
							h(
								'span',
								null,
								'This document changed since you started your review. Your notes still point at the text you wrote them on; nothing is sent until you move them onto this text.'
							),
							h(
								'button',
								{ type: 'button', class: 'pill', onclick: () => this.moveNotes() },
								'Move notes onto this text'
							)
						)
					]
				: [])
		);
	}

	/** The unit a note shows under: the last one its lines touch. */
	unitFor(note) {
		const touching = this.units.filter(
			(u) => note.from !== null && u.from <= (note.to ?? note.from) && u.to >= note.from
		);
		return touching.at(-1) ?? null;
	}

	renderNotes() {
		for (const u of this.units) {
			u.el.classList.remove('noted');
			slotOf(u.el)?.replaceChildren();
		}
		const notes = this.draft ? inOrder(this.draft.notes) : [];
		for (const n of notes) {
			const u = this.unitFor(n);
			if (!u) continue;
			u.el.classList.add('noted');
			if (this.composer?.id === n.id) continue;
			slotOf(u.el).append(this.noteEl(n));
		}
		if (this.composer) {
			const u = this.unitFor(this.composer) ?? this.units.at(-1);
			if (u) {
				const box = this.composerEl(this.composer);
				slotOf(u.el).append(box);
				box.querySelector('textarea')?.focus();
			}
		}
	}

	/** A note under its lines, as the captain's chat bubble. */
	noteEl(n) {
		return h(
			'div',
			{ class: 'note', 'data-note': n.id },
			h(
				'div',
				{ class: 'meta' },
				h('span', null, `You · ${lineLabel(n.from, n.to)}`),
				n.moved ? h('span', { class: 'moved' }, 'text changed') : null
			),
			h(
				'div',
				{ class: 'bubble bubble-captain' },
				n.quote ? quoteEl(lineLabel(n.from, n.to), n.quote) : null,
				h('p', { class: 'text' }, n.text)
			),
			h(
				'div',
				{ class: 'actions' },
				h(
					'button',
					{ type: 'button', class: 'quiet', onclick: () => this.openComposer({ ...n }) },
					'Edit'
				),
				h(
					'button',
					{ type: 'button', class: 'quiet', onclick: () => this.removeNote(n.id) },
					'Remove'
				)
			)
		);
	}

	/** The note being written, as a bubble with the passage it answers quoted on top. */
	composerEl(c) {
		const area = h('textarea', {
			name: 'note',
			rows: '3',
			maxlength: String(MAX_TEXT),
			placeholder: 'What should change, or what is good here?',
			'aria-label': `Your note on ${lineLabel(c.from, c.to)}`
		});
		area.value = c.text ?? '';
		const count = h('span', { class: 'count' });
		const save = h('button', { type: 'button', class: 'pill primary' }, c.id ? 'Save' : 'Add note');
		const update = () => {
			const n = [...area.value].length;
			count.textContent = n > MAX_TEXT - 100 ? `${n}/${MAX_TEXT}` : '';
			save.disabled = !tidy(area.value);
		};
		update();
		area.addEventListener('input', () => {
			// Kept, so a refresh of the document does not lose what is being typed.
			c.text = area.value;
			update();
		});
		const commit = () => {
			if (tidy(area.value)) this.saveNote({ ...c, text: area.value.trim() });
		};
		area.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				this.closeComposer();
			} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				commit();
			}
		});
		save.addEventListener('click', commit);
		return h(
			'div',
			{ class: 'composer' },
			h('div', { class: 'meta' }, h('span', null, `Your note on ${lineLabel(c.from, c.to)}`)),
			h(
				'div',
				{ class: 'bubble bubble-captain' },
				c.quote ? quoteEl(lineLabel(c.from, c.to), c.quote) : null,
				area
			),
			h(
				'div',
				{ class: 'actions' },
				count,
				h(
					'button',
					{ type: 'button', class: 'quiet', onclick: () => this.closeComposer() },
					'Cancel'
				),
				save
			)
		);
	}

	openComposer(c) {
		if (!this.draft || this.sending) return;
		this.composer = c;
		this.hideFloater();
		this.renderNotes();
	}

	closeComposer() {
		this.composer = null;
		this.renderNotes();
	}

	saveNote(c) {
		const d = this.draft;
		const note = {
			id: c.id ?? noteId(),
			text: c.text,
			quote: c.quote ?? '',
			from: c.from,
			to: c.to,
			at: c.at ?? Date.now()
		};
		const i = d.notes.findIndex((n) => n.id === note.id);
		if (i >= 0) d.notes[i] = note;
		else d.notes.push(note);
		this.composer = null;
		this.error = null;
		this.notice = null;
		this.save();
		this.renderNotes();
		this.renderPicker();
		this.renderThread();
	}

	removeNote(id) {
		const d = this.draft;
		d.notes = d.notes.filter((n) => n.id !== id);
		this.save();
		this.renderNotes();
		this.renderPicker();
		this.renderThread();
	}

	// ---- selecting a passage ----

	/** The selected passage in the document, with its lines; null when there is none. */
	selection() {
		const sel = document.getSelection?.();
		if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
		const range = sel.getRangeAt(0);
		const inDoc = (n) => n && this.docEl.contains(n.nodeType === 1 ? n : n.parentNode);
		if (!inDoc(range.startContainer) || !inDoc(range.endContainer)) return null;
		const quote = tidy(sel.toString());
		if (!quote) return null;
		const at = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest('[data-from]');
		const a = at(range.startContainer);
		const b = at(range.endContainer);
		if (!a || !b) return null;
		const from = Math.min(Number(a.dataset.from), Number(b.dataset.from));
		const to = Math.max(Number(a.dataset.to), Number(b.dataset.to));
		return { from, to, quote: cut(quote, MAX_QUOTE), range };
	}

	selectionChanged() {
		if (!this.draft) return;
		const s = this.selection();
		if (!s) {
			this.hideFloater();
			return;
		}
		this.pending = { from: s.from, to: s.to, quote: s.quote };
		const r = s.range.getBoundingClientRect?.();
		const box = this.root.getBoundingClientRect?.();
		if (r && box) {
			this.floater.style.left = `${r.left - box.left + r.width / 2}px`;
			this.floater.style.top = `${r.top - box.top}px`;
		}
		this.floater.hidden = false;
	}

	hideFloater() {
		this.floater.hidden = true;
		this.pending = null;
	}

	commentOnSelection() {
		const p = this.pending;
		if (!p) return;
		document.getSelection?.()?.removeAllRanges();
		this.openComposer(p);
	}

	// ---- the review: a thread of notes, the verdict, send ----

	renderThread() {
		const doc = this.doc;
		const d = this.draft;
		const task = this.task;
		const sent = doc && this.taskId ? store.get(sentKey(this.taskId, doc.path)) : null;
		const head = h(
			'header',
			{ class: 'thread-head' },
			h('h2', null, 'Your review'),
			doc && task
				? h('p', { class: 'sub' }, `${doc.name} · ${task.title}`)
				: h('p', { class: 'sub' }, 'Nothing open yet')
		);
		if (!doc || !d) {
			this.thread.replaceChildren(
				head,
				h(
					'div',
					{ class: 'msgs chat-grid' },
					h(
						'p',
						{ class: 'aside' },
						doc && doc.text === null && !doc.error
							? 'Reading the document…'
							: 'Open a document to review it.'
					)
				)
			);
			this.dock.replaceChildren();
			this.dock.hidden = true;
			return;
		}
		const notes = inOrder(d.notes);
		const drafting = !blank(d);
		const msgs = [
			h(
				'li',
				{ class: 'aside' },
				notes.length
					? 'Your notes on the plan, in its order. Nothing goes to Firstmate until you send.'
					: 'No notes yet. Hover over a line in the plan and click +, or select a passage, to say what should change.'
			),
			sent && drafting && !this.notice
				? h('li', { class: 'aside' }, `Last sent ${ago(sent.at)}: ${sentWhat(sent)}.`)
				: null,
			sent && !drafting && !this.notice ? sentMsg(sent) : null,
			...notes.map((n) => this.noteMsg(n)),
			this.notice
		];
		const verdict = h(
			'div',
			{ class: 'verdict', role: 'radiogroup', 'aria-label': 'Your verdict' },
			Object.entries(VERDICTS).map(([v, label]) =>
				h(
					'button',
					{
						type: 'button',
						role: 'radio',
						class: v,
						'aria-checked': String(d.verdict === v),
						disabled: this.sending,
						onclick: () => {
							d.verdict = v;
							this.error = null;
							this.notice = null;
							this.save();
							this.renderThread();
						}
					},
					label
				)
			)
		);
		const overall = h('textarea', {
			name: 'overall',
			rows: '2',
			maxlength: String(MAX_TEXT),
			placeholder: 'A note on the plan as a whole (optional)',
			'aria-label': 'A note on the whole document',
			disabled: this.sending
		});
		overall.value = d.overall;
		const why = h('p', { class: 'why', 'aria-live': 'polite' });
		const send = h('button', { type: 'button', class: 'send' }, arrowUp());
		const canSend = typeof this.host?.sendFeedback === 'function';
		// The bar that stays in view on a narrow page, so sending needs no scroll to the end.
		const summary = h('span', { class: 'summary' });
		const dockSend = h('button', { type: 'button', class: 'pill primary' });
		const refresh = () => {
			const built = buildList(this.review());
			const label = this.sending ? 'Sending…' : 'Send to Firstmate';
			send.disabled = this.sending || !built.ok || !canSend;
			send.setAttribute('aria-label', label);
			send.title = label;
			const error = canSend
				? this.error
				: 'This Wheelhouse is too old to send plan reviews to Firstmate. Update Wheelhouse to send it.';
			why.className = error ? 'why error' : 'why';
			// Just after a send the draft is empty, and the sent note says enough.
			const quiet = this.notice && !built.ok;
			why.textContent = error ?? (built.ok ? sendHint(built.list) : quiet ? '' : built.reason);
			summary.textContent = [
				notes.length ? plural(notes.length, 'note') : 'No notes yet',
				VERDICTS[d.verdict]
			]
				.filter(Boolean)
				.join(' · ');
			dockSend.disabled = this.sending || (built.ok && !canSend);
			dockSend.textContent = built.ok ? label : 'Finish your review';
			dockSend.dataset.action = built.ok ? 'send' : 'finish';
		};
		dockSend.addEventListener('click', () => {
			if (dockSend.dataset.action === 'send') this.send();
			else this.finish();
		});
		overall.addEventListener('input', () => {
			d.overall = overall.value;
			this.save();
			refresh();
		});
		overall.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !send.disabled) {
				e.preventDefault();
				this.send();
			}
		});
		send.addEventListener('click', () => this.send());
		refresh();
		const reply = [
			h('p', { class: 'caption' }, 'Your verdict'),
			verdict,
			h('div', { class: 'box' }, overall, send),
			why,
			this.stale?.path === doc.path ? this.staleEl() : null,
			drafting && !this.sending
				? h(
						'div',
						{ class: 'foot' },
						h(
							'button',
							{ type: 'button', class: 'quiet', onclick: () => this.discard() },
							'Discard this draft'
						)
					)
				: null
		];
		// Drawn afresh, the note on the whole plan keeps the focus and caret it had.
		const typing = document.activeElement;
		const caret =
			typing?.name === 'overall' && this.thread.contains(typing)
				? [typing.selectionStart, typing.selectionEnd]
				: null;
		this.thread.replaceChildren(
			head,
			h('ol', { class: 'msgs chat-grid' }, ...msgs.filter(Boolean)),
			h('div', { class: 'reply' }, ...reply.filter(Boolean))
		);
		if (caret && !overall.disabled) {
			overall.focus({ preventScroll: true });
			overall.setSelectionRange(...caret);
		}
		this.dock.hidden = false;
		this.dock.replaceChildren(summary, dockSend);
	}

	/** A note in the thread: the captain's bubble, quoting the passage it is about. */
	noteMsg(n) {
		return h(
			'li',
			{ class: 'msg msg-captain', 'data-note': n.id },
			h(
				'div',
				null,
				h(
					'div',
					{ class: 'bubble bubble-captain' },
					quoteEl(lineLabel(n.from, n.to), n.quote || 'The whole part', () => this.reveal(n)),
					h('p', { class: 'text' }, n.text)
				),
				h(
					'div',
					{ class: 'actions' },
					n.moved ? h('span', { class: 'moved' }, 'text changed') : null,
					h(
						'button',
						{
							type: 'button',
							class: 'quiet',
							disabled: this.sending,
							onclick: () => {
								this.openComposer({ ...n });
								this.reveal(n);
							}
						},
						'Edit'
					),
					h(
						'button',
						{
							type: 'button',
							class: 'quiet',
							disabled: this.sending,
							onclick: () => this.removeNote(n.id)
						},
						'Remove'
					)
				)
			)
		);
	}

	/** Why nothing was sent: the document changed since it was opened. */
	staleEl() {
		return h(
			'div',
			{ class: 'banner', role: 'alert' },
			h(
				'span',
				null,
				`${this.stale.name} changed since you opened it, so nothing was sent. Move your notes onto the new text, check them, then send again.`
			),
			h(
				'button',
				{ type: 'button', class: 'pill', onclick: () => this.useNewText() },
				'Use the new text'
			)
		);
	}

	/** Bring the review into view, at the verdict when there is none yet. */
	finish() {
		this.thread.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
		const target = this.draft?.verdict
			? this.thread.querySelector('textarea[name="overall"]')
			: this.thread.querySelector('.verdict button');
		target?.focus({ preventScroll: true });
	}

	review() {
		const d = this.draft;
		return {
			path: this.doc?.path ?? '',
			verdict: d?.verdict,
			overall: d?.overall,
			notes: d?.notes ?? []
		};
	}

	/**
	 * Send the review, after reading the document again: if it is not the text
	 * the notes were written on, nothing is sent and the captain is shown why.
	 * Notes and the verdict are locked while it sends. Whatever happens on
	 * another document or task meanwhile, the send settles this document's
	 * draft only.
	 */
	async send() {
		const review = this.review();
		const built = buildList(review);
		if (!built.ok || this.sending || typeof this.host?.sendFeedback !== 'function') return;
		const task = this.taskId;
		const doc = this.doc;
		const reviewed = this.draft.hash;
		const sent = new Set(review.notes.map((n) => `${n.id}\n${n.text}`));
		this.sending = true;
		this.composer = null;
		this.error = null;
		this.stale = null;
		this.renderNotes();
		this.renderThread();
		const here = () => this.taskId === task && this.path === doc.path;
		const stop = (error) => {
			this.sending = false;
			if (here()) this.error = error;
			this.renderThread();
		};
		const read = readPath(doc);
		const now = await readThroughWheelhouse(read);
		if (!now.ok)
			return stop(`Could not read ${doc.name} again to check it is unchanged: ${now.error}`);
		if (fingerprint(now.text) !== reviewed) {
			this.stale = { path: doc.path, read, name: doc.name, text: now.text };
			return stop(null);
		}
		const r = await Promise.resolve(
			this.host.sendFeedback({ task, subject: built.list.subject, items: built.list.items })
		).catch(() => null);
		if (!r?.ok) return stop(r?.error || 'Wheelhouse could not send the review.');
		this.sending = false;
		const record = {
			at: Date.now(),
			verdict: review.verdict,
			notes: sent.size,
			pending: !!r.pending
		};
		store.set(sentKey(task, doc.path), record);
		// What was sent leaves the draft.
		const rest = (d) => ({
			...d,
			notes: d.notes.filter((n) => !sent.has(`${n.id}\n${n.text}`)),
			verdict: d.verdict === review.verdict ? null : d.verdict,
			overall: d.overall === review.overall ? '' : d.overall
		});
		if (here() && this.draft) {
			this.draft = rest(this.draft);
			this.save();
			this.notice = sentMsg(record, true);
			this.renderNotes();
		} else {
			const stored = store.get(draftKey(task, doc.path));
			const left = stored ? rest(readDraft(stored, null)) : null;
			store.set(draftKey(task, doc.path), left && !blank(left) ? left : null);
		}
		this.renderPicker();
		this.renderThread();
	}

	discard() {
		const d = this.draft;
		if (!d) return;
		this.draft = emptyDraft(d.hash);
		this.composer = null;
		this.error = null;
		this.save();
		this.renderNotes();
		this.renderPicker();
		this.renderThread();
	}

	/** Scroll a note's part of the document into view, and mark it for a moment. */
	reveal(n) {
		const u = this.unitFor(n);
		if (!u) return;
		u.el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
		u.el.classList.remove('flash');
		void u.el.offsetWidth;
		u.el.classList.add('flash');
	}
}

/** What a note on a whole part quotes: its first sentence, kept short. */
function opening(text) {
	const first = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
	return cut(first, 90);
}

/** What a part of the document says, without its gutter and notes. */
function unitText(el) {
	if (!el) return '';
	const copy = el.cloneNode(true);
	for (const x of copy.querySelectorAll('.gutter, .slot')) x.remove();
	return tidy(copy.textContent);
}

/** A part's place for notes: its own slot, not one in a nested list. */
function slotOf(el) {
	return [...el.children].find((c) => c.classList.contains('slot')) ?? null;
}

/** The quoted passage on top of a note, as a reply quotes a message in Wheelhouse's chat. */
function quoteEl(where, quote, onclick) {
	return h(
		onclick ? 'button' : 'div',
		{
			class: 'reply-quote reply-quote-captain',
			type: onclick ? 'button' : null,
			title: onclick ? `Show ${where} in the document` : null,
			onclick
		},
		h('span', { class: 'reply-quote-who' }, where.replace(/^l/, 'L')),
		h('span', { class: 'reply-quote-text' }, `“${quote}”`)
	);
}

/** The arrow on the send button, as on the chat's. */
function arrowUp() {
	const NS = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(NS, 'svg');
	for (const [k, v] of Object.entries({
		viewBox: '0 0 24 24',
		width: '16',
		height: '16',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-width': '2',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'aria-hidden': 'true'
	}))
		svg.setAttribute(k, v);
	for (const d of ['m5 12 7-7 7 7', 'M12 19V5']) {
		const p = document.createElementNS(NS, 'path');
		p.setAttribute('d', d);
		svg.append(p);
	}
	return svg;
}

function sendHint(list) {
	return `Checks the document is unchanged, then sends ${plural(list.items.length, 'line')} to Firstmate as one list, for this task’s worker.`;
}

const blank = (d) => !d.notes.length && !tidy(d.overall) && !d.verdict;

/** Where Wheelhouse's reader reads a document from: a worktree file by its full path. */
const readPath = (doc) => doc.file ?? doc.path;

const isMarkdown = (p) => typeof p === 'string' && /\.md$/i.test(p.split(/[?#]/)[0]);

/** A file opened by path, as a document on offer. */
const byPath = (p) => ({
	path: p,
	name: p.split('/').pop(),
	source: p.startsWith('/') ? 'other' : 'home',
	file: null
});

const sentWhat = (rec) => `${VERDICTS[rec.verdict] ?? 'Review'}, ${plural(rec.notes, 'note')}`;

/** What was sent, as the captain's message in the thread. */
function sentMsg(rec, fresh = false) {
	return h(
		'li',
		{ class: 'msg msg-captain sent', role: fresh ? 'status' : null },
		h(
			'div',
			null,
			h(
				'div',
				{ class: 'bubble bubble-captain' },
				h('strong', null, fresh ? 'Sent to Firstmate.' : `Sent ${ago(rec.at)}.`),
				` ${sentWhat(rec)}.`
			),
			h(
				'p',
				{ class: 'actions' },
				rec.pending
					? 'Wheelhouse is still confirming Firstmate has it; the chat shows when it does.'
					: 'Firstmate passes it to this task’s worker; its reply shows in the chat.'
			)
		)
	);
}

/** A Markdown file's text through Wheelhouse's document reader route, which keeps to its folders. */
export async function readThroughWheelhouse(p) {
	try {
		const res = await fetch(`/api/files?path=${encodeURIComponent(p)}`, {
			headers: { accept: 'text/plain' }
		});
		if (res.ok) return { ok: true, text: await res.text() };
		// SvelteKit answers an error as JSON, { message }.
		const body = await res.json().catch(() => null);
		const said = typeof body?.message === 'string' ? body.message.trim() : '';
		const reason =
			res.status === 404
				? 'There is no such file.'
				: res.status === 403
					? 'That file is outside the folders Wheelhouse may read.'
					: res.status === 415
						? 'Wheelhouse does not show that kind of file.'
						: `Wheelhouse answered ${res.status}.`;
		return { ok: false, error: said && said.length < 160 ? said : reason };
	} catch {
		return { ok: false, error: 'Could not reach the Wheelhouse server.' };
	}
}

if (!customElements.get('plan-review-page')) {
	customElements.define('plan-review-page', PlanReviewPage);
}
