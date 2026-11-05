import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { page, PLAN } from './dom.js';

const window = page();
let doc;
before(async () => {
	doc = await import('../wheelhouse/ui/doc.js');
});
after(async () => {
	window.close();
});

const HOME = { path: 'data/lumen-plan/plan.md', source: 'home' };
const html = (src, d = HOME) => {
	const { blocks, links } = doc.parse(src);
	return blocks
		.map((b) => {
			const div = document.createElement('div');
			div.append(doc.renderBlock(b, links, d).content);
			return div.innerHTML;
		})
		.join('');
};

describe('reading a plan into parts', () => {
	it('knows the lines of each block, list item and table row', () => {
		const { blocks } = doc.parse(PLAN);
		assert.deepEqual(
			blocks.map((b) => [b.kind, b.from, b.to]),
			[
				['heading', 1, 1],
				['paragraph', 3, 3],
				['heading', 5, 5],
				['list', 7, 10],
				['heading', 12, 12],
				['table', 14, 17],
				['code', 19, 21]
			]
		);
		const list = blocks[3];
		assert.deepEqual(
			list.parts.map((p) => [p.from, p.to]),
			[
				[7, 7],
				[8, 9],
				[10, 10]
			]
		);
		assert.deepEqual(
			blocks[5].parts.map((p) => [p.from, p.to]),
			[
				[14, 15],
				[16, 16],
				[17, 17]
			]
		);
		assert.equal(doc.titleOf(blocks, 'plan.md'), 'Share links for boards');
	});

	it('counts front matter, Windows line ends and link definitions as lines of the file', () => {
		const src =
			'---\ntitle: x\n---\n\nIntro\r\n\r\n[a]: https://example.com\r\n\r\nSee [the doc][a].\r\n';
		const { blocks } = doc.parse(src);
		assert.deepEqual(
			blocks.map((b) => [b.kind, b.from, b.to]),
			[
				['front', 1, 3],
				['paragraph', 5, 5],
				['paragraph', 9, 9]
			]
		);
		assert.match(html(src), /<a href="https:\/\/example\.com"[^>]*>the doc<\/a>/);
		assert.equal(doc.titleOf(blocks, 'plan.md'), 'plan.md');
	});

	it('renders as Wheelhouse’s reader does: GitHub-flavoured, nothing that runs', () => {
		const out = html(
			[
				'Hello <script>alert(1)</script><img src=x onerror="alert(2)"> <b style="color:red">bold</b>',
				'',
				'[run](javascript:alert(3)) [web](https://example.com/a) <span class="x">s</span>',
				'',
				'- [x] done',
				'',
				'<iframe src="https://evil.example"></iframe><form><input type="text"></form>',
				'',
				'```js',
				'const a = 1;',
				'```'
			].join('\n')
		);
		assert.doesNotMatch(out, /script|onerror|style=|iframe|javascript:|<form|type="text"/);
		assert.match(out, /<b>bold<\/b>/);
		assert.match(out, /<a>run<\/a>/);
		assert.match(
			out,
			/<a href="https:\/\/example\.com\/a" target="_blank" rel="noreferrer">web<\/a>/
		);
		assert.match(out, /<span>s<\/span>/);
		assert.match(out, /<input[^>]*checked[^>]*disabled/);
		assert.match(out, /<code class="language-js">/);
	});

	it('opens files next to a plan in the home through Wheelhouse’s reader, and drops the rest', () => {
		const src =
			'[spec](spec.md) [up](../other/report.md) [log](notes.txt) ![shot](img/a.png) [top](../../../x.md) [abs](/Users/me/firstmate/data/x/plan.md) [here](#steps)';
		const out = html(src);
		assert.match(out, /href="\/files\?path=data%2Flumen-plan%2Fspec\.md"/);
		assert.match(out, /href="\/files\?path=data%2Fother%2Freport\.md"/);
		assert.match(out, /href="\/api\/files\?path=data%2Flumen-plan%2Fnotes\.txt"/);
		assert.match(out, /src="\/api\/files\?path=data%2Flumen-plan%2Fimg%2Fa\.png"/);
		assert.match(out, /href="\/files\?path=%2FUsers%2Fme%2Ffirstmate%2Fdata%2Fx%2Fplan\.md"/);
		assert.match(out, /<a>top<\/a>/);
		assert.match(out, /<a>here<\/a>/);
		// A worktree's file cannot be found from the home, so its relative links go.
		const task = html('[spec](spec.md) [web](https://example.com)', {
			path: 'docs/plan.md',
			source: 'task'
		});
		assert.match(task, /<a>spec<\/a>/);
		assert.match(task, /href="https:\/\/example\.com"/);
	});

	it('finds the elements a list’s items and a table’s rows became', () => {
		const { blocks, links } = doc.parse(PLAN);
		const div = document.createElement('div');
		div.append(doc.renderBlock(blocks[3], links, HOME).content);
		const items = doc.partElements(blocks[3], div);
		assert.equal(items.length, 3);
		assert.match(items[1].textContent, /share.*route.*Links expire/s);
		const t = document.createElement('div');
		t.append(doc.renderBlock(blocks[5], links, HOME).content);
		const rows = doc.partElements(blocks[5], t);
		assert.deepEqual(
			rows.map((r) => r.textContent.trim().split(/\s+/)[0]),
			['Risk', 'Leaked', 'Slow']
		);
	});
});
