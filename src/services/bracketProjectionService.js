const knockoutSlots = require('../data/knockoutSlots');
const roundOf32Slots = require('../data/roundOf32Slots');
const thirdPlaceAnnexC = require('../data/thirdPlaceAnnexC');
const { buildQualificationProjection } = require('./qualificationService');

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

function pendingThirdPlaceSlot(slot) {
  return {
    label: slot.label,
    source: slot.source,
    team: null,
    projectionType: null,
    placeholder: 'Pending third-place mapping'
  };
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

    return {
      label: slot.label,
      source: mappedSource,
      team,
      projectionType: team.projectionType,
      provisional: team.provisional,
      unresolvedTie: team.unresolvedTie
    };
  }

  const team = fixedSlotTeam(slot.source, qualification);

  return {
    label: slot.label,
    source: slot.source,
    team,
    projectionType: team?.projectionType || null,
    provisional: Boolean(team?.provisional),
    unresolvedTie: Boolean(team?.unresolvedTie),
    placeholder: slot.label
  };
}

function buildRoundOf32(qualification, fixturesByRound, providerRounds, annexCMapping) {
  const roundFixtures = fixturesByRound['Round of 32'] || [];

  return roundOf32Slots.map((match, index) => {
    const fixture = roundFixtures[index] || null;
    const slotA = projectSlot(match.slotA, qualification, annexCMapping);
    const slotB = projectSlot(match.slotB, qualification, annexCMapping);

    return {
      matchNumber: match.matchNumber,
      round: match.round,
      providerRoundAvailable: providerRounds.includes(match.round),
      slotA,
      slotB,
      fixture,
      status: fixture?.status || 'scheduled',
      winner: fixture?.winner || null
    };
  });
}

function buildLaterRounds(fixturesByRound, providerRounds) {
  return knockoutSlots
    .filter((round) => round.round !== 'Round of 32')
    .map((round) => ({
      round: round.round,
      providerRoundAvailable: providerRounds.includes(round.round),
      matches: round.slots.map((slot, index) => {
        const fixture = fixturesByRound[round.round]?.[index] || null;

        return {
          ...slot,
          fixture,
          homeTeam: fixture?.homeTeam || null,
          awayTeam: fixture?.awayTeam || null,
          status: fixture?.status || 'scheduled',
          winner: fixture?.winner || null
        };
      })
    }));
}

function buildLegacyRoundOf32(roundOf32) {
  return {
    round: 'Round of 32',
    providerRoundAvailable: roundOf32.some((match) => match.providerRoundAvailable),
    matches: roundOf32.map((match) => ({
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

  return {
    generatedAt,
    lastUpdated: generatedAt,
    providerStatus,
    projectionStatus: qualification.projectionStatus,
    thirdPlaceProjectionWarning: qualification.thirdPlaceProjectionWarning,
    thirdPlaceGroupsProjectedToQualify: qualification.thirdPlaceGroupsProjectedToQualify,
    annexCKey: qualification.annexCKey,
    annexCMappingStatus,
    roundOf32,
    laterRounds,
    bracket: [
      buildLegacyRoundOf32(roundOf32),
      ...laterRounds
    ],
    qualificationDebug: buildQualificationDebug(qualification, annexCMappingStatus)
  };
}

module.exports = {
  buildBracketProjection
};
