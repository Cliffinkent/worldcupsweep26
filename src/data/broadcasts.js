const broadcasterMeta = {
  bbc: {
    id: 'bbc',
    name: 'BBC',
    channel: 'BBC iPlayer',
    logo: '/assets/broadcasters/bbc.svg'
  },
  itv: {
    id: 'itv',
    name: 'ITV',
    channel: 'ITVX',
    logo: '/assets/broadcasters/itv.svg'
  },
  tbc: {
    id: 'tbc',
    name: 'TBC',
    channel: 'TBC',
    logo: null
  }
};

const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third-place play-off',
  'Final'
]);

function normaliseKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, 'and')
    .replace(/\bturkey\b/i, 'turkiye')
    .replace(/\busa\b/i, 'united states')
    .replace(/\bczech republic\b/i, 'czechia')
    .replace(/\bcape verde islands\b/i, 'cape verde')
    .replace(/\bcongo dr\b/i, 'dr congo')
    .replace(/\bivory coast\b/i, 'cote divoire')
    .replace(/\bcuracao\b/i, 'curacao')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function getUkDate(fixture) {
  if (!fixture?.utcDate) {
    return fixture?.date || null;
  }

  const date = new Date(fixture.utcDate);

  if (Number.isNaN(date.getTime())) {
    return fixture.date || null;
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function fixtureKey(date, homeTeam, awayTeam) {
  return [
    date,
    normaliseKey(homeTeam),
    normaliseKey(awayTeam)
  ].join('|');
}

function normaliseUtcMinute(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 16);
}

function isKnockoutRound(round) {
  return KNOCKOUT_ROUNDS.has(round);
}

function parseMatchNumberFromFixture(fixture) {
  const explicit = Number(fixture?.matchNumber ?? fixture?.matchNo ?? fixture?.match_number);

  if (Number.isInteger(explicit) && explicit >= 73 && explicit <= 104) {
    return explicit;
  }

  const roundText = String(fixture?.rawRound || fixture?.round || '');
  const labelledMatch = roundText.match(/\bmatch\s*#?\s*(\d{2,3})\b/i);

  if (labelledMatch) {
    const matchNumber = Number(labelledMatch[1]);

    if (Number.isInteger(matchNumber) && matchNumber >= 73 && matchNumber <= 104) {
      return matchNumber;
    }
  }

  const utcMinute = normaliseUtcMinute(fixture?.utcDate);

  if (utcMinute && knockoutScheduleByUtc.has(utcMinute)) {
    return knockoutScheduleByUtc.get(utcMinute);
  }

  return null;
}

function fixtureFeaturesEngland(fixture) {
  const home = normaliseKey(fixture?.homeTeam);
  const away = normaliseKey(fixture?.awayTeam);

  return home === 'england' || away === 'england';
}

function getEnglandKnockoutBroadcast(fixture) {
  if (!isKnockoutRound(fixture?.round) || !fixtureFeaturesEngland(fixture)) {
    return null;
  }

  switch (fixture.round) {
    case 'Round of 16':
    case 'Semi-finals':
      return broadcasterMeta.bbc;
    case 'Quarter-finals':
      return broadcasterMeta.itv;
    case 'Final':
      return broadcasterMeta.bbc;
    default:
      return null;
  }
}

const groupStageBroadcasts = [
  ['2026-06-11', 'Mexico', 'South Africa', 'itv'],
  ['2026-06-12', 'South Korea', 'Czechia', 'itv'],
  ['2026-06-12', 'Canada', 'Bosnia and Herzegovina', 'bbc'],
  ['2026-06-13', 'United States', 'Paraguay', 'bbc'],
  ['2026-06-13', 'Qatar', 'Switzerland', 'itv'],
  ['2026-06-13', 'Brazil', 'Morocco', 'bbc'],
  ['2026-06-14', 'Haiti', 'Scotland', 'bbc'],
  ['2026-06-14', 'Australia', 'Türkiye', 'itv'],
  ['2026-06-14', 'Germany', 'Curaçao', 'itv'],
  ['2026-06-14', 'Netherlands', 'Japan', 'itv'],
  ['2026-06-15', 'Côte d’Ivoire', 'Ecuador', 'bbc'],
  ['2026-06-15', 'Sweden', 'Tunisia', 'itv'],
  ['2026-06-15', 'Spain', 'Cape Verde', 'itv'],
  ['2026-06-15', 'Belgium', 'Egypt', 'bbc'],
  ['2026-06-15', 'Saudi Arabia', 'Uruguay', 'itv'],
  ['2026-06-16', 'Iran', 'New Zealand', 'bbc'],
  ['2026-06-16', 'France', 'Senegal', 'bbc'],
  ['2026-06-16', 'Iraq', 'Norway', 'bbc'],
  ['2026-06-17', 'Argentina', 'Algeria', 'itv'],
  ['2026-06-17', 'Austria', 'Jordan', 'bbc'],
  ['2026-06-17', 'Portugal', 'DR Congo', 'bbc'],
  ['2026-06-17', 'England', 'Croatia', 'itv'],
  ['2026-06-18', 'Ghana', 'Panama', 'itv'],
  ['2026-06-18', 'Uzbekistan', 'Colombia', 'bbc'],
  ['2026-06-18', 'Czechia', 'South Africa', 'bbc'],
  ['2026-06-18', 'Switzerland', 'Bosnia and Herzegovina', 'itv'],
  ['2026-06-18', 'Canada', 'Qatar', 'itv'],
  ['2026-06-19', 'Mexico', 'South Korea', 'bbc'],
  ['2026-06-19', 'United States', 'Australia', 'bbc'],
  ['2026-06-19', 'Scotland', 'Morocco', 'itv'],
  ['2026-06-20', 'Brazil', 'Haiti', 'itv'],
  ['2026-06-20', 'Türkiye', 'Paraguay', 'itv'],
  ['2026-06-20', 'Netherlands', 'Sweden', 'bbc'],
  ['2026-06-20', 'Germany', 'Côte d’Ivoire', 'itv'],
  ['2026-06-21', 'Ecuador', 'Curaçao', 'bbc'],
  ['2026-06-21', 'Tunisia', 'Japan', 'bbc'],
  ['2026-06-21', 'Spain', 'Saudi Arabia', 'bbc'],
  ['2026-06-21', 'Belgium', 'Iran', 'itv'],
  ['2026-06-21', 'Uruguay', 'Cape Verde', 'bbc'],
  ['2026-06-22', 'New Zealand', 'Egypt', 'itv'],
  ['2026-06-22', 'Argentina', 'Austria', 'bbc'],
  ['2026-06-22', 'France', 'Iraq', 'bbc'],
  ['2026-06-23', 'Norway', 'Senegal', 'itv'],
  ['2026-06-23', 'Jordan', 'Algeria', 'itv'],
  ['2026-06-23', 'Portugal', 'Uzbekistan', 'itv'],
  ['2026-06-23', 'England', 'Ghana', 'bbc'],
  ['2026-06-24', 'Panama', 'Croatia', 'bbc'],
  ['2026-06-24', 'Colombia', 'DR Congo', 'itv'],
  ['2026-06-24', 'Switzerland', 'Canada', 'itv'],
  ['2026-06-24', 'Bosnia and Herzegovina', 'Qatar', 'itv'],
  ['2026-06-24', 'Morocco', 'Haiti', 'bbc'],
  ['2026-06-24', 'Scotland', 'Brazil', 'bbc'],
  ['2026-06-25', 'South Africa', 'South Korea', 'bbc'],
  ['2026-06-25', 'Czechia', 'Mexico', 'bbc'],
  ['2026-06-25', 'Curaçao', 'Côte d’Ivoire', 'bbc'],
  ['2026-06-25', 'Ecuador', 'Germany', 'bbc'],
  ['2026-06-26', 'Tunisia', 'Netherlands', 'bbc'],
  ['2026-06-26', 'Japan', 'Sweden', 'bbc'],
  ['2026-06-26', 'Türkiye', 'United States', 'itv'],
  ['2026-06-26', 'Paraguay', 'Australia', 'itv'],
  ['2026-06-26', 'Norway', 'France', 'itv'],
  ['2026-06-26', 'Senegal', 'Iraq', 'itv'],
  ['2026-06-27', 'Cape Verde', 'Saudi Arabia', 'itv'],
  ['2026-06-27', 'Uruguay', 'Spain', 'itv'],
  ['2026-06-27', 'New Zealand', 'Belgium', 'bbc'],
  ['2026-06-27', 'Egypt', 'Iran', 'bbc'],
  ['2026-06-27', 'Panama', 'England', 'itv'],
  ['2026-06-27', 'Croatia', 'Ghana', 'itv'],
  ['2026-06-28', 'Colombia', 'Portugal', 'bbc'],
  ['2026-06-28', 'DR Congo', 'Uzbekistan', 'bbc'],
  ['2026-06-28', 'Algeria', 'Austria', 'bbc'],
  ['2026-06-28', 'Jordan', 'Argentina', 'bbc']
];

const knockoutBroadcasts = [
  // Round of 32
  ['2026-06-28', 'South Africa', 'Canada', 'itv'],
  ['2026-06-29', 'Brazil', 'Japan', 'itv'],
  ['2026-06-29', 'Germany', 'Paraguay', 'bbc'],
  ['2026-06-30', 'Netherlands', 'Morocco', 'itv'],
  ['2026-06-30', 'Côte d’Ivoire', 'Norway', 'bbc'],
  ['2026-06-30', 'France', 'Sweden', 'itv'],
  ['2026-07-01', 'Mexico', 'Ecuador', 'itv'],
  ['2026-07-01', 'England', 'DR Congo', 'bbc'],
  ['2026-07-01', 'Belgium', 'Senegal', 'itv'],
  ['2026-07-02', 'United States', 'Bosnia and Herzegovina', 'bbc'],
  ['2026-07-02', 'Spain', 'Austria', 'bbc'],
  ['2026-07-03', 'Portugal', 'Croatia', 'bbc'],
  ['2026-07-03', 'Switzerland', 'Algeria', 'bbc'],
  ['2026-07-03', 'Australia', 'Egypt', 'bbc'],
  ['2026-07-03', 'Argentina', 'Cape Verde', 'itv'],
  ['2026-07-04', 'Colombia', 'Ghana', 'itv'],
  // Round of 16
  ['2026-07-04', 'Canada', 'Morocco', 'itv'],
  ['2026-07-04', 'Paraguay', 'France', 'bbc'],
  ['2026-07-05', 'Brazil', 'Norway', 'itv'],
  ['2026-07-06', 'Mexico', 'England', 'bbc'],
  ['2026-07-06', 'Portugal', 'Spain', 'bbc'],
  ['2026-07-07', 'United States', 'Belgium', 'bbc'],
  ['2026-07-07', 'Argentina', 'Egypt', 'itv'],
  ['2026-07-07', 'Switzerland', 'Colombia', 'itv'],
  // Quarter-finals
  ['2026-07-09', 'France', 'Morocco', 'itv'],
  ['2026-07-10', 'Spain', 'Belgium', 'bbc'],
  ['2026-07-11', 'Norway', 'England', 'itv'],
  ['2026-07-12', 'Argentina', 'Switzerland', 'itv'],
  // Semi-finals
  ['2026-07-14', 'France', 'Spain', 'itv'],
  ['2026-07-15', 'England', 'Argentina', 'bbc']
];

const knockoutBroadcastsByMatchNumber = new Map([
  // Round of 32
  [73, 'itv'],
  [74, 'bbc'],
  [75, 'itv'],
  [76, 'itv'],
  [77, 'itv'],
  [78, 'bbc'],
  [79, 'itv'],
  [80, 'bbc'],
  [81, 'bbc'],
  [82, 'itv'],
  [83, 'bbc'],
  [84, 'bbc'],
  [85, 'bbc'],
  [86, 'itv'],
  [87, 'itv'],
  [88, 'bbc'],
  // Round of 16
  [89, 'bbc'],
  [90, 'itv'],
  [91, 'itv'],
  [92, 'bbc'],
  [93, 'bbc'],
  [94, 'bbc'],
  [95, 'itv'],
  [96, 'itv'],
  // Quarter-finals
  [97, 'itv'],
  [98, 'bbc'],
  [99, 'itv'],
  [100, 'itv'],
  // Semi-finals
  [101, 'itv'],
  [102, 'bbc'],
  // Third-place play-off + Final
  [103, 'bbc'],
  [104, 'bbc']
]);

const knockoutScheduleByUtc = new Map([
  ['2026-06-28T19:00', 73],
  ['2026-06-29T17:00', 76],
  ['2026-06-29T20:30', 74],
  ['2026-06-30T01:00', 75],
  ['2026-06-30T17:00', 78],
  ['2026-06-30T21:00', 77],
  ['2026-07-01T01:00', 79],
  ['2026-07-01T16:00', 80],
  ['2026-07-01T20:00', 82],
  ['2026-07-02T00:00', 81],
  ['2026-07-02T19:00', 84],
  ['2026-07-02T23:00', 83],
  ['2026-07-03T03:00', 85],
  ['2026-07-03T18:00', 88],
  ['2026-07-03T22:00', 86],
  ['2026-07-04T01:30', 87],
  ['2026-07-04T17:00', 90],
  ['2026-07-04T21:00', 89],
  ['2026-07-05T20:00', 91],
  ['2026-07-06T00:00', 92],
  ['2026-07-06T19:00', 93],
  ['2026-07-07T00:00', 94],
  ['2026-07-07T16:00', 95],
  ['2026-07-07T20:00', 96],
  ['2026-07-09T20:00', 97],
  ['2026-07-10T19:00', 98],
  ['2026-07-11T21:00', 99],
  ['2026-07-12T01:00', 100],
  ['2026-07-14T19:00', 101],
  ['2026-07-15T19:00', 102],
  ['2026-07-18T21:00', 103],
  ['2026-07-19T19:00', 104]
]);

const broadcastsByFixture = new Map([
  ...groupStageBroadcasts,
  ...knockoutBroadcasts
].map(([date, homeTeam, awayTeam, broadcaster]) => [
  fixtureKey(date, homeTeam, awayTeam),
  broadcasterMeta[broadcaster]
]));

function getBroadcastByMatchNumber(matchNumber) {
  const broadcaster = knockoutBroadcastsByMatchNumber.get(matchNumber);

  if (!broadcaster) {
    return null;
  }

  return broadcasterMeta[broadcaster];
}

function resolveMatchNumber(fixture) {
  return parseMatchNumberFromFixture(fixture);
}

function getBroadcastForFixture(fixture) {
  const ukDate = getUkDate(fixture);
  const homeTeam = fixture?.homeTeam;
  const awayTeam = fixture?.awayTeam;
  const fixtureBroadcast = broadcastsByFixture.get(fixtureKey(ukDate, homeTeam, awayTeam))
    || broadcastsByFixture.get(fixtureKey(ukDate, awayTeam, homeTeam));

  if (fixtureBroadcast) {
    return fixtureBroadcast;
  }

  const matchNumber = parseMatchNumberFromFixture(fixture);
  const matchBroadcast = matchNumber ? getBroadcastByMatchNumber(matchNumber) : null;

  if (matchBroadcast) {
    return matchBroadcast;
  }

  const englandBroadcast = getEnglandKnockoutBroadcast(fixture);

  if (englandBroadcast) {
    return englandBroadcast;
  }

  return broadcasterMeta.tbc;
}

module.exports = {
  getBroadcastForFixture,
  resolveMatchNumber
};
