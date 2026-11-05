/**
 * The plan review section as a custom element, `plan-review-section`.
 * Wheelhouse sets `host` (whose `sendFeedback` sends the review), `entry`
 * (the task this section is on) and `data` (the task's Markdown documents,
 * from the `docs` provider).
 *
 * The captain picks a document (or opens another Markdown file by path),
 * reads it as Wheelhouse's reader draws it, and comments: the + beside a
 * line, or a selected passage. Then Approve or Request changes, with an
 * optional note for the whole document, and Send: one feedback list to
 * Firstmate about this task, once the document is read again and found
 * unchanged. The draft is kept in the browser per task and file until it is
 * sent.
 *
 * The element draws in light DOM so text in the document can be selected
 * and read back; its styles are all scoped to its tag.
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
			// a private window: the section still works, it just won't remember
		}
	}
};

const tidy = (s) =>
	String(s ?? '')
		.replace(/\s+/g, ' ')
		.trim();

export class PlanReviewSection extends HTMLElement {
	constructor() {
		super();
		/** @type {any} */
		this._data = null;
		this.host = null;
		this.entry = null;
		/** Files the captain opened by path: path → { path, name, source, text, truncated } */
		this.extra = new Map();
		/** A document as last read through Wheelhouse's reader, over the provider's text: path → { text, base, truncated } */
		this.full = new Map();
		this.path = null;
		this.draft = null;
		this.shown = null;
		this.units = [];
		this.composer = null;
		this.pending = null;
		this.changed = false;
		this.reading = false;
		this.stale = null;
		this.otherOpen = false;
		this.sending = false;
		this.error = null;
		this.notice = null;
		this.onSelect = () => this.selectionChanged();
	}

	set data(v) {
		this._data = v;
		if (this.isConnected) this.sync();
	}
	get data() {
		return this._data;
	}

	connectedCallback() {
		const style = document.createElement('style');
		style.textContent = STYLE;
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
		this.panel = h('aside', { class: 'panel', 'aria-label': 'Your review' });
		this.floater = h(
			'button',
			{
				type: 'button',
				class: 'btn on-selection',
				hidden: true,
				onmousedown: (e) => e.preventDefault(),
				onclick: () => this.commentOnSelection()
			},
			'Comment on this'
		);
		this.root = h(
			'div',
			{ class: 'pr' },
			this.picker,
			this.other,
			h('div', { class: 'layout' }, this.sheet, this.panel),
			(this.dock = h('div', { class: 'dock', role: 'region', 'aria-label': 'Send your review' })),
			this.floater
		);
		this.replaceChildren(style, this.root);
		this.docEl.addEventListener('mouseup', () => setTimeout(this.onSelect, 0));
		this.docEl.addEventListener('keyup', this.onSelect);
		document.addEventListener('selectionchange', this.onSelect);
		// Nothing drawn yet, not even the empty state.
		this.shown = undefined;
		void this.reopenExtra();
		// The bar with Send steps aside while the review itself is on screen.
		if (typeof IntersectionObserver === 'function') {
			this.seen = new IntersectionObserver(([e]) =>
				this.dock.classList.toggle('aside', e.isIntersecting)
			);
			this.seen.observe(this.panel);
		}
		this.sync();
	}

	disconnectedCallback() {
		document.removeEventListener('selectionchange', this.onSelect);
		this.seen?.disconnect();
	}

	get taskId() {
		return this.entry?.taskId ?? this._data?.task?.id ?? null;
	}

	/** Every document on offer: the task's, then any opened by path. */
	get docs() {
		const own = Array.isArray(this._data?.docs) ? this._data.docs : [];
		const seen = new Set(own.map((d) => d.path));
		return [...own, ...[...this.extra.values()].filter((d) => !seen.has(d.path))];
	}

	get doc() {
		const d = this.docs.find((x) => x.path === this.path) ?? null;
		// What Wheelhouse's reader read of it, while what the provider read of it is unchanged.
		const full = d ? this.full.get(d.path) : null;
		if (full && full.base === fingerprint(d.text))
			return { ...d, text: full.text, truncated: full.truncated };
		return d;
	}

	/** Bring everything in line with the data: the documents, the one shown, its draft. */
	sync() {
		const docs = this.docs;
		const task = this.taskId;
		if (!this.path || !docs.some((d) => d.path === this.path)) {
			const last = task ? store.get(`plan-review:v1:last:${task}`) : null;
			this.path = docs.find((d) => d.path === last)?.path ?? docs[0]?.path ?? null;
		}
		this.renderPicker();
		const doc = this.doc;
		const hash = doc ? fingerprint(doc.text) : null;
		const key = doc ? `${task}\n${doc.path}\n${hash}` : null;
		if (key !== this.shown) {
			this.shown = key;
			// A long document's draft waits for its whole text, so it is not checked against a part of it.
			this.reading = !!doc?.truncated && !!readPath(doc) && this.full.get(doc.path)?.base !== hash;
			this.loadDraft(this.reading ? null : doc, hash);
			this.renderDocument();
			if (this.reading) void this.readFull(doc.path);
		}
		this.renderPanel();
	}

	choose(path) {
		this.path = path;
		this.composer = null;
		this.changed = false;
		this.notice = null;
		this.error = null;
		this.stale = null;
		if (this.taskId) store.set(`plan-review:v1:last:${this.taskId}`, path);
		this.sync();
	}

	// ---- the draft ----

	loadDraft(doc, hash) {
		this.changed = false;
		if (!doc || !this.taskId) {
			this.draft = null;
			return;
		}
		const d = readDraft(store.get(draftKey(this.taskId, doc.path)), hash);
		this.draft = d;
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
		if (!d || !doc) return;
		d.notes = reanchor(d.notes, this.units);
		d.hash = fingerprint(doc.text);
		this.changed = false;
		this.error = null;
		this.save();
		this.renderBanner();
		this.renderNotes();
		this.renderPanel();
	}

	// ---- the document picker ----

	renderPicker() {
		const docs = this.docs;
		const chips = docs.map((d) => {
			const draft = this.taskId ? store.get(draftKey(this.taskId, d.path)) : null;
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
			...(docs.length ? [h('span', { class: 'label' }, 'Document')] : []),
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
			h('button', { type: 'button', class: 'btn', onclick: () => void open() }, 'Open'),
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
		const r = await readThroughWheelhouse(p);
		if (!r.ok) return r;
		const name = p.split('/').pop();
		this.extra.set(p, {
			path: p,
			name,
			source: p.startsWith('/') ? 'other' : 'home',
			text: r.text,
			truncated: false
		});
		this.rememberExtra();
		this.choose(p);
		return { ok: true };
	}

	rememberExtra() {
		if (this.taskId) store.set(`plan-review:v1:extra:${this.taskId}`, [...this.extra.keys()]);
	}

	async reopenExtra() {
		const task = this.taskId;
		const paths = task ? store.get(`plan-review:v1:extra:${task}`) : null;
		if (!Array.isArray(paths)) return;
		for (const p of paths.filter(isMarkdown).slice(0, 10)) {
			const r = await readThroughWheelhouse(p);
			if (!r.ok) continue;
			this.extra.set(p, {
				path: p,
				name: p.split('/').pop(),
				source: p.startsWith('/') ? 'other' : 'home',
				text: r.text,
				truncated: false
			});
		}
		if (this.extra.size && this.isConnected) this.sync();
	}

	/** The whole of a long document; if Wheelhouse's reader cannot read it, the part the provider read. */
	async readFull(path) {
		const d = this.docs.find((x) => x.path === path);
		if (!d) return;
		const base = d.text;
		const r = await readThroughWheelhouse(readPath(d));
		if (this.docs.find((x) => x.path === path)?.text !== base) return;
		this.full.set(
			path,
			r.ok
				? { text: r.text, base: fingerprint(base), truncated: false }
				: { text: base, base: fingerprint(base), truncated: true }
		);
		if (this.isConnected) this.sync();
	}

	/** Show the document as it now is on disk, and move the notes onto it. */
	useNewText() {
		const s = this.stale;
		const base = this.docs.find((x) => x.path === s?.path)?.text;
		this.stale = null;
		if (base !== undefined)
			this.full.set(s.path, { text: s.text, base: fingerprint(base), truncated: false });
		this.sync();
		this.moveNotes();
	}

	// ---- the document ----

	renderDocument() {
		const doc = this.doc;
		this.units = [];
		this.hideFloater();
		if (!doc) {
			this.headerEl.replaceChildren(
				h('p', { class: 'kicker' }, 'Document'),
				h('h1', { class: 'title' }, 'No plan here yet')
			);
			this.bannerEl.replaceChildren();
			const task = this.taskId ?? '<task>';
			this.docEl.replaceChildren(
				h(
					'p',
					{ class: 'empty' },
					`When Firstmate writes this task’s plan (data/${task}/plan.md, spec.md or report.md), it shows here to read and comment on. You can also open any Markdown file with “Open a Markdown file…” above.`
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
		const doc = this.doc;
		const out = [];
		if (doc?.truncated) {
			out.push(
				h(
					'div',
					{ class: 'banner' },
					h('span', null, 'This document is long, so only its first 64 KB is shown.')
				)
			);
		}
		if (this.changed) {
			out.push(
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
						{ type: 'button', class: 'quiet', onclick: () => this.moveNotes() },
						'Move notes onto this text'
					)
				)
			);
		}
		this.bannerEl.replaceChildren(...out);
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

	noteEl(n) {
		return h(
			'div',
			{ class: 'note', 'data-note': n.id },
			h(
				'div',
				{ class: 'meta' },
				h('span', null, `Your note · ${lineLabel(n.from, n.to)}`),
				n.moved ? h('span', { class: 'moved' }, 'text changed') : null
			),
			n.quote ? h('p', { class: 'quote' }, `“${n.quote}”`) : null,
			h('p', { class: 'text' }, n.text),
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

	composerEl(c) {
		const area = h('textarea', {
			name: 'note',
			maxlength: String(MAX_TEXT),
			placeholder: 'What should change, or what is good here?',
			'aria-label': `Your note on ${lineLabel(c.from, c.to)}`
		});
		area.value = c.text ?? '';
		const count = h('span', { class: 'count' });
		const save = h('button', { type: 'button', class: 'btn primary' }, c.id ? 'Save' : 'Add note');
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
			h('div', { class: 'meta' }, h('span', null, `Note on ${lineLabel(c.from, c.to)}`)),
			c.quote ? h('p', { class: 'quote' }, `“${c.quote}”`) : null,
			area,
			h(
				'div',
				{ class: 'actions' },
				save,
				h(
					'button',
					{ type: 'button', class: 'quiet', onclick: () => this.closeComposer() },
					'Cancel'
				),
				count
			)
		);
	}

	openComposer(c) {
		if (!this.draft) return;
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
		this.renderPanel();
	}

	removeNote(id) {
		const d = this.draft;
		d.notes = d.notes.filter((n) => n.id !== id);
		this.save();
		this.renderNotes();
		this.renderPicker();
		this.renderPanel();
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

	// ---- the review: notes, verdict, send ----

	renderPanel() {
		const doc = this.doc;
		const d = this.draft;
		const sent = doc && this.taskId ? store.get(sentKey(this.taskId, doc.path)) : null;
		if (!doc || !d) {
			this.panel.replaceChildren(
				h('h2', null, 'Your review'),
				h(
					'p',
					{ class: 'hint' },
					this.reading ? 'Reading the whole document…' : 'Open a document to review it.'
				)
			);
			this.dock.replaceChildren();
			this.dock.hidden = true;
			return;
		}
		const notes = inOrder(d.notes);
		const drafting = !blank(d);
		const list = notes.length
			? h(
					'ol',
					{ class: 'list' },
					notes.map((n) =>
						h(
							'li',
							null,
							h(
								'button',
								{ type: 'button', onclick: () => this.reveal(n) },
								h('span', { class: 'where' }, lineLabel(n.from, n.to)),
								h('span', { class: 'what' }, n.text)
							)
						)
					)
				)
			: h(
					'p',
					{ class: 'hint' },
					'No notes yet. Hover over a line and click +, or select a passage, to say what should change.'
				);
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
						onclick: () => {
							d.verdict = v;
							this.error = null;
							this.notice = null;
							this.save();
							this.renderPanel();
						}
					},
					label
				)
			)
		);
		const overall = h('textarea', {
			name: 'overall',
			maxlength: String(MAX_TEXT),
			placeholder: 'Anything about the plan as a whole? (optional)',
			'aria-label': 'A note on the whole document'
		});
		overall.value = d.overall;
		const why = h('p', { class: 'why', 'aria-live': 'polite' });
		const send = h('button', { type: 'button', class: 'btn primary' });
		const canSend = typeof this.host?.sendFeedback === 'function';
		// The bar that stays in view on a narrow page, so sending needs no scroll to the end.
		const summary = h('span', { class: 'summary' });
		const dockSend = h('button', { type: 'button', class: 'btn primary' });
		const refresh = () => {
			const built = buildList(this.review());
			send.disabled = this.sending || !built.ok || !canSend;
			send.textContent = this.sending ? 'Sending…' : 'Send to Firstmate';
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
			dockSend.textContent = built.ok ? send.textContent : 'Finish your review';
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
		send.addEventListener('click', () => this.send());
		refresh();
		const parts = [
			h('h2', null, 'Your review'),
			h(
				'p',
				{ class: 'sub' },
				notes.length ? plural(notes.length, 'note') : 'Nothing noted yet',
				' · ',
				doc.name
			),
			list,
			h('p', { class: 'caption' }, 'Your verdict'),
			verdict,
			overall,
			h('div', { class: 'send' }, send, why),
			this.stale?.path === doc.path ? this.staleEl() : null,
			this.notice ??
				(sent
					? drafting
						? h('p', { class: 'why' }, `Last sent ${ago(sent.at)}: ${sentWhat(sent)}.`)
						: sentEl(sent)
					: null),
			drafting
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
		this.panel.replaceChildren(...parts.filter(Boolean));
		this.dock.hidden = false;
		this.dock.replaceChildren(summary, dockSend);
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
				{ type: 'button', class: 'btn', onclick: () => this.useNewText() },
				'Use the new text'
			)
		);
	}

	/** Bring the review into view, at the verdict when there is none yet. */
	finish() {
		this.panel.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
		const target = this.draft?.verdict
			? this.panel.querySelector('textarea[name="overall"]')
			: this.panel.querySelector('.verdict button');
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
	 * the notes were made on, nothing is sent and the captain is shown why.
	 * Whatever happens on another document meanwhile, the send settles this
	 * document's draft only.
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
		this.error = null;
		this.stale = null;
		this.renderPanel();
		const here = () => this.path === doc.path;
		const stop = (error) => {
			this.sending = false;
			if (here()) this.error = error;
			this.renderPanel();
		};
		const now = readPath(doc)
			? await readThroughWheelhouse(readPath(doc))
			: { ok: false, error: 'Wheelhouse gave no path to read it by.' };
		if (!now.ok)
			return stop(`Could not read ${doc.name} again to check it is unchanged: ${now.error}`);
		if (fingerprint(now.text) !== reviewed) {
			this.stale = { path: doc.path, name: doc.name, text: now.text };
			return stop(null);
		}
		const r = await Promise.resolve(
			this.host.sendFeedback({ subject: built.list.subject, items: built.list.items })
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
		// What was sent leaves the draft; anything added or changed while sending stays.
		const rest = (d) => ({
			...d,
			notes: d.notes.filter((n) => !sent.has(`${n.id}\n${n.text}`)),
			verdict: d.verdict === review.verdict ? null : d.verdict,
			overall: d.overall === review.overall ? '' : d.overall
		});
		if (here() && this.draft) {
			this.draft = rest(this.draft);
			this.save();
			this.notice = sentEl(record, true);
			this.renderNotes();
		} else {
			const stored = store.get(draftKey(task, doc.path));
			const left = stored ? rest(readDraft(stored, null)) : null;
			store.set(draftKey(task, doc.path), left && !blank(left) ? left : null);
		}
		this.renderPicker();
		this.renderPanel();
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
		this.renderPanel();
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

function sendHint(list) {
	return `Checks the document is unchanged, then sends ${plural(list.items.length, 'line')} to Firstmate as one list, for this task’s worker.`;
}

const blank = (d) => !d.notes.length && !tidy(d.overall) && !d.verdict;

/** Where Wheelhouse's reader reads a document from; null for a worktree file whose full path is unknown. */
const readPath = (doc) => doc.file ?? (doc.source === 'task' ? null : doc.path);

const isMarkdown = (p) => typeof p === 'string' && /\.md$/i.test(p.split(/[?#]/)[0]);

const sentWhat = (rec) => `${VERDICTS[rec.verdict] ?? 'Review'}, ${plural(rec.notes, 'note')}`;

function sentEl(rec, fresh = false) {
	return h(
		'div',
		{ class: 'sent', role: fresh ? 'status' : null },
		h('strong', null, fresh ? 'Sent to Firstmate.' : `Sent ${ago(rec.at)}.`),
		` ${sentWhat(rec)}. `,
		rec.pending
			? 'Wheelhouse is still confirming Firstmate has it; the chat shows when it does.'
			: 'Firstmate passes it to this task’s worker; its reply shows in the chat.'
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

if (!customElements.get('plan-review-section')) {
	customElements.define('plan-review-section', PlanReviewSection);
}
