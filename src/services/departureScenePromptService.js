const crypto = require('node:crypto');

const MAX_PROMPT_LENGTH = 2500;
const MAX_PROMPT_PREVIEW_LENGTH = 360;

const COLOUR_NAMES = [
  ['black', [17, 24, 39]],
  ['white', [249, 250, 251]],
  ['red', [220, 38, 38]],
  ['blue', [37, 99, 235]],
  ['sky blue', [14, 165, 233]],
  ['green', [22, 163, 74]],
  ['yellow', [234, 179, 8]],
  ['orange', [249, 115, 22]],
  ['purple', [126, 34, 206]],
  ['navy', [30, 58, 138]],
  ['grey', [107, 114, 128]]
];

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanStyleVersion(styleVersion) {
  return cleanText(styleVersion || process.env.DEPARTURE_SCENE_STYLE_VERSION || '1') || '1';
}

function sortTeams(loungeTeams = []) {
  return loungeTeams
    .filter((team) => cleanText(team.country))
    .slice()
    .sort((a, b) => cleanText(a.country).localeCompare(cleanText(b.country), 'en', { sensitivity: 'base' }));
}

function parseHexColour(value) {
  const match = cleanText(value).match(/^#?([0-9a-f]{6})$/i);

  if (!match) {
    return null;
  }

  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ];
}

function distance(a, b) {
  return ((a[0] - b[0]) ** 2) + ((a[1] - b[1]) ** 2) + ((a[2] - b[2]) ** 2);
}

function describeColour(value) {
  const rgb = parseHexColour(value);

  if (!rgb) {
    return cleanText(value).replace(/[^a-z0-9#\s-]/gi, '').slice(0, 32) || null;
  }

  return COLOUR_NAMES
    .map(([name, colour]) => ({ name, score: distance(rgb, colour) }))
    .sort((a, b) => a.score - b.score)[0].name;
}

function teamKitColours(team) {
  const colours = [
    describeColour(team.kitPrimary),
    describeColour(team.kitSecondary),
    describeColour(team.kitAccent)
  ].filter(Boolean);
  const seen = new Set();

  return colours.filter((colour) => {
    const key = colour.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function describeTeamKit(team) {
  const colours = teamKitColours(team);

  if (!colours.length) {
    return `${cleanText(team.country)} in their national-team-inspired kit`;
  }

  return `${cleanText(team.country)} in a ${colours.join(', ')} inspired kit`;
}

function compactPrompt({ teams, styleVersion }) {
  const countries = teams.map((team) => cleanText(team.country)).join(', ');
  const examples = teams.slice(0, 12).map(describeTeamKit).join('; ');

  return [
    `A fun illustrated US airport departure lounge after a football tournament, style version ${styleVersion}.`,
    'Retro 90\'s video game sports art style, wide web hero image, warm but slightly melancholy.',
    'Show one generic illustrated footballer for each eliminated country, sitting with suitcases and looking sad as they wait to go home.',
    `Eliminated countries represented: ${countries}.`,
    examples ? `Kit colour examples from current data: ${examples}.` : '',
    'Use each team\'s supplied primary, secondary and accent kit colours.',
    'Generic cartoon footballers only. No real people, no real player likenesses, no readable text, no logos, no brand names, no real federation badges.'
  ].filter(Boolean).join(' ');
}

function detailedPrompt({ teams, styleVersion }) {
  const teamDescriptions = teams.map(describeTeamKit).join('; ');

  return [
    `A fun illustrated US airport departure lounge after a football tournament, style version ${styleVersion}.`,
    'Retro 90\'s video game sports art style, wide web hero image, warm but slightly melancholy.',
    'Show eliminated football teams sitting with suitcases, tired and sad but good-humoured as they wait to go home.',
    `Include exactly one generic illustrated footballer from each eliminated country in their kit. Teams represented: ${teamDescriptions}.`,
    'Generic cartoon footballers only. No real people, no real player likenesses, no readable text, no logos, no brand names, no real federation badges.'
  ].join(' ');
}

function limitPromptLength(prompt, teams, styleVersion) {
  if (prompt.length <= MAX_PROMPT_LENGTH) {
    return prompt;
  }

  const compact = compactPrompt({ teams, styleVersion });

  if (compact.length <= MAX_PROMPT_LENGTH) {
    return compact;
  }

  return compact.slice(0, MAX_PROMPT_LENGTH - 1).trim();
}

function buildDepartureLoungePrompt({ loungeTeams = [], styleVersion } = {}) {
  const teams = sortTeams(loungeTeams);

  if (!teams.length) {
    return null;
  }

  const version = cleanStyleVersion(styleVersion);
  const prompt = teams.length > 16
    ? compactPrompt({ teams, styleVersion: version })
    : detailedPrompt({ teams, styleVersion: version });

  return limitPromptLength(prompt, teams, version);
}

function buildDepartureSceneHash({ loungeTeams = [], styleVersion } = {}) {
  const teams = sortTeams(loungeTeams);

  if (!teams.length) {
    return null;
  }

  const version = cleanStyleVersion(styleVersion);
  const hashPayload = {
    styleVersion: version,
    teams: teams.map((team) => ({
      country: cleanText(team.country),
      owner: cleanText(team.owner),
      kitPrimary: cleanText(team.kitPrimary).toLowerCase(),
      kitSecondary: cleanText(team.kitSecondary).toLowerCase(),
      kitAccent: cleanText(team.kitAccent).toLowerCase()
    }))
  };
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(hashPayload))
    .digest('hex')
    .slice(0, 32);

  return `v${version}-${digest}`.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
}

function getSafePromptPreview(prompt) {
  const preview = cleanText(prompt);

  if (!preview) {
    return null;
  }

  if (preview.length <= MAX_PROMPT_PREVIEW_LENGTH) {
    return preview;
  }

  return `${preview.slice(0, MAX_PROMPT_PREVIEW_LENGTH - 1).trim()}...`;
}

module.exports = {
  buildDepartureLoungePrompt,
  buildDepartureSceneHash,
  getSafePromptPreview
};
