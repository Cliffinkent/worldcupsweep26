const FINAL_MATCH_NUMBER = 104;
const FINAL_UTC_DATE = '2026-07-19T19:00:00.000Z';
const FINAL_DATE = '2026-07-19';
const FINAL_HOME_PLACEHOLDER = 'Winner Match 101';
const FINAL_AWAY_PLACEHOLDER = 'Winner Match 102';

function hasNamedTeam(team) {
  if (!team) {
    return false;
  }

  if (typeof team === 'object') {
    return Boolean(String(team.country || team.name || '').trim());
  }

  return Boolean(String(team).trim());
}

function isFinalFixture(fixture) {
  return fixture?.round === 'Final' || Number(fixture?.matchNumber) === FINAL_MATCH_NUMBER;
}

function createFinalFixturePlaceholder() {
  return {
    id: 'placeholder-final',
    matchNumber: FINAL_MATCH_NUMBER,
    date: FINAL_DATE,
    utcDate: FINAL_UTC_DATE,
    localDate: FINAL_UTC_DATE,
    status: 'scheduled',
    statusLabel: 'Not Started',
    statusDetail: 'Scheduled',
    round: 'Final',
    rawRound: 'Final',
    group: null,
    venue: null,
    city: null,
    homeTeam: null,
    awayTeam: null,
    homePlaceholder: FINAL_HOME_PLACEHOLDER,
    awayPlaceholder: FINAL_AWAY_PLACEHOLDER,
    homeScore: null,
    awayScore: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    winner: null,
    elapsed: null,
    isPlaceholder: true,
    isLiveSectionEligible: false
  };
}

function ensureFinalFixture(fixtures) {
  const list = Array.isArray(fixtures) ? fixtures.map((fixture) => ({ ...fixture })) : [];
  const existingIndex = list.findIndex(isFinalFixture);

  if (existingIndex === -1) {
    list.push(createFinalFixturePlaceholder());
    return list;
  }

  const existing = list[existingIndex];
  const teamsKnown = hasNamedTeam(existing.homeTeam) && hasNamedTeam(existing.awayTeam);

  if (teamsKnown) {
    return list;
  }

  list[existingIndex] = {
    ...existing,
    matchNumber: existing.matchNumber || FINAL_MATCH_NUMBER,
    date: existing.date || FINAL_DATE,
    utcDate: existing.utcDate || FINAL_UTC_DATE,
    homePlaceholder: existing.homePlaceholder || FINAL_HOME_PLACEHOLDER,
    awayPlaceholder: existing.awayPlaceholder || FINAL_AWAY_PLACEHOLDER,
    isPlaceholder: true
  };

  return list;
}

module.exports = {
  FINAL_MATCH_NUMBER,
  FINAL_UTC_DATE,
  createFinalFixturePlaceholder,
  ensureFinalFixture,
  isFinalFixture
};
