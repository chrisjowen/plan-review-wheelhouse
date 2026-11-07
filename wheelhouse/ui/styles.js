/**
 * The page's styles. The element draws in the page's light DOM (so the
 * captain can select text in the document, and so Wheelhouse's own chat
 * classes reach it), so every rule starts at the element's tag. The document
 * reads as Wheelhouse's reader does (DocSheet.svelte): Newsreader headings,
 * Inter body, an easy measure. The review beside it is a chat thread drawn
 * with Wheelhouse's chat classes from its app.css (`bubble`,
 * `bubble-captain`, `reply-quote`, `chat-grid`); these rules only lay them
 * out. Only Wheelhouse's CSS variables, so it follows the light and dark
 * themes.
 */

const T = 'plan-review-page';

export const STYLE = `
${T} {
	display: block;
	color: var(--foreground);
	font-family: var(--font-sans);
	container-type: inline-size;
}
${T} *, ${T} *::before, ${T} *::after { box-sizing: border-box; }
${T} button { font: inherit; color: inherit; cursor: pointer; }
${T} button:disabled { cursor: default; }
${T} .pr { position: relative; }

/* The task, and its documents to pick from. */
${T} .top {
	display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem 1.5rem;
	margin-bottom: 1.25rem;
}
${T} .task { min-width: 0; flex: 0 1 34rem; }
${T} .task .label {
	display: grid; gap: 0.35rem; font-size: 0.75rem; letter-spacing: 0.06em;
	text-transform: uppercase; color: var(--muted-foreground);
}
${T} .task select {
	font: inherit; font-size: 1rem; letter-spacing: 0; text-transform: none;
	color: var(--foreground); background: var(--card); width: 100%;
	border: 1px solid var(--input); border-radius: var(--radius); padding: 0.5rem 0.75rem;
}
${T} .task .status {
	margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--muted-foreground);
	font-family: var(--font-mono, ui-monospace, monospace);
}
${T} .picker { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; padding-bottom: 0.2rem; }
${T} .chip {
	border: 1px solid var(--hair); background: transparent; border-radius: 999px;
	padding: 0.3rem 0.85rem; font-size: 0.875rem; color: var(--muted-foreground);
}
${T} .chip:hover { color: var(--foreground); background: var(--accent); }
${T} .chip[aria-pressed='true'] {
	color: var(--foreground); border-color: var(--bubble-captain-border, var(--border));
	background: var(--bubble-captain, var(--card));
}
${T} .chip .dot {
	display: inline-block; width: 0.4rem; height: 0.4rem; border-radius: 999px;
	background: var(--brass); margin-left: 0.4rem; vertical-align: 0.12em;
}
${T} .other {
	display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
	margin: -0.5rem 0 1.25rem;
}
${T} .other input {
	flex: 1 1 22rem; min-width: 0; font: inherit; font-family: var(--font-mono, ui-monospace, monospace);
	font-size: 0.85rem; padding: 0.5rem 0.9rem; border-radius: 999px;
	border: 1px solid var(--input); background: var(--card); color: var(--foreground);
}
${T} .other .hint { flex-basis: 100%; margin: 0; font-size: 0.8rem; color: var(--muted-foreground); }

/* The plan, and the review beside it as a chat thread. */
${T} .layout { display: grid; gap: 1.5rem; align-items: start; }
@container (min-width: 900px) {
	${T} .layout { grid-template-columns: minmax(0, 1fr) minmax(22rem, 26rem); }
	${T} .thread {
		position: sticky; top: 5.5rem; max-height: calc(100vh - 7rem);
	}
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
	background: var(--panel); border-radius: 0.75rem;
	padding: 0.65rem 0.9rem; font-size: 0.875rem; line-height: 1.5; margin: 0 0 1.5rem;
	display: flex; flex-wrap: wrap; gap: 0.6rem 0.75rem; align-items: center; justify-content: space-between;
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

/* A note under its lines, and the note being written: the captain's chat bubbles. */
${T} :is(.note, .composer) {
	display: flex; flex-direction: column; align-items: flex-end;
	margin: 0.75rem 0 0.35rem; font-family: var(--font-sans); font-style: normal;
	color: var(--foreground); list-style: none;
}
${T} :is(.note, .composer) .meta {
	display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.3rem;
	font-size: 0.8125rem; line-height: 1.25rem; color: var(--muted-foreground);
}
${T} .moved { color: var(--warning, var(--amber, var(--brass))); font-size: 0.8125rem; }
${T} :is(.note, .composer, .thread) .bubble {
	max-width: min(100%, 62ch); border-radius: 0.9rem; border-bottom-right-radius: 0.3rem;
	font-size: 0.975rem; line-height: 1.6;
}
${T} .bubble .text { margin: 0; white-space: pre-wrap; }
${T} .bubble .reply-quote { font-family: var(--font-sans); font-style: normal; }
${T} .composer .bubble { width: min(100%, 36rem); }
${T} .composer textarea {
	display: block; width: 100%; min-height: 4.5rem; margin: 0; padding: 0;
	font: inherit; color: inherit; background: transparent; border: 0; outline: 0; resize: vertical;
	white-space: pre-wrap;
}
${T} .composer textarea::placeholder { color: var(--muted-foreground); }
${T} .composer .bubble:focus-within { box-shadow: 0 0 0 2px color-mix(in oklab, var(--ring) 35%, transparent); }
${T} :is(.note, .composer, .msg) .actions {
	display: flex; gap: 0.25rem; align-items: center; justify-content: flex-end; margin: 0.3rem 0 0;
	font-size: 0.8125rem; color: var(--muted-foreground);
}
${T} textarea:focus-visible, ${T} input:focus-visible, ${T} button:focus-visible, ${T} select:focus-visible {
	outline: 2px solid var(--ring); outline-offset: 1px;
}
/* A box inside a bubble or the reply box: the box around it shows the focus. */
${T} :is(.composer, .box) textarea:focus-visible { outline: 0; }
${T} .count { margin-right: auto; font-size: 0.75rem; color: var(--muted-foreground); }

/* Buttons, rounded as the chat's are. */
${T} .pill {
	border-radius: 999px; padding: 0.4rem 1rem; font-size: 0.875rem; line-height: 1.25rem;
	border: 1px solid var(--border); background: var(--card); white-space: nowrap;
}
${T} .pill:hover:not(:disabled) { background: var(--accent); }
${T} .pill.primary { background: var(--foreground); color: var(--background); border-color: transparent; }
${T} .pill.primary:hover:not(:disabled) { background: var(--foreground); opacity: 0.88; }
${T} .pill:disabled { opacity: 0.4; }
${T} .quiet {
	border: 0; background: transparent; padding: 0.15rem 0.5rem; border-radius: 999px;
	font-size: 0.8125rem; color: var(--muted-foreground);
}
${T} .quiet:hover:not(:disabled) { color: var(--foreground); background: var(--accent); }
${T} .quiet:disabled { opacity: 0.4; }

/* The floating button over a selection. */
${T} .on-selection {
	position: absolute; z-index: 5; transform: translate(-50%, calc(-100% - 0.4rem));
	box-shadow: 0 4px 14px rgb(0 0 0 / 0.14);
}

/* The review: a chat thread of the captain's notes, and a reply box with the verdict and Send. */
${T} .thread {
	display: flex; flex-direction: column; min-height: 22rem;
	background: var(--background); border: 1px solid var(--hair); border-radius: var(--radius);
	overflow: hidden;
}
${T} .thread-head {
	padding: 0.85rem 1.1rem 0.75rem; border-bottom: 1px solid var(--hair); background: var(--card);
}
${T} .thread-head h2 {
	font-family: var(--font-display); font-weight: 500; font-size: 1.25rem; margin: 0;
}
${T} .thread-head .sub {
	margin: 0.1rem 0 0; font-size: 0.8125rem; color: var(--muted-foreground);
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
${T} .msgs {
	flex: 1 1 auto; overflow-y: auto; margin: 0; padding: 1rem 1rem 1.25rem; list-style: none;
	display: flex; flex-direction: column; gap: 0.9rem; min-height: 8rem;
	background-attachment: local;
}
${T} .msgs .aside {
	align-self: center; max-width: 30ch; text-align: center; margin: 0;
	font-size: 0.8125rem; line-height: 1.45; color: var(--muted-foreground);
	background: var(--background); border-radius: 999px; padding: 0.15rem 0.6rem;
}
${T} .msgs .msg > div { min-width: 0; max-width: 100%; }
${T} .msgs .msg .bubble { max-width: 100%; }
${T} .msgs .sent .bubble { opacity: 0.92; }
${T} .msgs .sent .actions { max-width: 32ch; text-align: right; line-height: 1.4; }
${T} .reply {
	border-top: 1px solid var(--hair); background: var(--card); padding: 0.75rem 0.9rem 0.85rem;
	display: grid; gap: 0.5rem;
}
${T} .caption {
	margin: 0; font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase;
	color: var(--muted-foreground);
}
${T} .verdict { display: flex; flex-wrap: wrap; gap: 0.4rem; }
${T} .verdict button {
	border-radius: 999px; padding: 0.4rem 1rem; font-size: 0.9rem;
	border: 1px solid var(--border); background: var(--background);
}
${T} .verdict button:hover:not(:disabled) { background: var(--accent); }
${T} .verdict button[aria-checked='true'] {
	background: var(--bubble-captain, var(--accent)); border-color: var(--bubble-captain-border, var(--border));
	font-weight: 500;
}
${T} .verdict button[aria-checked='true']::before { content: '✓ '; }
${T} .verdict button[aria-checked='true'].approve { box-shadow: inset 0 0 0 1px var(--success); }
${T} .verdict button[aria-checked='true'].changes { box-shadow: inset 0 0 0 1px var(--brass); }
${T} .box {
	display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.4rem 0.4rem 0.4rem 0.85rem;
	border: 1px solid var(--input); border-radius: var(--radius); background: var(--card);
	box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
${T} .box:focus-within { box-shadow: 0 0 0 2px color-mix(in oklab, var(--ring) 30%, transparent); }
${T} .box textarea {
	flex: 1; min-width: 0; min-height: 2.5rem; max-height: 12rem; padding: 0.45rem 0; margin: 0;
	font: inherit; font-size: 1rem; line-height: 1.55; color: var(--foreground);
	background: transparent; border: 0; outline: 0; resize: none; field-sizing: content;
}
${T} .box textarea::placeholder { color: var(--muted-foreground); }
${T} .send {
	flex-shrink: 0; width: 2.25rem; height: 2.25rem; border-radius: 999px; border: 0; padding: 0;
	display: grid; place-items: center; background: var(--foreground); color: var(--background);
	transition: opacity 120ms ease;
}
${T} .send:disabled { opacity: 0.3; }
${T} .why { font-size: 0.8125rem; line-height: 1.45; color: var(--muted-foreground); margin: 0; }
${T} .why:empty { display: none; }
${T} .why.error { color: var(--danger, var(--destructive)); }
${T} .reply .banner { margin: 0; }
${T} .foot { display: flex; justify-content: flex-end; margin-top: -0.25rem; }

/* On a narrow page the review sits under the document; this bar keeps Send in view. */
${T} .dock {
	position: sticky; bottom: 0; z-index: 4; margin-top: 1rem;
	display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;
	padding: 0.5rem 0.5rem 0.5rem 1.1rem; border: 1px solid var(--border);
	border-radius: 999px; background: var(--card);
	box-shadow: 0 -4px 16px rgb(0 0 0 / 0.08);
}
${T} .dock[hidden], ${T} .dock.aside { display: none; }
${T} .dock .summary { font-size: 0.875rem; color: var(--muted-foreground); }
@container (min-width: 900px) { ${T} .dock { display: none; } }

@container (max-width: 560px) {
	${T} .sheet { padding: 1.5rem 1rem 2rem 2.75rem; }
	${T} .u > .gutter { left: -2.6rem; width: 2.3rem; }
	${T} li.u > .gutter { left: calc(-1.5em - 2.6rem); }
	${T} .ln { display: none; }
}
`;
