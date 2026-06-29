const knockoutSlots = require('../data/knockoutSlots');
const roundOf32Slots = require('../data/roundOf32Slots');
const sweepstakeTeams = require('../data/sweepstakeTeams');
const thirdPlaceAnnexC = require('../data/thirdPlaceAnnexC');
const { buildQualificationProjection } = require('./qualificationService');

const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third-place play-off',
  'Final'
]);
const FINISHED_KNOCKOUT_RAW_STATUSES = new Set(['FT', 'AET', 'PEN']);

function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const teamsByName = new Map();

sweepstakeTeams.forEach((team) => {
  [team.country, team.fifaName, ...team.aliases].forEach((name) => {
    teamsByName.set(normaliseName(name), team);
  });
});

function groupFixturesByRound(fixtures = []) {
  return fixtures.reduce((index, fixture) => {
    if (!fixture.round) {
      return index;
    }

    index[fixture.round] = index[fixture.round] || [];
    index[fixture.round].push(fixture);
    return index;
  }, {});
}

function teamCountry(team) {
  if (!team) {
    return null;
  }

  if (typeof team === 'string') {
    return team;
  }

  return team.country || team.name || team.team || null;
}

function sameTeamName(teamA, teamB) {
  const countryA = normaliseName(teamCountry(teamA));
  const countryB = normaliseName(teamCountry(teamB));
  return Boolean(countryA && countryB && countryA === countryB);
}

function cloneTeam(team) {
  if (!team) {
    return null;
  }

  if (typeof team === 'string') {
    const localTeam = teamsByName.get(normaliseName(team));

    if (localTeam) {
      return toBracketTeam(localTeam);
    }

    return {
      id: null,
      teamId: null,
      name: team,
      country: team,
      owner: null,
      flag: null,
      iso: null,
      flagAsset: null
    };
  }

  return {
    ...team,
    id: team.id || team.teamId || null,
    teamId: team.teamId || team.id || null,
    name: team.name || team.country || team.team || 'TBC',
    country: team.country || team.name || team.team || 'TBC',
    flagAsset: team.flagAsset || (team.iso ? `/assets/flags-iso/${team.iso}.svg` : null)
  };
}

function toBracketTeam(team) {
  return {
    id: team.id || null,
    teamId: team.teamId || team.id || null,
    name: team.country || team.name || 'TBC',
    country: team.country || team.name || 'TBC',
    owner: team.owner || null,
    flag: team.flag || null,
    iso: team.iso || null,
    flagAsset: team.iso ? `/assets/flags-iso/${team.iso}.svg` : null
  };
}

function teamFromFixtureName(value, preferredSlotTeam = null) {
  if (!value && !preferredSlotTeam) {
    return null;
  }

  if (preferredSlotTeam && sameTeamName(preferredSlotTeam, value)) {
    return cloneTeam(preferredSlotTeam);
  }

  if (value && typeof value === 'object') {
    const localTeam = teamsByName.get(normaliseName(teamCountry(value)));
    return localTeam ? toBracketTeam(localTeam) : cloneTeam(value);
  }

  const localTeam = teamsByName.get(normaliseName(value));
  return localTeam ? toBracketTeam(localTeam) : cloneTeam(value);
}

function sourceCodeFromLabel(value) {
  const text = String(value || '').trim();

  if (/^[WL]\d+$/i.test(text)) {
    return text.toUpperCase();
  }

  const matchSource = text.match(/^(Winner|Loser)\s+(?:Match\s+|M)(\d+)$/i);

  if (matchSource) {
    return `${matchSource[1].slice(0, 1).toUpperCase()}${matchSource[2]}`;
  }

  const runnerUpSource = text.match(/^Runner-up\s+(?:Match\s+|M)(\d+)$/i);

  if (runnerUpSource) {
    return `L${runnerUpSource[1]}`;
  }

  return null;
}

function sourceMatchNumber(source) {
  const match = String(source || '').match(/^[WL](\d+)$/i);
  return match ? Number(match[1]) : null;
}

