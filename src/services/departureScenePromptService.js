const crypto = require('node:crypto');

const MAX_PROMPT_LENGTH = 3600;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanColour(value) {
  const colour = cleanText(value);
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toUpperCase() : null;
}

function sortLoungeTeams(loungeTeams = []) {
  return loungeTeams
    .filter((team) => cleanText(team.country))
    .map((team) => ({
      country: cleanText(team.country),
      owner: cleanText(team.owner),
      group: cleanText(team.group),
      kitPrimary: cleanColour(team.kitPrimary),
      kitSecondary: cleanColour(team.kitSecondary),
      kitAccent: cleanColour(team.kitAccent),
      reason: cleanText(team.reason)
    }))
    .sort((a, b) => a.country.localeCompare(b.country, 'en', { sensitivity: 'base' }));
}

function formatKitColours(team) {
  const colours = [team.kitPrimary, team.kitSecondary, team.kitAccent].filter(Boolean);

  return colours.length ? colours.join('/') : 'national kit colours';
}

function formatTeamPromptClause(team) {
  return `${team.country} (${formatKitColours(team)})`;
}

function buildCompactPrompt(sortedTeams, styleVersion) {
  const countries = sortedTeams.map((team) => team.country).join(', ');

  return [
    `A US airport departure lounge with exactly one sad fictional football player from each eliminated country: ${countries}.`,
    'Each player wears their national team kit colours and waits quietly to go home.',
    "Art style: 90's style retro football video game art, warm airport lighting, expressive but non-realistic characters.",
    'Do not depict real player likenesses, celebrities, club crests, sponsor logos, owner names, or readable text in the image.',
    `Departure lounge scene style version ${styleVersion}.`
  ].join(' ');
}

function buildDepartureLoungePrompt({ loungeTeams = [], styleVersion = '1' } = {}) {
  const sortedTeams = sortLoungeTeams(loungeTeams);

  if (!sortedTeams.length) {
    return null;
  }

  const style = cleanText(styleVersion) || '1';
  const teamClauses = sortedTeams.map(formatTeamPromptClause).join('; ');
  const prompt = [
    'A US airport departure lounge with exactly one sad fictional football player from each of these eliminated countries, each wearing the listed team kit colours:',
    `${teamClauses}.`,
    'The players look sad as they wait to go home, sitting or standing with luggage in a quiet departure lounge.',
    "Art style: 90's style retro football video game art, pixel-art inspired illustration, bold kit colours, soft airport lighting.",
    'Do not depict real player likenesses, real footballers, celebrities, club crests, sponsor logos, owner names, or readable text in the image.',
    `Departure lounge scene style version ${style}.`
  ].join(' ');

  if (prompt.length <= MAX_PROMPT_LENGTH) {
    return prompt;
  }

  return buildCompactPrompt(sortedTeams, style);
}

function buildDepartureSceneHash({ loungeTeams = [], styleVersion = '1' } = {}) {
  const sortedTeams = sortLoungeTeams(loungeTeams);

  if (!sortedTeams.length) {
    return null;
  }

  const hashInput = {
    styleVersion: cleanText(styleVersion) || '1',
    teams: sortedTeams.map((team) => ({
      country: team.country,
      owner: team.owner,
      kitPrimary: team.kitPrimary || '',
      kitSecondary: team.kitSecondary || '',
      kitAccent: team.kitAccent || ''
    }))
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(hashInput))
    .digest('hex');
}

module.exports = {
  buildDepartureLoungePrompt,
  buildDepartureSceneHash,
  sortLoungeTeams
};
