const fs = require('node:fs/promises');
const path = require('node:path');

const {
  buildDepartureLoungePrompt,
  buildDepartureSceneHash
} = require('./departureScenePromptService');

const GENERATED_SCENE_DIR = path.join(__dirname, '..', 'public', 'generated', 'departure-scenes');
const GENERATED_SCENE_URL_BASE = '/generated/departure-scenes';
const OPENAI_IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const OPENAI_IMAGE_MODEL = 'gpt-image-2';
const PREVIEW_LENGTH = 280;

const readyScenes = new Map();
const generationPromises = new Map();
const sceneErrors = new Map();
let previousReadyScene = null;

function getStyleVersion() {
  return String(process.env.DEPARTURE_SCENE_STYLE_VERSION || '1').trim() || '1';
}

function getOpenAiApiKey() {
  return String(process.env.OPENAI_API_KEY || '').trim();
}

function imageGenerationEnabled() {
  return process.env.IMAGE_GENERATION_ENABLED === 'true';
}

function safeErrorMessage(error) {
  if (!error) {
    return null;
  }

  if (typeof error.safeMessage === 'string') {
    return error.safeMessage;
  }

  return 'Departure lounge image generation failed';
}

function promptPreview(prompt) {
  if (!prompt) {
    return null;
  }

  if (prompt.length <= PREVIEW_LENGTH) {
    return prompt;
  }

  return `${prompt.slice(0, PREVIEW_LENGTH - 3).trim()}...`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function truncateText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function renderDepartureBoardImage({ departureBoard = [] } = {}) {
  const rows = Array.isArray(departureBoard) ? departureBoard : [];
  const rowHeight = 34;
  const width = 1180;
  const height = Math.max(220, 116 + rows.length * rowHeight);
  const headers = [
    { label: 'Country', x: 44 },
    { label: 'Owner', x: 250 },
    { label: 'Flight', x: 430 },
    { label: 'Gate', x: 560 },
    { label: 'Status', x: 665 },
    { label: 'Reason', x: 800 }
  ];
  const rowMarkup = rows.length
    ? rows.map((row, index) => {
      const y = 104 + index * rowHeight;
      const status = row.flightStatus || row.status || 'Boarding';
      const reason = row.reason || row.sourceLabel || '';

      return `<g transform="translate(0 ${y})">
        <rect x="28" y="-23" width="1124" height="30" rx="3" fill="${index % 2 === 0 ? '#172033' : '#111827'}"/>
        <text x="44" y="-3">${escapeXml(truncateText(row.country, 22))}</text>
        <text x="250" y="-3">${escapeXml(truncateText(row.owner || 'Unassigned', 18))}</text>
        <text x="430" y="-3">${escapeXml(truncateText(row.flightCode, 12))}</text>
        <text x="560" y="-3">${escapeXml(truncateText(row.gate, 10))}</text>
        <text x="665" y="-3">${escapeXml(truncateText(status, 14))}</text>
        <text x="800" y="-3">${escapeXml(truncateText(reason, 42))}</text>
      </g>`;
    }).join('')
    : `<text x="44" y="124" fill="#d1d5db">No eliminated teams yet</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Eliminated teams departure board">
    <rect width="${width}" height="${height}" fill="#090d16"/>
    <rect x="18" y="18" width="1144" height="${height - 36}" rx="10" fill="#0f172a" stroke="#334155" stroke-width="2"/>
    <text x="44" y="58" fill="#f8fafc" font-family="Arial, sans-serif" font-size="28" font-weight="700">DEPARTURES</text>
    <text x="1080" y="58" fill="#facc15" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="end">HOME</text>
    <g fill="#94a3b8" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1">
      ${headers.map((header) => `<text x="${header.x}" y="88">${escapeXml(header.label.toUpperCase())}</text>`).join('')}
    </g>
    <g fill="#f8fafc" font-family="Arial, sans-serif" font-size="16" font-weight="700">
      ${rowMarkup}
    </g>
  </svg>`;
}

async function loadEliminatedTeamsData() {
  const { getEliminatedTeamsData } = require('./sweepstakeService');
  return getEliminatedTeamsData();
}

function buildSceneInput(eliminatedData = {}) {
  const loungeTeams = Array.isArray(eliminatedData.loungeTeams) ? eliminatedData.loungeTeams : [];
  const departureBoard = Array.isArray(eliminatedData.departureBoard) ? eliminatedData.departureBoard : [];
  const styleVersion = getStyleVersion();
  const sceneHash = buildDepartureSceneHash({ loungeTeams, styleVersion });
  const loungePrompt = buildDepartureLoungePrompt({ loungeTeams, styleVersion });
  const boardSvg = renderDepartureBoardImage({ departureBoard });

  return {
    loungeTeams,
    departureBoard,
    styleVersion,
    sceneHash,
    loungePrompt,
    loungePromptPreview: promptPreview(loungePrompt),
    boardSvg
  };
}

function sceneFilePath(sceneHash) {
  return path.join(GENERATED_SCENE_DIR, `${sceneHash}.png`);
}

function sceneUrl(sceneHash) {
  return `${GENERATED_SCENE_URL_BASE}/${sceneHash}.png`;
}

async function getReadySceneFromDisk(input) {
  if (!input.sceneHash) {
    return null;
  }

  const cached = readyScenes.get(input.sceneHash);

  if (cached) {
    return cached;
  }

  try {
    const stats = await fs.stat(sceneFilePath(input.sceneHash));
    const scene = {
      sceneHash: input.sceneHash,
      styleVersion: input.styleVersion,
      loungePromptPreview: input.loungePromptPreview,
      loungeImageUrl: sceneUrl(input.sceneHash),
      boardImageUrl: null,
      generatedAt: stats.mtime.toISOString(),
      errorMessage: null
    };

    readyScenes.set(input.sceneHash, scene);
    previousReadyScene = scene;
    return scene;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      return null;
    }

    return null;
  }
}

