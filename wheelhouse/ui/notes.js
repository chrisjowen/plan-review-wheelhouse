/**
 * The review as data: the captain's notes on a document and their verdict,
 * kept as a draft per task and file, and turned into the one feedback list
 * Wheelhouse sends to Firstmate (host.sendFeedback). No DOM here.
 */

/** Wheelhouse's limits on a feedback list (docs/plugins.md, "Sending feedback to Firstmate"). */
export const MAX_ITEMS = 30;
export const MAX_TEXT = 500;
export const MAX_POINTS = 200;
export const MAX_SUBJECT = 200;
/** How much of a passage a note quotes. */
export const MAX_QUOTE = 140;

export const VERDICTS = {
	approve: 'Approve',
	changes: 'Request changes'
};

const tidy = (s) =>
	String(s ?? '')
		.replace(/\s+/g, ' ')
		.trim();
const chars = (s) => [...s].length;

/** At most `max` characters, ending in `…` when cut. */
export function cut(s, max) {
	const all = [...tidy(s)];
	return all.length <= max ? all.join('') : `${all.slice(0, max - 1).join('')}…`;
}

/** `line 5`, or `lines 5–7`. */
export function lineLabel(from, to = from) {
	if (!Number.isInteger(from)) return '';
	return to > from ? `lines ${from}–${to}` : `line ${from}`;
}

/** What a note is about, for Firstmate: `“the quote” (line 5)`, within Wheelhouse's limit. */
export function pointsFor(note) {
	const where = lineLabel(note.from, note.to);
	const tail = where ? ` (${where})` : '';
	const quote = tidy(note.quote);
	if (!quote) return where || null;
	const room = MAX_POINTS - chars(tail) - 2;
	return `“${cut(quote, Math.min(room, MAX_QUOTE))}”${tail}`;
}

/** `data/x/plan.md: Request changes`, the path shortened from the left when long. */
export function subjectFor(path, verdict) {
	const tail = `: ${VERDICTS[verdict] ?? VERDICTS.changes}`;
	const room = MAX_SUBJECT - chars(tail);
	const p = [...tidy(path)];
	const shown = p.length <= room ? p.join('') : `…${p.slice(p.length - room + 1).join('')}`;
	return `${shown}${tail}`;
}

/** Notes in the order they appear in the document. */
export function inOrder(notes) {
	return [...notes].sort(
		(a, b) => (a.from ?? Infinity) - (b.from ?? Infinity) || (a.at ?? 0) - (b.at ?? 0)
	);
}

/**
 * The feedback list for host.sendFeedback, or why it cannot be sent yet.
 * The overall note goes first, then each note in document order. Approving
 * with nothing to add still sends one line, so Firstmate hears the verdict.
 */
export function buildList({ path, verdict, overall, notes }) {
	if (!VERDICTS[verdict]) return { ok: false, reason: 'Choose Approve or Request changes.' };
	const items = [];
	const general = tidy(overall);
	if (general) items.push({ text: general });
	for (const n of inOrder(notes)) {
		const text = tidy(n.text);
		if (text) items.push({ text, points: pointsFor(n) });
	}
	if (!items.length) {
		if (verdict === 'changes') {
			return { ok: false, reason: 'Add a note saying what should change.' };
		}
		items.push({ text: 'Approved as written. Go ahead.' });
	}
	if (items.length > MAX_ITEMS) {
		return {
			ok: false,
			reason: `Firstmate takes up to ${MAX_ITEMS} notes at once; this review has ${items.length}. Merge or remove a few.`
		};
	}
	const long = items.find((i) => chars(i.text) > MAX_TEXT);
	if (long) return { ok: false, reason: `Keep each note under ${MAX_TEXT} characters.` };
	return { ok: true, list: { subject: subjectFor(path, verdict), items } };
}

/** A short fingerprint of a document's whole text (FNV-1a), to notice it changed under a draft. */
export function fingerprint(text) {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

export const draftKey = (task, path) => `plan-review:v1:${task}:${path}`;
export const sentKey = (task, path) => `plan-review:v1:sent:${task}:${path}`;

/** An empty draft for a document. */
export const emptyDraft = (hash) => ({ hash, verdict: null, overall: '', notes: [] });

/** A stored draft, checked; anything malformed reads as no draft. */
export function readDraft(v, hash) {
	if (!v || typeof v !== 'object' || !Array.isArray(v.notes)) return emptyDraft(hash);
	const notes = v.notes
		.filter((n) => n && typeof n.id === 'string' && typeof n.text === 'string')
		.map((n) => ({
			id: n.id,
			text: n.text,
			quote: typeof n.quote === 'string' ? n.quote : '',
			from: Number.isInteger(n.from) ? n.from : null,
			to: Number.isInteger(n.to) ? n.to : null,
			at: Number(n.at) || 0,
			...(n.moved === true ? { moved: true } : {})
		}));
	return {
		hash: typeof v.hash === 'string' ? v.hash : null,
		verdict: VERDICTS[v.verdict] ? v.verdict : null,
		overall: typeof v.overall === 'string' ? v.overall : '',
		notes
	};
}

/**
 * After the document changed, move each note to where its quote now is.
 * `units` are the document's commentable parts, `{ from, to, text }`. A note
 * whose quote is gone keeps its lines and is marked `moved`.
 */
export function reanchor(notes, units) {
	return notes.map((n) => {
		const quote = tidy(n.quote).replace(/…$/, '');
		if (!quote) return n;
		const here = units.find(
			(u) => u.from === n.from && u.to === n.to && tidy(u.text).includes(quote)
		);
		if (here) return { ...n, moved: false };
		const found = units.find((u) => tidy(u.text).includes(quote));
		if (!found) return { ...n, moved: true };
		return { ...n, from: found.from, to: found.to, moved: false };
	});
}

let seq = 0;
/** A note id unique on this page. */
export const noteId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;
