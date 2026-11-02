import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reviewRecords, verbatim } from './engine.mjs';

const fixtures = JSON.parse(await readFile(new URL('./public/recorded.json', import.meta.url), 'utf8'));
const expected = { 'direction-conflict': 'conflict', 'explicit-acceptance': 'agreed', 'information-request': 'clarify', 'reversed-counteroffer': 'conflict', 'missing-price': 'incomplete' };
assert.equal(fixtures.length, 5);
for (const fixture of fixtures) {
  const review = reviewRecords(fixture.input, fixture.review.raw);
  assert.equal(review.kind, expected[fixture.id]);
  assert.equal(review.payer, 'NorthWorks');
  for (const evidence of review.evidence) {
    assert.equal(Array.from(review.source).slice(evidence.start, evidence.end).join(''), evidence.value);
    assert.ok(['Loopline', 'NorthWorks'].includes(evidence.author));
  }
}
const source = fixtures[0].review.source;
const compass = Array.from(source).indexOf('🧭');
assert.equal(verbatim(source, { value: '🧭', start: compass, end: compass + 1 }).value, '🧭');
assert.equal(verbatim(source, { value: '🧭', start: compass + 1, end: compass + 2 }), null);
const publicText = JSON.stringify(fixtures);
assert.equal(/api_key|input_tokens|modelMs|x-clocked-cost/i.test(publicText), false);
console.log('PASS: five native fixtures, author-bound Unicode source spans, open price, and public output shape.');
