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

const broadcastsByFixture = new Map(groupStageBroadcasts.map(([date, homeTeam, awayTeam, broadcaster]) => [
  fixtureKey(date, homeTeam, awayTeam),
  broadcasterMeta[broadcaster]
]));

function getBroadcastForFixture(fixture) {
  const broadcast = broadcastsByFixture.get(fixtureKey(
    getUkDate(fixture),
    fixture?.homeTeam,
    fixture?.awayTeam
  ));

  if (broadcast) {
    return broadcast;
  }

  return broadcasterMeta.tbc;
}

module.exports = {
  getBroadcastForFixture
};
