/**
 * The section's styles. The element draws in the page's light DOM (so the
 * captain can select text in the document), so every rule starts at the
 * element's tag. The document itself reads as Wheelhouse's reader does
 * (DocSheet.svelte): Newsreader headings, Inter body, an easy measure. Only
 * Wheelhouse's CSS variables, so it follows the light and dark themes.
 */

const T = 'plan-review-section';

export const STYLE = `
${T} {
	display: block;
	color: var(--foreground);
	font-family: var(--font-sans);
	container-type: inline-size;
}
${T} *, ${T} *::before, ${T} *::after { box-sizing: border-box; }
${T} button { font: inherit; color: inherit; cursor: pointer; }
${T} .pr { position: relative; }

/* The documents to pick from. */
${T} .picker {
	display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
	margin-bottom: 1rem;
}
${T} .picker .label {
	font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase;
	color: var(--muted-foreground); margin-right: 0.35rem;
}
${T} .chip {
	border: 1px solid var(--hair); background: transparent; border-radius: 999px;
	padding: 0.25rem 0.8rem; font-size: 0.85rem; color: var(--muted-foreground);
}
${T} .chip:hover { color: var(--foreground); background: var(--accent); }
${T} .chip[aria-pressed='true'] {
	color: var(--foreground); border-color: var(--border); background: var(--card);
	box-shadow: 0 1px 0 var(--hair);
}
${T} .chip .dot {
	display: inline-block; width: 0.4rem; height: 0.4rem; border-radius: 999px;
	background: var(--brass); margin-left: 0.4rem; vertical-align: 0.12em;
}
${T} .other {
	display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
	margin: -0.25rem 0 1rem;
}
${T} .other input {
	flex: 1 1 22rem; min-width: 0; font: inherit; font-family: var(--font-mono, ui-monospace, monospace);
	font-size: 0.85rem; padding: 0.45rem 0.7rem; border-radius: calc(var(--radius) - 2px);
	border: 1px solid var(--input); background: var(--background); color: var(--foreground);
}
${T} .other .hint { flex-basis: 100%; font-size: 0.8rem; color: var(--muted-foreground); }

/* The sheet and the review beside it. */
${T} .layout { display: grid; gap: 1.5rem; align-items: start; }
@container (min-width: 880px) {
	${T} .layout { grid-template-columns: minmax(0, 1fr) 18rem; }
	${T} .panel { position: sticky; top: 7.5rem; }
}
${T} .sheet {
	background: var(--card); color: var(--card-foreground);
	border: 1px solid var(--hair); border-radius: var(--radius);
	padding: 2.25rem 1.5rem 3rem 4rem; min-width: 0;
}
${T} .sheet-inner { max-width: 70ch; margin: 0 auto; }
${T} .sheet header { border-bottom: 1px solid var(--hair); padding-bottom: 1.25rem; margin-bottom: 1.75rem; }
${T} .kicker {
	font-family: var(--font-display); font-size: 1.05rem; letter-spacing: 0.1em;
	font-variant-caps: all-small-caps; color: var(--muted-foreground); margin: 0;
}
${T} .sheet h1.title {
	font-family: var(--font-display); font-weight: 500; font-size: 2.1rem; line-height: 1.15;
	margin: 0.4rem 0 0; text-wrap: balance;
}
${T} .source {
	margin: 0.6rem 0 0; font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.75rem;
	color: var(--muted-foreground); word-break: break-all;
}
${T} .how { margin: 0.75rem 0 0; font-size: 0.85rem; color: var(--muted-foreground); }
${T} .banner {
	border: 1px solid var(--hair); border-left: 3px solid var(--amber, var(--brass));
	background: var(--panel); border-radius: calc(var(--radius) - 2px);
	padding: 0.6rem 0.9rem; font-size: 0.875rem; margin: 0 0 1.5rem;
	display: flex; gap: 0.75rem; align-items: baseline; justify-content: space-between;
}
${T} .empty { color: var(--muted-foreground); font-size: 0.95rem; }

/* A part of the document that takes a note: its line and a + in the gutter. */
${T} .u { position: relative; border-radius: 0.3rem; }
${T} .u > .gutter, ${T} li.u > .gutter {
	position: absolute; top: 0.15em; left: -3.5rem; width: 3rem;
	display: flex; align-items: center; justify-content: flex-end; gap: 0.2rem;
	user-select: none; -webkit-user-select: none;
}
${T} li.u > .gutter { left: calc(-1.5em - 3.5rem); }
${T} .ln {
	font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.7rem;
	color: var(--muted-foreground); opacity: 0.55; line-height: 1.75rem;
}
${T} .add {
	width: 1.4rem; height: 1.4rem; border-radius: 0.35rem; border: 1px solid var(--border);
	background: var(--background); color: var(--sea); font-size: 0.95rem; line-height: 1;
	display: grid; place-items: center; padding: 0; opacity: 0;
	transition: opacity 120ms ease;
}
${T} .u:hover > .gutter .add, ${T} .add:focus-visible { opacity: 1; }
${T} .u:hover > .gutter .ln { opacity: 1; }
@media (hover: none) { ${T} .add { opacity: 0.7; } }
${T} .add:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
${T} .u.noted > .gutter .ln { color: var(--brass); opacity: 1; font-weight: 600; }
${T} .u.flash { animation: plan-review-flash 1.2s ease; }
@keyframes plan-review-flash { from { background: var(--accent); } to { background: transparent; } }
@media (prefers-reduced-motion: reduce) { ${T} .u.flash { animation: none; } }

/* The document, as Wheelhouse's reader draws it. */
${T} .doc { font-size: 1.0625rem; line-height: 1.75; overflow-wrap: break-word; }
${T} .doc > * + * { margin-top: 1.1em; }
${T} .doc :is(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4, h5, h6, hr, dl, figure) { margin-bottom: 0; }
${T} .doc :is(.u, .u-list) > .c > * { margin-top: 0; margin-bottom: 0; }
${T} .doc .u > .c > * + * { margin-top: 1.1em; }
${T} .doc :is(h1, h2, h3, h4) {
	font-family: var(--font-display); font-weight: 500; line-height: 1.25; text-wrap: balance;
}
${T} .doc .u:has(> .c > :is(h1, h2, h3, h4)) .gutter { top: 0.35em; }
${T} .doc h1 { font-size: 1.9rem; }
${T} .doc .u:has(> .c > h1) { margin-top: 2em; }
${T} .doc h2 { font-size: 1.6rem; padding-bottom: 0.3em; border-bottom: 1px solid var(--hair); }
${T} .doc .u:has(> .c > h2) { margin-top: 2.2em; }
${T} .doc h3 { font-size: 1.3rem; }
${T} .doc .u:has(> .c > h3) { margin-top: 1.8em; }
${T} .doc h4 { font-size: 1.1rem; }
${T} .doc .u:has(> .c > :is(h2, h3, h4)) + .u { margin-top: 0.6em; }
${T} .doc > :first-child { margin-top: 0; }
${T} .doc a { color: var(--sea); text-decoration: underline; text-underline-offset: 2px; }
${T} .doc strong { font-weight: 600; }
${T} .doc ul { list-style: disc; padding-left: 1.5em; }
${T} .doc ol { list-style: decimal; padding-left: 1.5em; }
${T} .doc li + li, ${T} .doc li > :is(ul, ol) { margin-top: 0.35em; }
${T} .doc li::marker { color: var(--muted-foreground); }
${T} .doc :not(pre) > code {
	font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.85em;
	background: var(--muted); border-radius: 0.3rem; padding: 0.1em 0.35em;
}
${T} .doc pre {
	font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.85rem; line-height: 1.6;
	background: var(--panel); border: 1px solid var(--hair); border-radius: 0.5rem;
	padding: 0.9rem 1.1rem; overflow-x: auto; white-space: pre;
}
${T} .doc blockquote {
	border-left: 3px solid var(--brass); padding: 0.1em 0 0.1em 1.1em;
	font-family: var(--font-display); font-size: 1.15rem; font-style: italic;
	color: var(--muted-foreground);
}
${T} .doc table {
	display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse;
	font-size: 0.95rem; line-height: 1.5;
}
${T} .doc :is(th, td) {
	border-bottom: 1px solid var(--hair); padding: 0.55em 1em 0.55em 0;
	text-align: left; vertical-align: top;
}
${T} .doc th { font-weight: 600; border-bottom: 2px solid var(--hair); white-space: nowrap; }
${T} .doc hr { border: 0; border-top: 1px solid var(--hair); margin: 2.2em 0; }
${T} .doc img { max-width: 100%; border-radius: 0.4rem; }
${T} .doc .front pre { color: var(--muted-foreground); }

/* A note in the document, and the box to write one. */
${T} .note, ${T} .composer {
	margin: 0.75rem 0 0.25rem; padding: 0.7rem 0.9rem; border-radius: calc(var(--radius) - 2px);
	border: 1px solid var(--hair); border-left: 3px solid var(--brass); background: var(--panel);
	font-family: var(--font-sans); font-size: 0.925rem; line-height: 1.55; font-style: normal;
	color: var(--foreground); list-style: none;
}
${T} .note .meta, ${T} .composer .meta {
	font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase;
	color: var(--muted-foreground); display: flex; gap: 0.5rem; align-items: baseline;
}
${T} .note .meta .moved { color: var(--warning, var(--amber)); text-transform: none; letter-spacing: 0; }
${T} .quote {
	margin: 0.35rem 0 0; font-family: var(--font-display); font-style: italic;
	color: var(--muted-foreground); font-size: 0.975rem;
}
${T} .note .text { margin: 0.35rem 0 0; white-space: pre-wrap; }
${T} .note .actions, ${T} .composer .actions { display: flex; gap: 0.25rem; margin-top: 0.5rem; align-items: center; }
${T} .composer textarea, ${T} .panel textarea {
	display: block; width: 100%; margin-top: 0.5rem; font: inherit; font-size: 0.925rem;
	padding: 0.5rem 0.65rem; border-radius: calc(var(--radius) - 2px); resize: vertical;
	border: 1px solid var(--input); background: var(--background); color: var(--foreground);
}
${T} .composer textarea { min-height: 4.5rem; }
${T} textarea:focus-visible, ${T} input:focus-visible, ${T} button:focus-visible {
	outline: 2px solid var(--ring); outline-offset: 1px;
}
${T} .count { margin-left: auto; font-size: 0.75rem; color: var(--muted-foreground); }

/* Buttons. */
${T} .btn {
	border-radius: calc(var(--radius) - 2px); padding: 0.4rem 0.85rem; font-size: 0.875rem;
	border: 1px solid var(--border); background: var(--background);
}
${T} .btn:hover:not(:disabled) { background: var(--accent); }
${T} .btn.primary {
	background: var(--primary); color: var(--primary-foreground); border-color: transparent;
}
${T} .btn.primary:hover:not(:disabled) { background: var(--primary); opacity: 0.92; }
${T} .btn:disabled { opacity: 0.5; cursor: default; }
${T} .quiet {
	border: 0; background: transparent; padding: 0.15rem 0.4rem; border-radius: 0.3rem;
	font-size: 0.8rem; color: var(--muted-foreground);
}
${T} .quiet:hover { color: var(--foreground); background: var(--accent); }

/* The floating button over a selection. */
${T} .on-selection {
	position: absolute; z-index: 5; transform: translate(-50%, calc(-100% - 0.4rem));
	box-shadow: 0 2px 10px rgb(0 0 0 / 0.12); white-space: nowrap;
}

/* The review: notes, verdict and send. */
${T} .panel {
	background: var(--card); border: 1px solid var(--hair); border-radius: var(--radius);
	padding: 1.1rem 1.1rem 1.25rem;
}
${T} .panel h2 {
	font-family: var(--font-display); font-weight: 500; font-size: 1.25rem; margin: 0;
}
${T} .panel .sub { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--muted-foreground); }
${T} .panel .list { list-style: none; padding: 0; margin: 0.9rem 0 0; display: grid; gap: 0.15rem; }
${T} .panel .list button {
	display: block; width: 100%; text-align: left; border: 0; background: transparent;
	padding: 0.4rem 0.5rem; border-radius: 0.35rem; font-size: 0.85rem; line-height: 1.4;
}
${T} .panel .list button:hover { background: var(--accent); }
${T} .panel .list .where {
	display: block; font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase;
	color: var(--muted-foreground);
}
${T} .panel .list .what {
	display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
${T} .panel .hint { margin: 0.9rem 0 0; font-size: 0.85rem; color: var(--muted-foreground); line-height: 1.5; }
${T} .panel .caption {
	margin: 1.25rem 0 0; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase;
	color: var(--muted-foreground);
}
${T} .verdict { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.5rem; }
${T} .verdict button {
	border: 1px solid var(--border); background: var(--background);
	border-radius: calc(var(--radius) - 2px); padding: 0.5rem 0.4rem; font-size: 0.85rem;
}
${T} .verdict button:hover { background: var(--accent); }
${T} .verdict button[aria-checked='true'].approve {
	border-color: var(--success); box-shadow: inset 0 0 0 1px var(--success);
}
${T} .verdict button[aria-checked='true'].changes {
	border-color: var(--brass); box-shadow: inset 0 0 0 1px var(--brass);
}
${T} .panel textarea { min-height: 5rem; }
${T} .send { margin-top: 1rem; display: grid; gap: 0.5rem; }
${T} .send .btn { width: 100%; padding: 0.55rem; }
${T} .why { font-size: 0.8rem; color: var(--muted-foreground); margin: 0; }
${T} .panel > .why { margin-top: 0.75rem; }
${T} .why.error { color: var(--danger, var(--destructive)); }
${T} .sent {
	margin-top: 1rem; padding: 0.6rem 0.75rem; border-radius: calc(var(--radius) - 2px);
	background: var(--panel); border: 1px solid var(--hair); font-size: 0.85rem; line-height: 1.5;
}
${T} .sent strong { font-weight: 600; }
${T} .foot { margin-top: 0.75rem; display: flex; justify-content: flex-end; }

/* On a narrow page the review sits under the document; this bar keeps Send in view. */
${T} .dock {
	position: sticky; bottom: 0; z-index: 4; margin-top: 1rem;
	display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;
	padding: 0.6rem 0.75rem 0.6rem 1rem; border: 1px solid var(--border);
	border-radius: var(--radius); background: var(--card);
	box-shadow: 0 -4px 16px rgb(0 0 0 / 0.08);
}
${T} .dock[hidden], ${T} .dock.aside { display: none; }
${T} .dock .summary { font-size: 0.875rem; color: var(--muted-foreground); }
@container (min-width: 880px) { ${T} .dock { display: none; } }

@container (max-width: 560px) {
	${T} .sheet { padding: 1.5rem 1rem 2rem 2.75rem; }
	${T} .u > .gutter { left: -2.6rem; width: 2.3rem; }
	${T} li.u > .gutter { left: calc(-1.5em - 2.6rem); }
	${T} .ln { display: none; }
}
`;
