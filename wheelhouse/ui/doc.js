/**
 * A Markdown document as Wheelhouse's reader shows it, cut into parts the
 * captain can comment on, each knowing its lines in the file.
 *
 * Rendering follows Wheelhouse's own reader (src/lib/chat/markdown.ts,
 * `renderDoc`): GitHub-flavoured Markdown through marked, sanitised with
 * DOMPurify, then only plain document markup kept. The same versions of both
 * libraries are vendored beside this file. Each top-level block is rendered
 * on its own so it keeps its lines; a list's items and a table's rows are
 * parts of their own too.
 */

import { marked } from './vendor/marked.esm.js';
import DOMPurify from './vendor/purify.es.mjs';

/** What a document may contain once rendered; anything else is unwrapped to its text. */
const DOC_TAGS = new Set(
	'p h1 h2 h3 h4 h5 h6 ul ol li a img code pre em strong b i u s del ins mark sup sub kbd small br hr blockquote table thead tbody tfoot tr th td caption details summary dl dt dd figure figcaption span div abbr input'.split(
		' '
	)
);
/** Removed with everything inside them. */
const DOC_DROP = new Set(
	'script style iframe frame frameset object embed noscript template svg math form link meta base title textarea select button video audio source track canvas'.split(
		' '
	)
);
const DOC_ATTRS = new Set([
	'href',
	'src',
	'alt',
	'title',
	'colspan',
	'rowspan',
	'align',
	'start',
	'type',
	'checked',
	'disabled',
	'open',
	'class'
]);

const FRONT_MATTER = /^---\n[\s\S]*?\n---(?:\n|$)/;

const lineCount = (s) => (s.match(/\n/g) ?? []).length;

/** The lines a raw slice covers, starting at `line`, without its trailing blank lines. */
function span(raw, line) {
	const body = raw.replace(/\n+$/, '');
	return { from: line, to: line + lineCount(body) };
}

/**
 * The document's blocks, each with its lines (1-based, in the file as
 * written): `{ kind, from, to, token, parts }`, where `parts` are a list's
 * items or a table's rows, each `{ from, to }`. Blank space and link
 * definitions are not blocks. Front matter is a block of its own.
 */
export function parse(source) {
	const text = String(source ?? '').replace(/\r\n?/g, '\n');
	const blocks = [];
	let line = 1;
	let body = text;
	const fm = text.match(FRONT_MATTER);
	if (fm) {
		blocks.push({ kind: 'front', ...span(fm[0], 1), text: fm[0].replace(/\n$/, ''), parts: [] });
		line += lineCount(fm[0]);
		body = text.slice(fm[0].length);
	}
	const tokens = marked.lexer(body, { gfm: true });
	let at = 0;
	for (const token of tokens) {
		// Each token's raw text is the next slice of the source; find it to be sure.
		const i = body.indexOf(token.raw, at);
		if (i >= 0) {
			line += lineCount(body.slice(at, i));
			at = i;
		}
		const start = line;
		line += lineCount(token.raw);
		at += i >= 0 ? token.raw.length : 0;
		if (token.type === 'space' || token.type === 'def') continue;
		blocks.push({ kind: token.type, ...span(token.raw, start), token, parts: parts(token, start) });
	}
	return { blocks, links: tokens.links ?? {} };
}

/** A list's items or a table's rows, with their lines. */
function parts(token, start) {
	if (token.type === 'list') {
		let line = start;
		return token.items.map((item) => {
			const s = span(item.raw, line);
			line += lineCount(item.raw);
			return s;
		});
	}
	if (token.type === 'table') {
		// The header and its delimiter row, then one line per row.
		const head = { from: start, to: start + 1 };
		return [head, ...token.rows.map((_, i) => ({ from: start + 2 + i, to: start + 2 + i }))];
	}
	return [];
}

