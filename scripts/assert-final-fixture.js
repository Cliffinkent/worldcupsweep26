const assert = require('node:assert/strict');
const { getBroadcastForFixture } = require('../src/data/broadcasts');
const {
  ensureFinalFixture,
  createFinalFixturePlaceholder,
  isFinalFixture
} = require('../src/data/finalFixture');

const withoutFinal = ensureFinalFixture([
  {
    id: 'sf1',
    round: 'Semi-finals',
    matchNumber: 101,
    utcDate: '2026-07-14T19:00:00.000Z',
    homeTeam: 'France',
    awayTeam: 'Spain'
  }
]);

assert.equal(withoutFinal.length, 2);
assert.equal(isFinalFixture(withoutFinal[1]), true);
assert.equal(withoutFinal[1].isPlaceholder, true);
assert.equal(withoutFinal[1].homePlaceholder, 'Winner Match 101');
assert.equal(withoutFinal[1].awayPlaceholder, 'Winner Match 102');
assert.deepEqual(getBroadcastForFixture(withoutFinal[1]), {
  id: 'bbc',
  name: 'BBC',
  channel: 'BBC iPlayer',
  logo: '/assets/broadcasters/bbc.svg'
});

const withUndecidedFinal = ensureFinalFixture([
  {
    id: 'final-provider',
    round: 'Final',
    utcDate: '2026-07-19T19:00:00.000Z',
    homeTeam: null,
    awayTeam: null,
    status: 'scheduled'
  }
]);

assert.equal(withUndecidedFinal.length, 1);
assert.equal(withUndecidedFinal[0].id, 'final-provider');
assert.equal(withUndecidedFinal[0].matchNumber, 104);
assert.equal(withUndecidedFinal[0].isPlaceholder, true);
assert.equal(withUndecidedFinal[0].homePlaceholder, 'Winner Match 101');

const decidedFinal = {
  id: 'final-decided',
  round: 'Final',
  matchNumber: 104,
  utcDate: '2026-07-19T19:00:00.000Z',
  homeTeam: 'France',
  awayTeam: 'England',
  status: 'scheduled'
};
const withDecidedFinal = ensureFinalFixture([decidedFinal]);

assert.equal(withDecidedFinal.length, 1);
assert.equal(withDecidedFinal[0].isPlaceholder, undefined);
assert.equal(withDecidedFinal[0].homeTeam, 'France');
assert.equal(withDecidedFinal[0].awayTeam, 'England');

const blank = ensureFinalFixture(null);
assert.equal(blank.length, 1);
assert.deepEqual(blank[0], createFinalFixturePlaceholder());

console.log('final fixture assertions passed');