function createSlot({
  label,
  source,
  team = null,
  projectionType = null,
  provisional = false,
  unresolvedTie = false,
  placeholder,
  resultState,
  isWinner = false,
  isLoser = false,
  isEliminated = false,
  resolvedFromMatch = null
}) {
  const bracketTeam = cloneTeam(team);

  return {
    label,
    source: source || sourceCodeFromLabel(label),
    team: bracketTeam,
    projectionType: projectionType || bracketTeam?.projectionType || null,
    provisional: Boolean(provisional || bracketTeam?.provisional),
    unresolvedTie: Boolean(unresolvedTie || bracketTeam?.unresolvedTie),
    placeholder: placeholder || label,
    resultState: resultState || (bracketTeam ? 'projected' : 'placeholder'),
    isWinner: Boolean(isWinner),
    isLoser: Boolean(isLoser),
    isEliminated: Boolean(isEliminated),
    resolvedFromMatch
  };
}

function pendingThirdPlaceSlot(slot) {
  return createSlot({
    label: slot.label,
    source: slot.source,
    placeholder: 'Pending third-place mapping',
    resultState: 'pending'
  });
}

function fixedSlotTeam(source, qualification) {
  const position = source.slice(0, 1);
  const group = source.slice(1);

  if (position === '1') {
    return qualification.groupWinnerByGroup[group] || null;
  }

  if (position === '2') {
    return qualification.groupRunnerUpByGroup[group] || null;
  }

  return null;
}

function projectSlot(slot, qualification, annexCMapping) {
  if (slot.winnerSlot) {
    if (!annexCMapping) {
      return pendingThirdPlaceSlot(slot);
    }

    const mappedSource = annexCMapping[slot.winnerSlot];
    const mappedGroup = mappedSource?.slice(1);
    const team = mappedGroup ? qualification.thirdPlacedByGroup[mappedGroup] || null : null;

    if (!mappedSource || !slot.thirdPlaceGroups.includes(mappedGroup) || !team) {
      return pendingThirdPlaceSlot({
        ...slot,
        source: mappedSource || slot.source
      });
    }

    return createSlot({
      label: slot.label,
      source: mappedSource,
      team,
      projectionType: team.projectionType,
      provisional: team.provisional,
      unresolvedTie: team.unresolvedTie
    });
  }

  const team = fixedSlotTeam(slot.source, qualification);

  return createSlot({
    label: slot.label,
    source: slot.source,
    team,
    projectionType: team?.projectionType || null,
    provisional: Boolean(team?.provisional),
    unresolvedTie: Boolean(team?.unresolvedTie)
  });
}

function buildRoundOf32(qualification, fixturesByRound, providerRounds, annexCMapping) {
  const roundFixtures = fixturesByRound['Round of 32'] || [];

  return roundOf32Slots.map((match) => {
    const slotA = projectSlot(match.slotA, qualification, annexCMapping);
    const slotB = projectSlot(match.slotB, qualification, annexCMapping);
    const bracketMatch = {
      matchNumber: match.matchNumber,
      round: match.round,
      slotA,
      slotB
    };
    const fixture = fixtureForBracketMatch(bracketMatch, roundFixtures);

    return syncMatchLegacyFields({
      ...bracketMatch,
      providerRoundAvailable: providerRounds.includes(match.round),
      fixture,
      status: fixture?.status || 'scheduled',
      winner: fixture?.winner || null
    });
  });
}

function pointerSlot(label) {
  return createSlot({
    label,
    source: sourceCodeFromLabel(label),
    placeholder: label,
    resultState: 'placeholder'
  });
}

