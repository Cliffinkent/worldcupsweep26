const assert = require('node:assert/strict');
const { getBroadcastForFixture, resolveMatchNumber } = require('../src/data/broadcasts');

function fixture(overrides = {}) {
  return {
    round: 'Round of 32',
    status: 'scheduled',
    ...overrides
  };
}

const BBC = {
  id: 'bbc',
  name: 'BBC',
  channel: 'BBC iPlayer',
  logo: '/assets/broadcasters/bbc.svg'
};

const ITV = {
  id: 'itv',
  name: 'ITV',
  channel: 'ITVX',
  logo: '/assets/broadcasters/itv.svg'
};

assert.equal(resolveMatchNumber(fixture({
  utcDate: '2026-06-28T19:00:00.000Z',
  round: 'Round of 32'
})), 73);

assert.equal(resolveMatchNumber(fixture({
  matchNumber: 80,
  round: 'Round of 32'
})), 80);

assert.equal(resolveMatchNumber(fixture({
  rawRound: 'Match 74 - Round of 32',
  round: 'Round of 32'
})), 74);

assert.equal(resolveMatchNumber(fixture({
  utcDate: '2026-07-04T17:00:00.000Z',
  round: 'Round of 16'
})), 90);

assert.equal(resolveMatchNumber(fixture({
  utcDate: '2026-07-14T19:00:00.000Z',
  round: 'Semi-finals'
})), 101);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-06-28T19:00:00.000Z',
  homeTeam: 'South Africa',
  awayTeam: 'Canada',
  round: 'Round of 32'
})), ITV);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-01T16:00:00.000Z',
  homeTeam: 'England',
  awayTeam: 'DR Congo',
  round: 'Round of 32'
})), BBC);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-04T17:00:00.000Z',
  homeTeam: 'Canada',
  awayTeam: 'Morocco',
  round: 'Round of 16'
})), ITV);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-04T21:00:00.000Z',
  homeTeam: 'Paraguay',
  awayTeam: 'France',
  round: 'Round of 16'
})), BBC);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-06T19:00:00.000Z',
  homeTeam: 'Portugal',
  awayTeam: 'Spain',
  round: 'Round of 16'
})), BBC);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-06T00:00:00.000Z',
  homeTeam: 'Mexico',
  awayTeam: 'England',
  round: 'Round of 16'
})), BBC);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-09T20:00:00.000Z',
  homeTeam: 'France',
  awayTeam: 'Morocco',
  round: 'Quarter-finals'
})), ITV);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-10T19:00:00.000Z',
  homeTeam: 'Spain',
  awayTeam: 'Belgium',
  round: 'Quarter-finals'
})), BBC);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-11T21:00:00.000Z',
  homeTeam: 'Norway',
  awayTeam: 'England',
  round: 'Quarter-finals'
})), ITV);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-14T19:00:00.000Z',
  homeTeam: 'France',
  awayTeam: 'Spain',
  round: 'Semi-finals'
})), ITV);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-15T19:00:00.000Z',
  homeTeam: 'England',
  awayTeam: 'Argentina',
  round: 'Semi-finals'
})), BBC);

// England fallback when kick-off cannot be mapped to a match number yet
assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-16T12:00:00.000Z',
  homeTeam: 'England',
  awayTeam: 'Spain',
  round: 'Semi-finals'
})), BBC);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-18T21:00:00.000Z',
  homeTeam: 'Morocco',
  awayTeam: 'Switzerland',
  round: 'Third-place play-off'
})), BBC);

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-19T19:00:00.000Z',
  homeTeam: 'Argentina',
  awayTeam: 'France',
  round: 'Final'
})), BBC);

// Match-number fallback when team pairings are unknown yet
assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-14T19:00:00.000Z',
  homeTeam: null,
  awayTeam: null,
  round: 'Semi-finals'
})), ITV);

console.log('broadcast assertions passed');