/** Keep only plain document markup: known tags, harmless attributes, read-only task boxes. */
function allowlist(root) {
	for (const el of [...root.querySelectorAll('*')]) {
		const tag = el.tagName.toLowerCase();
		if (DOC_DROP.has(tag)) {
			el.remove();
			continue;
		}
		if (!DOC_TAGS.has(tag) || (tag === 'input' && el.getAttribute('type') !== 'checkbox')) {
			el.replaceWith(...el.childNodes);
			continue;
		}
		for (const name of el.getAttributeNames()) {
			const misplaced = (name === 'href' && tag !== 'a') || (name === 'src' && tag !== 'img');
			if (!DOC_ATTRS.has(name) || misplaced) el.removeAttribute(name);
		}
		const cls = el.getAttribute('class');
		if (cls !== null && !(tag === 'code' && /^language-[\w+-]+$/.test(cls))) {
			el.removeAttribute('class');
		}
		if (tag === 'input') el.setAttribute('disabled', '');
	}
}

/** A folder path joined with a relative one, `..` and `.` resolved; null when it leads above. */
function join(dir, rel) {
	const out = dir ? dir.split('/') : [];
	for (const seg of rel.split('/')) {
		if (seg === '' || seg === '.') continue;
		if (seg === '..') {
			if (!out.length) return null;
			out.pop();
		} else out.push(seg);
	}
	return out.join('/');
}

/**
 * Where a link or image in the document leads, or null to drop it. Web links
 * stay; a file next to a document in the Firstmate home opens in Wheelhouse's
 * reader (Markdown) or from /api/files (images), which only read inside the
 * folders Wheelhouse allows. Anything else is dropped.
 */
export function resolveLink(href, doc, kind) {
	const h = String(href ?? '').trim();
	if (/^https?:\/\//i.test(h)) return h;
	if (kind === 'a' && /^mailto:/i.test(h)) return h;
	if (!h || h.startsWith('#') || /^[a-z][\w+.-]*:/i.test(h) || h.startsWith('//')) return null;
	if (doc?.source !== 'home' && !h.startsWith('/')) return null;
	const [file] = h.split(/[?#]/);
	let target;
	try {
		target = decodeURIComponent(file);
	} catch {
		return null;
	}
	if (!target.startsWith('/')) {
		const dir = doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/')) : '';
		target = join(dir, target);
		if (target === null) return null;
	}
	const markdown = /\.(md|markdown)$/i.test(target);
	if (kind === 'a' && markdown) return `/files?path=${encodeURIComponent(target)}`;
	return `/api/files?path=${encodeURIComponent(target)}`;
}

/** One block as safe HTML, in a template whose content is ready to place. */
export function renderBlock(block, links, doc) {
	const t = document.createElement('template');
	if (block.kind === 'front') {
		const pre = document.createElement('pre');
		pre.textContent = block.text;
		t.content.append(pre);
		return t;
	}
	const list = [block.token];
	list.links = links;
	const html = marked.parser(list, { gfm: true, breaks: false });
	t.innerHTML = DOMPurify.sanitize(html);
	allowlist(t.content);
	for (const el of t.content.querySelectorAll('[href]')) {
		const to = resolveLink(el.getAttribute('href'), doc, 'a');
		if (to === null) {
			el.removeAttribute('href');
			continue;
		}
		el.setAttribute('href', to);
		el.setAttribute('target', '_blank');
		el.setAttribute('rel', 'noreferrer');
	}
	for (const el of t.content.querySelectorAll('[src]')) {
		const to = resolveLink(el.getAttribute('src'), doc, 'img');
		if (to === null) el.removeAttribute('src');
		else el.setAttribute('src', to);
	}
	return t;
}

/** The elements a list's items or a table's rows became, in the order of `block.parts`. */
export function partElements(block, root) {
	if (block.kind === 'list') {
		const list = root.querySelector('ul, ol');
		return list ? [...list.children].filter((c) => c.tagName === 'LI') : [];
	}
	if (block.kind === 'table') {
		const head = root.querySelector('thead tr');
		const rows = [...root.querySelectorAll('tbody tr')];
		return head ? [head, ...rows] : rows;
	}
	return [];
}

/** The document's title: its first top-level heading, else the file's name. */
export function titleOf(blocks, name) {
	const h = blocks.find((b) => b.kind === 'heading' && b.token.depth === 1);
	return h ? h.token.text.replace(/[*_`]/g, '').trim() : name;
}