function buildLaterRounds(fixturesByRound, providerRounds) {
  return knockoutSlots
    .filter((round) => round.round !== 'Round of 32')
    .map((round) => ({
      round: round.round,
      providerRoundAvailable: providerRounds.includes(round.round),
      matches: round.slots.map((slot) => {
        const bracketMatch = {
          ...slot,
          round: round.round,
          slotA: pointerSlot(slot.homePlaceholder),
          slotB: pointerSlot(slot.awayPlaceholder)
        };
        const fixture = fixtureForBracketMatch(bracketMatch, fixturesByRound[round.round] || []);

        return syncMatchLegacyFields({
          ...bracketMatch,
          providerRoundAvailable: providerRounds.includes(round.round),
          fixture,
          status: fixture?.status || 'scheduled',
          winner: fixture?.winner || null
        });
      })
    }));
}

function syncMatchLegacyFields(match) {
  match.homePlaceholder = match.slotA?.placeholder || match.slotA?.label || match.homePlaceholder;
  match.awayPlaceholder = match.slotB?.placeholder || match.slotB?.label || match.awayPlaceholder;
  match.homeTeam = match.slotA?.team || null;
  match.awayTeam = match.slotB?.team || null;
  return match;
}

function allMatches(roundOf32, laterRounds) {
  return [
    ...roundOf32,
    ...laterRounds.flatMap((round) => round.matches || [])
  ];
}

