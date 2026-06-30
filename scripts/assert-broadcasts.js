const assert = require('node:assert/strict');
const { getBroadcastForFixture, resolveMatchNumber } = require('../src/data/broadcasts');

function fixture(overrides = {}) {
  return {
    round: 'Round of 32',
    status: 'scheduled',
    ...overrides
  };
}

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

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-06-28T19:00:00.000Z',
  homeTeam: 'South Africa',
  awayTeam: 'Canada',
  round: 'Round of 32'
})), {
  id: 'itv',
  name: 'ITV',
  channel: 'ITVX',
  logo: '/assets/broadcasters/itv.svg'
});

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-01T16:00:00.000Z',
  homeTeam: 'England',
  awayTeam: 'DR Congo',
  round: 'Round of 32'
})), {
  id: 'bbc',
  name: 'BBC',
  channel: 'BBC iPlayer',
  logo: '/assets/broadcasters/bbc.svg'
});

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-04T17:00:00.000Z',
  homeTeam: 'Canada',
  awayTeam: 'Netherlands',
  round: 'Round of 16'
})), {
  id: 'tbc',
  name: 'TBC',
  channel: 'TBC',
  logo: null
});

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-07T16:00:00.000Z',
  homeTeam: 'England',
  awayTeam: 'Brazil',
  round: 'Round of 16'
})), {
  id: 'bbc',
  name: 'BBC',
  channel: 'BBC iPlayer',
  logo: '/assets/broadcasters/bbc.svg'
});

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-10T19:00:00.000Z',
  homeTeam: 'England',
  awayTeam: 'Spain',
  round: 'Quarter-finals'
})), {
  id: 'itv',
  name: 'ITV',
  channel: 'ITVX',
  logo: '/assets/broadcasters/itv.svg'
});

assert.deepEqual(getBroadcastForFixture(fixture({
  utcDate: '2026-07-19T19:00:00.000Z',
  homeTeam: 'Argentina',
  awayTeam: 'France',
  round: 'Final'
})), {
  id: 'bbc',
  name: 'BBC',
  channel: 'BBC iPlayer',
  logo: '/assets/broadcasters/bbc.svg'
});

console.log('broadcast assertions passed');