function buildPublicState({ status, input, readyScene = null, errorMessage = null }) {
  const canUsePreviousScene = status === 'generating' || status === 'error';
  const fallbackScene = readyScene || (canUsePreviousScene ? previousReadyScene : null);

  return {
    status,
    sceneHash: input.sceneHash,
    styleVersion: input.styleVersion,
    loungePromptPreview: input.loungePromptPreview,
    loungeImageUrl: readyScene?.loungeImageUrl || fallbackScene?.loungeImageUrl || null,
    boardImageUrl: null,
    generatedAt: readyScene?.generatedAt || fallbackScene?.generatedAt || null,
    errorMessage
  };
}

async function getDepartureSceneState(eliminatedData = null) {
  const data = eliminatedData || await loadEliminatedTeamsData();
  const input = buildSceneInput(data);

  if (!input.loungeTeams.length) {
    return buildPublicState({ status: 'empty', input });
  }

  const readyScene = await getReadySceneFromDisk(input);

  if (readyScene) {
    return buildPublicState({ status: 'ready', input, readyScene });
  }

  if (generationPromises.has(input.sceneHash)) {
    return buildPublicState({ status: 'generating', input });
  }

  if (sceneErrors.has(input.sceneHash)) {
    return buildPublicState({
      status: 'error',
      input,
      errorMessage: sceneErrors.get(input.sceneHash)
    });
  }

  if (!imageGenerationEnabled()) {
    return buildPublicState({ status: 'disabled', input });
  }

  if (!getOpenAiApiKey()) {
    return buildPublicState({ status: 'missing_api_key', input });
  }

  return buildPublicState({ status: 'pending', input });
}

async function callOpenAiImageGeneration(prompt) {
  const response = await fetch(OPENAI_IMAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'low'
    })
  });

  if (!response.ok) {
    const error = new Error(`OpenAI image generation failed with status ${response.status}`);
    error.safeMessage = `Image generation failed with status ${response.status}`;
    throw error;
  }

  const payload = await response.json();
  const imageBase64 = payload?.data?.[0]?.b64_json;

  if (!imageBase64) {
    const error = new Error('OpenAI image response did not include image data');
    error.safeMessage = 'Image generation did not return image data';
    throw error;
  }

  return Buffer.from(imageBase64, 'base64');
}

async function writeGeneratedScene(sceneHash, imageBytes) {
  await fs.mkdir(GENERATED_SCENE_DIR, { recursive: true });
  await fs.writeFile(sceneFilePath(sceneHash), imageBytes);
}

async function generateDepartureLoungeImage(eliminatedData = null, { force = false } = {}) {
  const data = eliminatedData || await loadEliminatedTeamsData();
  const input = buildSceneInput(data);

  if (!input.loungeTeams.length) {
    return buildPublicState({ status: 'empty', input });
  }

  if (!force) {
    const existingScene = await getReadySceneFromDisk(input);

    if (existingScene) {
      return buildPublicState({ status: 'ready', input, readyScene: existingScene });
    }
  }

  if (!imageGenerationEnabled()) {
    return buildPublicState({ status: 'disabled', input });
  }

  if (!getOpenAiApiKey()) {
    return buildPublicState({ status: 'missing_api_key', input });
  }

  const imageBytes = await callOpenAiImageGeneration(input.loungePrompt);
  await writeGeneratedScene(input.sceneHash, imageBytes);

  const scene = {
    sceneHash: input.sceneHash,
    styleVersion: input.styleVersion,
    loungePromptPreview: input.loungePromptPreview,
    loungeImageUrl: sceneUrl(input.sceneHash),
    boardImageUrl: null,
    generatedAt: new Date().toISOString(),
    errorMessage: null
  };

  readyScenes.set(input.sceneHash, scene);
  sceneErrors.delete(input.sceneHash);
  previousReadyScene = scene;

  return buildPublicState({ status: 'ready', input, readyScene: scene });
}

async function ensureDepartureSceneGenerated({ eliminatedData = null, force = false } = {}) {
  const data = eliminatedData || await loadEliminatedTeamsData();
  const input = buildSceneInput(data);

  if (!input.loungeTeams.length) {
    return buildPublicState({ status: 'empty', input });
  }

  if (!force) {
    const existingScene = await getReadySceneFromDisk(input);

    if (existingScene) {
      return buildPublicState({ status: 'ready', input, readyScene: existingScene });
    }
  }

  if (!imageGenerationEnabled()) {
    return buildPublicState({ status: 'disabled', input });
  }

  if (!getOpenAiApiKey()) {
    return buildPublicState({ status: 'missing_api_key', input });
  }

  if (!generationPromises.has(input.sceneHash)) {
    sceneErrors.delete(input.sceneHash);

    const promise = generateDepartureLoungeImage(data, { force })
      .catch((error) => {
        const errorMessage = safeErrorMessage(error);
        sceneErrors.set(input.sceneHash, errorMessage);
        return buildPublicState({
          status: 'error',
          input,
          errorMessage
        });
      })
      .finally(() => {
        generationPromises.delete(input.sceneHash);
      });

    generationPromises.set(input.sceneHash, promise);
  }

  return buildPublicState({ status: 'generating', input });
}

module.exports = {
  getDepartureSceneState,
  ensureDepartureSceneGenerated,
  generateDepartureLoungeImage,
  renderDepartureBoardImage
};