function matchNumberFromFixture(fixture) {
  const value = fixture?.matchNumber ?? fixture?.matchNo ?? fixture?.match_number;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function fixtureForMatchNumber(fixtures, matchNumber) {
  return fixtures.find((fixture) => matchNumberFromFixture(fixture) === matchNumber) || null;
}

function fixtureForBracketMatch(match, fixtures) {
  const byNumber = fixtureForMatchNumber(fixtures, match.matchNumber);

  if (byNumber) {
    return byNumber;
  }

  const pairMatches = fixtures.filter((fixture) => matchContainsFixturePair(match, fixture));

  if (pairMatches.length === 1) {
    return pairMatches[0];
  }

  return null;
}

function attachProviderFixturesToMatches(matches, fixtures = []) {
  const fixturesByRound = groupFixturesByRound(fixtures);

  matches.forEach((match) => {
    const fixture = fixtureForBracketMatch(match, fixturesByRound[match.round] || []);

    if (!fixture) {
      return;
    }

    match.fixture = fixture;

    if (fixture.status) {
      match.status = fixture.status;
    }

    if (fixture.winner && fixture.status === 'finished') {
      match.winner = fixture.winner;
    }
  });
}

function isFinishedKnockoutFixture(fixture) {
  if (!KNOCKOUT_ROUNDS.has(fixture?.round)) {
    return false;
  }

  const rawStatus = String(fixture.rawStatus || '').trim().toUpperCase();
  return FINISHED_KNOCKOUT_RAW_STATUSES.has(rawStatus) || fixture.status === 'finished';
}

function scoreNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resultFromWinnerSide(fixture, winnerSide, reason) {
  const homeTeam = teamFromFixtureName(fixture.homeTeam);
  const awayTeam = teamFromFixtureName(fixture.awayTeam);
  const winnerTeam = winnerSide === 'home' ? homeTeam : awayTeam;
  const loserTeam = winnerSide === 'home' ? awayTeam : homeTeam;

  return {
    resolved: Boolean(winnerTeam && loserTeam),
    reason,
    winnerTeam,
    loserTeam,
    homeTeam,
    awayTeam
  };
}

function detectKnockoutResult(fixture) {
  const homeScore = scoreNumber(fixture.homeScore);
  const awayScore = scoreNumber(fixture.awayScore);
  const homePenaltyScore = scoreNumber(fixture.homePenaltyScore);
  const awayPenaltyScore = scoreNumber(fixture.awayPenaltyScore);
  const providerWinner = fixture.providerWinner || fixture.winner || null;

  if (providerWinner) {
    if (sameTeamName(providerWinner, fixture.homeTeam)) {
      return resultFromWinnerSide(fixture, 'home', 'provider_winner');
    }

    if (sameTeamName(providerWinner, fixture.awayTeam)) {
      return resultFromWinnerSide(fixture, 'away', 'provider_winner');
    }
  }

  if (homeScore !== null && awayScore !== null) {
    if (homeScore > awayScore) {
      return resultFromWinnerSide(fixture, 'home', 'score');
    }

    if (awayScore > homeScore) {
      return resultFromWinnerSide(fixture, 'away', 'score');
    }
  }

  if (
    String(fixture.rawStatus || '').toUpperCase() === 'PEN' &&
    homePenaltyScore !== null &&
    awayPenaltyScore !== null
  ) {
    if (homePenaltyScore > awayPenaltyScore) {
      return resultFromWinnerSide(fixture, 'home', 'penalties');
    }

    if (awayPenaltyScore > homePenaltyScore) {
      return resultFromWinnerSide(fixture, 'away', 'penalties');
    }
  }

  return {
    resolved: false,
    reason: 'knockout_result_unresolved',
    warning: 'Finished knockout fixture has no decisive winner from provider, score, or penalties.',
    winnerTeam: null,
    loserTeam: null,
    homeTeam: teamFromFixtureName(fixture.homeTeam),
    awayTeam: teamFromFixtureName(fixture.awayTeam)
  };
}

function matchHasFixtureId(match, fixture) {
  return Boolean(match.fixture?.id && fixture?.id && String(match.fixture.id) === String(fixture.id));
}

function matchContainsFixturePair(match, fixture) {
  const slotTeams = [match.slotA?.team, match.slotB?.team].filter(Boolean);

  if (slotTeams.length < 2 || !fixture.homeTeam || !fixture.awayTeam) {
    return false;
  }

  return (
    slotTeams.some((team) => sameTeamName(team, fixture.homeTeam)) &&
    slotTeams.some((team) => sameTeamName(team, fixture.awayTeam))
  );
}

function mapFixtureToMatch(fixture, matchesByNumber, matches) {
  const explicitMatchNumber = matchNumberFromFixture(fixture);

  if (explicitMatchNumber) {
    const match = matchesByNumber.get(explicitMatchNumber);

    return match
      ? { mapped: true, match, mappingReason: 'fixture.matchNumber' }
      : {
        mapped: false,
        reason: 'fixture_match_number_not_in_bracket',
        mappingReason: 'fixture.matchNumber'
      };
  }

  const pairMatches = matches.filter((match) => (
    match.round === fixture.round && matchContainsFixturePair(match, fixture)
  ));

  if (pairMatches.length === 1) {
    return {
      mapped: true,
      match: pairMatches[0],
      mappingReason: 'round_team_pair'
    };
  }

  if (pairMatches.length > 1) {
    return {
      mapped: false,
      reason: 'ambiguous_round_team_pair',
      mappingReason: 'round_team_pair'
    };
  }

  const fixtureIdMatch = matches.find((match) => matchHasFixtureId(match, fixture));

  if (fixtureIdMatch) {
    return {
      mapped: true,
      match: fixtureIdMatch,
      mappingReason: 'provider_fixture_id'
    };
  }

  return {
    mapped: false,
    reason: 'finished_knockout_fixture_not_mapped',
    mappingReason: 'not_mapped'
  };
}

function slotKeyForTeam(match, team) {
  if (sameTeamName(match.slotA?.team, team)) {
    return 'slotA';
  }

  if (sameTeamName(match.slotB?.team, team)) {
    return 'slotB';
  }

  return null;
}

function markResultSlot(slot, team, matchNumber, isWinner) {
  return createSlot({
    ...slot,
    team,
    projectionType: 'confirmed',
    resultState: isWinner ? 'confirmed_winner' : 'confirmed_loser',
    isWinner,
    isLoser: !isWinner,
    isEliminated: !isWinner,
    resolvedFromMatch: matchNumber
  });
}

function applyKnockoutResult(match, result, fixture = null) {
  const homeSlotKey = slotKeyForTeam(match, result.homeTeam);
  const awaySlotKey = slotKeyForTeam(match, result.awayTeam);
  const teamsBySlot = {};

  if (homeSlotKey && awaySlotKey && homeSlotKey !== awaySlotKey) {
    teamsBySlot[homeSlotKey] = teamFromFixtureName(result.homeTeam, match[homeSlotKey]?.team);
    teamsBySlot[awaySlotKey] = teamFromFixtureName(result.awayTeam, match[awaySlotKey]?.team);
  } else {
    teamsBySlot.slotA = teamFromFixtureName(result.homeTeam, match.slotA?.team);
    teamsBySlot.slotB = teamFromFixtureName(result.awayTeam, match.slotB?.team);
  }

  ['slotA', 'slotB'].forEach((slotKey) => {
    const team = teamsBySlot[slotKey];

    if (!team) {
      return;
    }

    match[slotKey] = markResultSlot(
      match[slotKey],
      team,
      match.matchNumber,
      sameTeamName(team, result.winnerTeam)
    );
  });

  match.winner = teamCountry(result.winnerTeam);
  match.status = 'finished';
  if (fixture) {
    match.fixture = {
      ...fixture,
      status: 'finished',
      winner: teamCountry(result.winnerTeam)
    };
  }
  syncMatchLegacyFields(match);
}

function slotResolvedByItsOwnMatch(slot, match) {
  return (
    slot?.resolvedFromMatch === match.matchNumber &&
    (slot.isWinner || slot.isLoser || slot.isEliminated)
  );
}

function propagateResolvedSources(matches, sourceTeams) {
  let changed = false;

  matches.forEach((match) => {
    ['slotA', 'slotB'].forEach((slotKey) => {
      const slot = match[slotKey];
      const source = sourceCodeFromLabel(slot?.source || slot?.label);

      if (!source || !sourceTeams.has(source) || slotResolvedByItsOwnMatch(slot, match)) {
        return;
      }

      const team = sourceTeams.get(source);
      const resolvedFromMatch = sourceMatchNumber(source);
      const nextState = source.startsWith('W') ? 'confirmed_winner' : 'confirmed_loser';

      if (
        slot.team &&
        sameTeamName(slot.team, team) &&
        slot.resultState === nextState &&
        slot.resolvedFromMatch === resolvedFromMatch
      ) {
        return;
      }

      match[slotKey] = createSlot({
        ...slot,
        team,
        projectionType: 'confirmed',
        resultState: nextState,
        isWinner: source.startsWith('W'),
        isLoser: false,
        isEliminated: false,
        resolvedFromMatch
      });
      syncMatchLegacyFields(match);
      changed = true;
    });
  });

  return changed;
}

function fixtureKey(fixture, index) {
  return fixture.id || [
    fixture.round,
    fixture.homeTeam,
    fixture.awayTeam,
    fixture.utcDate || fixture.date,
    index
  ].join(':');
}

function fixtureStatusForAudit(fixture) {
  return fixture.rawStatus || fixture.status || 'unknown';
}

function compactFinishedFixture(fixture) {
  return {
    fixtureId: fixture.id || null,
    matchNumber: matchNumberFromFixture(fixture),
    round: fixture.round || null,
    homeTeam: fixture.homeTeam || null,
    awayTeam: fixture.awayTeam || null,
    homeScore: scoreNumber(fixture.homeScore),
    awayScore: scoreNumber(fixture.awayScore),
    homePenaltyScore: scoreNumber(fixture.homePenaltyScore),
    awayPenaltyScore: scoreNumber(fixture.awayPenaltyScore),
    status: fixtureStatusForAudit(fixture),
    normalisedStatus: fixture.status || null
  };
}

function mappedResultEntry(fixture, mapping, result = null) {
  return {
    fixtureId: fixture.id || null,
    matchNumber: mapping.match?.matchNumber || matchNumberFromFixture(fixture),
    homeTeam: fixture.homeTeam || null,
    awayTeam: fixture.awayTeam || null,
    homeScore: scoreNumber(fixture.homeScore),
    awayScore: scoreNumber(fixture.awayScore),
    homePenaltyScore: scoreNumber(fixture.homePenaltyScore),
    awayPenaltyScore: scoreNumber(fixture.awayPenaltyScore),
    winner: teamCountry(result?.winnerTeam),
    loser: teamCountry(result?.loserTeam),
    status: fixtureStatusForAudit(fixture),
    mapped: Boolean(mapping.mapped),
    mappingReason: mapping.mapped ? mapping.mappingReason : (mapping.reason || 'finished_knockout_fixture_not_mapped'),
    resultReason: result?.reason || null,
    warnings: result?.warning ? [result.warning] : []
  };
}

function unresolvedFixtureEntry(fixture, reason, mapping = {}) {
  return {
    ...compactFinishedFixture(fixture),
    mapped: Boolean(mapping.mapped),
    reason
  };
}

function sourceEntries(sourceTeams) {
  return Object.fromEntries(
    Array.from(sourceTeams.entries())
      .sort(([sourceA], [sourceB]) => {
        const numberDiff = sourceMatchNumber(sourceA) - sourceMatchNumber(sourceB);
        return numberDiff || sourceA.localeCompare(sourceB);
      })
      .map(([source, team]) => [source, teamCountry(team)])
  );
}

function downstreamSlotChecks(matches, winnerSourceTeams, loserSourceTeams) {
  const expectedSources = new Map([
    ...winnerSourceTeams.entries(),
    ...loserSourceTeams.entries()
  ]);
  const checks = [];

  matches.forEach((match) => {
    ['slotA', 'slotB'].forEach((slotKey) => {
      const slot = match[slotKey];
      const source = sourceCodeFromLabel(slot?.source || slot?.label);

      if (!source || !expectedSources.has(source)) {
        return;
      }

      const expectedCountry = teamCountry(expectedSources.get(source));
      const actualCountry = teamCountry(slot.team);

      checks.push({
        source,
        expectedCountry,
        actualCountry,
        matchNumber: match.matchNumber,
        slot: slotKey,
        passed: Boolean(expectedCountry && actualCountry && normaliseName(expectedCountry) === normaliseName(actualCountry))
      });
    });
  });

  return checks;
}

function resolveBracketResults({ roundOf32 = [], laterRounds = [], fixtures = [] } = {}) {
  const matches = allMatches(roundOf32, laterRounds);
  const matchesByNumber = new Map(matches.map((match) => [match.matchNumber, match]));
  const finishedFixtures = fixtures.filter(isFinishedKnockoutFixture);
  const pending = finishedFixtures.map((fixture, index) => ({
    fixture,
    key: fixtureKey(fixture, index)
  }));
  const mappedResultsByKey = new Map();
  const unresolvedFixtures = [];
  const winnerSourceTeams = new Map();
  const loserSourceTeams = new Map();
  let madeProgress = true;

  while (madeProgress) {
    madeProgress = false;

    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const item = pending[index];
      const mapping = mapFixtureToMatch(item.fixture, matchesByNumber, matches);

      if (!mapping.mapped) {
        continue;
      }

      const result = detectKnockoutResult(item.fixture);
      mappedResultsByKey.set(item.key, mappedResultEntry(item.fixture, mapping, result));
      pending.splice(index, 1);
      madeProgress = true;

      if (!result.resolved) {
        unresolvedFixtures.push(unresolvedFixtureEntry(item.fixture, result.reason, mapping));
        continue;
      }

      applyKnockoutResult(mapping.match, result, item.fixture);
      winnerSourceTeams.set(`W${mapping.match.matchNumber}`, cloneTeam(result.winnerTeam));
      loserSourceTeams.set(`L${mapping.match.matchNumber}`, cloneTeam(result.loserTeam));
    }

    if (propagateResolvedSources(matches, new Map([
      ...winnerSourceTeams.entries(),
      ...loserSourceTeams.entries()
    ]))) {
      madeProgress = true;
    }
  }

  pending.forEach((item) => {
    const mapping = mapFixtureToMatch(item.fixture, matchesByNumber, matches);
    const reason = mapping.reason || 'finished_knockout_fixture_not_mapped';
    mappedResultsByKey.set(item.key, mappedResultEntry(item.fixture, mapping));
    unresolvedFixtures.push(unresolvedFixtureEntry(item.fixture, reason, mapping));
  });

  matches.forEach(syncMatchLegacyFields);
  attachProviderFixturesToMatches(matches, fixtures);

  return {
    roundOf32,
    laterRounds,
    bracketAudit: {
      finishedKnockoutFixtures: finishedFixtures.map(compactFinishedFixture),
      mappedKnockoutResults: Array.from(mappedResultsByKey.values()),
      unresolvedKnockoutFixtures: unresolvedFixtures,
      resolvedWinnerSources: sourceEntries(winnerSourceTeams),
      resolvedLoserSources: sourceEntries(loserSourceTeams),
      downstreamSlotChecks: downstreamSlotChecks(matches, winnerSourceTeams, loserSourceTeams)
    }
  };
}

