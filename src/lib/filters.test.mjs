// Self-check for the trickiest ported logic (filtered/derivePeople/capGapNote/toCSV).
// Run: node --test src/lib/filters.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtered, derivePeople, capGapNote, capped, internalSet } from './filters.js';
import { toCSV } from './csv.js';

const D = {
  issues: [
    { number: 1, title: 'a', state: 'open', labels: [], author: 'alice', assignees: ['alice'],
      comments: 0, internal_comments: 0, created_at: '2024-01-01', updated_at: '2024-01-01',
      closed_by: null, commenters: [] },
    { number: 2, title: 'b', state: 'closed', labels: [], author: 'bob', assignees: ['alice', 'bob'],
      comments: 2, internal_comments: 1, created_at: '2024-02-01', updated_at: '2024-02-05',
      closed_by: 'bob', commenters: ['alice'] },
    { number: 3, title: 'c', state: 'open', labels: [], author: 'bob', assignees: [],
      comments: 1, internal_comments: 0, created_at: '2024-03-01', updated_at: '2024-03-01',
      closed_by: null, commenters: ['alice'] },
  ],
};

test('filtered: state filter', () => {
  assert.equal(filtered(D, { state: 'open' }).length, 2);
  assert.equal(filtered(D, { state: 'closed' }).length, 1);
  assert.equal(filtered(D, { state: 'all' }).length, 3);
});

test('filtered: peopleScope ignores focusTest, non-peopleScope honours it', () => {
  const focusTest = i => i.number === 1;
  assert.equal(filtered(D, { state: 'all', focusTest, peopleScope: false }).length, 1);
  assert.equal(filtered(D, { state: 'all', focusTest, peopleScope: true }).length, 3);
});

test('filtered: peopleScope applies assignee filter, non-peopleScope ignores it even if asg passed', () => {
  assert.equal(filtered(D, { state: 'all', asg: ['alice'], peopleScope: true }).length, 2);
  assert.equal(filtered(D, { state: 'all', asg: ['alice'], peopleScope: false }).length, 3);
});

test('filtered: withDate can be forced independent of peopleScope', () => {
  const rows = filtered(D, { state: 'all', peopleScope: false, withDate: true, from: '2024-02-01', to: '2024-02-28' });
  assert.deepEqual(rows.map(i => i.number), [2]);
});

test('derivePeople: aggregates authored/assigned/comments/closed_by_them per login', () => {
  const INT = internalSet([]);
  const people = derivePeople(D.issues, INT);
  const alice = people.find(p => p.login === 'alice');
  const bob = people.find(p => p.login === 'bob');
  assert.equal(alice.authored, 1);
  assert.equal(alice.assigned_total, 2);
  assert.equal(alice.comments, 2);        // commenter on issue 2 and 3
  assert.equal(bob.authored, 2);
  assert.equal(bob.closed_by_them, 1);
  assert.equal(bob.self_closed, 1);       // bob authored #2 and closed it himself
});

test('capGapNote: empty when expected matches loaded, note otherwise', () => {
  assert.equal(capGapNote(5, 5, 'card', 1500), '');
  assert.equal(capGapNote(null, 5, 'card', 1500), '');
  assert.match(capGapNote(10, 5, 'card', 1500), /card counts 10 repo-wide; 5 sit outside/);
});

test('capped: shows the "top N of M" note only when truncated', () => {
  assert.match(capped(25, 25), /^25 shown/);
  assert.match(capped(25, 40), /^top 25 of 40 selected/);
});

test('toCSV: quotes fields containing commas/quotes/newlines', () => {
  const csv = toCSV([{ n: 1, t: 'has, comma' }, { n: 2, t: 'has "quote"' }],
    [['N', r => r.n], ['T', r => r.t]]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'N,T');
  assert.equal(lines[1], '1,"has, comma"');
  assert.equal(lines[2], '2,"has ""quote"""');
});
