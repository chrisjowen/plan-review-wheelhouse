import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import plugin from '../wheelhouse/server/index.js';
import { VENDORED } from '../scripts/vendor.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../.wheelhouse-plugin/plugin.json'));
// A copy of Wheelhouse's packages/plugin-sdk/plugin.schema.json.
const schema = JSON.parse(read('./fixtures/plugin.schema.json'));

describe('the manifest', () => {
	it('follows the Wheelhouse plugin schema', () => {
		const validate = new Ajv2020({ strict: false }).compile(schema);
		assert.ok(validate(manifest), JSON.stringify(validate.errors));
	});

	it('is off until turned on, and names entries that exist', () => {
		assert.equal(manifest.wheelhouse.enabledByDefault, false);
		assert.ok(existsSync(new URL(`../${manifest.wheelhouse.server}`, import.meta.url)));
		assert.ok(existsSync(new URL(`../${manifest.wheelhouse.ui}`, import.meta.url)));
	});

	it('asks for the feedback capability, the one way it sends anything', () => {
		assert.deepEqual(manifest.wheelhouse.capabilities, ['feedback']);
		assert.equal(plugin.capabilities, undefined, 'capabilities are the manifest’s alone');
		assert.equal(plugin.services, undefined);
	});

	it('lists exactly what the server entry contributes', () => {
		assert.deepEqual(
			plugin.contributions.map((c) => ({ id: c.id, slot: c.slot })),
			manifest.wheelhouse.contributions
		);
		for (const c of plugin.contributions) {
			assert.ok(plugin.providers.some((p) => p.id === c.provider));
			// An installed plugin's element tag starts with its id and a dash.
			assert.ok(c.render.element.startsWith(`${manifest.name}-`));
		}
	});

	it('stays within the provider limits Wheelhouse allows', () => {
		for (const p of plugin.providers) {
			assert.equal(p.scope, 'task');
			assert.ok(p.timeoutMs <= 10_000);
		}
	});

	it('agrees with package.json on the version', () => {
		const pkg = JSON.parse(read('../package.json'));
		assert.equal(pkg.version, manifest.version);
	});
});

describe('the vendored Markdown libraries', () => {
	it('are exactly the pinned versions in node_modules (npm run vendor)', () => {
		const pkg = JSON.parse(read('../package.json'));
		// The versions Wheelhouse's own reader renders with.
		assert.equal(pkg.devDependencies.marked, '16.4.2');
		assert.equal(pkg.devDependencies.dompurify, '3.4.17');
		for (const [from, to] of VENDORED) {
			assert.equal(
				read(`../wheelhouse/ui/vendor/${to}`),
				read(`../node_modules/${from}`),
				`wheelhouse/ui/vendor/${to} is out of date: npm run vendor`
			);
		}
	});
});