function buildLegacyRoundOf32(roundOf32) {
  return {
    round: 'Round of 32',
    providerRoundAvailable: roundOf32.some((match) => match.providerRoundAvailable),
    matches: roundOf32.map((match) => syncMatchLegacyFields({
      id: `m${match.matchNumber}`,
      matchNumber: match.matchNumber,
      fixture: match.fixture,
      homePlaceholder: match.slotA.placeholder || match.slotA.label,
      awayPlaceholder: match.slotB.placeholder || match.slotB.label,
      homeTeam: match.slotA.team,
      awayTeam: match.slotB.team,
      slotA: match.slotA,
      slotB: match.slotB,
      status: match.status,
      winner: match.winner
    }))
  };
}

function buildQualificationDebug(qualification, annexCMappingStatus) {
  return {
    groupWinners: qualification.groupWinners,
    groupRunnersUp: qualification.groupRunnersUp,
    thirdPlacedTeamsRanked: qualification.thirdPlacedTeamsRanked,
    thirdPlaceGroupsProjectedToQualify: qualification.thirdPlaceGroupsProjectedToQualify,
    annexCKey: qualification.annexCKey,
    annexCMappingStatus,
    unresolvedTies: qualification.unresolvedTies,
    warnings: qualification.warnings
  };
}

