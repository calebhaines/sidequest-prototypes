'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const generated = path.resolve(__dirname, '../generated');
const manifest = JSON.parse(fs.readFileSync(path.join(generated, 'products.json'), 'utf8'));
const products = manifest.products;
assert.equal(products.length, 42, 'All18 instruments,22 inserts, channel EQ and mastering are required');
assert.equal(products.filter(value => value.kind === 'instrument').length, 18);
assert.equal(products.filter(value => value.kind === 'effect').length, 24);
for (const key of ['id', 'code', 'bundleId']) assert.equal(new Set(products.map(value => value[key])).size, products.length, 'Unique plugin ' + key);
const source = fs.readFileSync(path.join(generated, 'runtime.js'), 'utf8'); new vm.Script(source, { filename: 'runtime.js' });
for (const product of products) {
  assert(product.parameters.length > 0, product.id + ' needs functioning host controls');
  assert.equal(new Set(product.parameters.map(value => value.path)).size, product.parameters.length);
  for (const parameter of product.parameters) assert(Number.isFinite(parameter.defaultNormalized) && parameter.defaultNormalized >= 0 && parameter.defaultNormalized <= 1, product.id + ':' + parameter.path);
  const html = fs.readFileSync(path.join(generated, 'ui', product.id + '.html'), 'utf8');
  assert(html.includes('KitchenPluginDescriptor') && html.includes('KitchenPluginNative'), product.id + ' native editor');
  assert(!html.includes('<!-- KITCHEN_EFFECT_SCRIPTS -->'));
  if (product.defaultStateResource) assert(fs.existsSync(path.join(generated, 'assets', product.id, product.defaultStateResource + '.gz')));
}
console.log('PASS42 unique products, canonical source packing, native parameter metadata and preserved editor resources');