function buildBracketProjection({
  groupTables = [],
  fixtures = [],
  rounds = [],
  providerStatus = null,
  generatedAt = new Date().toISOString(),
  annexCMap = thirdPlaceAnnexC
} = {}) {
  const qualification = buildQualificationProjection(groupTables);
  const annexCMapping = qualification.annexCKey ? annexCMap[qualification.annexCKey] || null : null;
  const annexCMappingStatus = annexCMapping ? 'mapped' : 'missing_combination';
  const providerRounds = Array.isArray(rounds) ? rounds : [];
  const fixturesByRound = groupFixturesByRound(fixtures);
  const roundOf32 = buildRoundOf32(qualification, fixturesByRound, providerRounds, annexCMapping);
  const laterRounds = buildLaterRounds(fixturesByRound, providerRounds);
  const resolved = resolveBracketResults({ roundOf32, laterRounds, fixtures });

  return {
    generatedAt,
    lastUpdated: generatedAt,
    providerStatus,
    projectionStatus: qualification.projectionStatus,
    thirdPlaceProjectionWarning: qualification.thirdPlaceProjectionWarning,
    thirdPlaceGroupsProjectedToQualify: qualification.thirdPlaceGroupsProjectedToQualify,
    annexCKey: qualification.annexCKey,
    annexCMappingStatus,
    roundOf32: resolved.roundOf32,
    laterRounds: resolved.laterRounds,
    bracket: [
      buildLegacyRoundOf32(resolved.roundOf32),
      ...resolved.laterRounds
    ],
    bracketAudit: {
      generatedAt,
      ...resolved.bracketAudit
    },
    qualificationDebug: buildQualificationDebug(qualification, annexCMappingStatus)
  };
}

module.exports = {
  buildBracketProjection,
  resolveBracketResults
};
