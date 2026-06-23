const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { put } = require('@vercel/blob');
const OpenAI = require('openai');
const { getEliminatedTeamsData } = require('../src/services/sweepstakeService');
const {
  buildDepartureLoungePrompt,
  buildDepartureSceneHash,
  getSafePromptPreview
} = require('../src/services/departureScenePromptService');
const { renderDepartureBoardSvg } = require('../src/services/departureBoardRenderService');

const BOARD_HEALTH_PATH = 'departure-scenes/_health/departure-board.svg';
const LOUNGE_HEALTH_PATH = 'departure-scenes/_health/lounge.png';
const DEFAULT_BLOB_TIMEOUT_MS = 10000;

function cleanEnv(name) {
  return String(process.env[name] || '').trim();
}

function hasEnv(name) {
  return Boolean(cleanEnv(name));
}

function blobTimeoutMs() {
  const value = Number.parseInt(process.env.BLOB_REQUEST_TIMEOUT_MS || '', 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BLOB_TIMEOUT_MS;
}

async function withBlobTimeout(operation) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), blobTimeoutMs());

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function printDiagnostics() {
  console.log('departure scene diagnostics');
  console.log(`has OPENAI_API_KEY: ${hasEnv('OPENAI_API_KEY')}`);
  console.log(`has BLOB_READ_WRITE_TOKEN: ${hasEnv('BLOB_READ_WRITE_TOKEN')}`);
  console.log(`IMAGE_GENERATION_ENABLED: ${cleanEnv('IMAGE_GENERATION_ENABLED') || 'false'}`);
  console.log(`style version: ${cleanEnv('DEPARTURE_SCENE_STYLE_VERSION') || '1'}`);
}

async function uploadBoardHealthAsset({ svg, token }) {
  const blob = await withBlobTimeout((abortSignal) => put(BOARD_HEALTH_PATH, svg, {
    token,
    access: 'public',
    contentType: 'image/svg+xml',
    addRandomSuffix: false,
    allowOverwrite: true,
    abortSignal
  }));

  return Boolean(blob?.url);
}

async function generateAndUploadHealthLounge({ prompt, token }) {
  const openai = new OpenAI({ apiKey: cleanEnv('OPENAI_API_KEY') });
  const result = await openai.images.generate({
    model: 'gpt-image-2',
    prompt,
    size: '1536x1024',
    quality: 'medium',
    output_format: 'png'
  });
  const b64Json = result?.data?.[0]?.b64_json;

  if (!b64Json) {
    throw new Error('OpenAI image response did not include image data');
  }

  const blob = await withBlobTimeout((abortSignal) => put(LOUNGE_HEALTH_PATH, Buffer.from(b64Json, 'base64'), {
    token,
    access: 'public',
    contentType: 'image/png',
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: true,
    onUploadProgress: () => {},
    abortSignal
  }));

  return Boolean(blob?.url);
}

async function main() {
  printDiagnostics();

  const eliminatedData = await getEliminatedTeamsData();
  const loungeTeams = eliminatedData.loungeTeams || [];
  const departureBoard = eliminatedData.departureBoard || [];
  const styleVersion = cleanEnv('DEPARTURE_SCENE_STYLE_VERSION') || '1';
  const prompt = buildDepartureLoungePrompt({ loungeTeams, styleVersion });
  const sceneHash = buildDepartureSceneHash({ loungeTeams, styleVersion });
  const boardSvg = renderDepartureBoardSvg({ departureBoard, generatedAt: new Date().toISOString() });
  const failures = [];

  if (loungeTeams.length && !prompt) {
    failures.push('prompt was not built for eliminated lounge teams');
  }

  if (prompt && prompt.length > 2500) {
    failures.push('prompt exceeds 2500 characters');
  }

  if (loungeTeams.length && !sceneHash) {
    failures.push('sceneHash was not built for eliminated lounge teams');
  }

  if (!boardSvg.includes('<svg') || !boardSvg.includes('Departure board')) {
    failures.push('departure board SVG did not render');
  }

  console.log(`lounge team count: ${loungeTeams.length}`);
  console.log(`departure board count: ${departureBoard.length}`);
  console.log(`prompt built: ${Boolean(prompt)}`);
  console.log(`prompt length: ${prompt ? prompt.length : 0}`);
  console.log(`prompt preview present: ${Boolean(getSafePromptPreview(prompt))}`);
  console.log(`sceneHash present: ${Boolean(sceneHash)}`);
  console.log(`board SVG length: ${boardSvg.length}`);

  const blobToken = cleanEnv('BLOB_READ_WRITE_TOKEN');

  if (blobToken) {
    const boardUploaded = await uploadBoardHealthAsset({ svg: boardSvg, token: blobToken });
    console.log(`board health upload succeeded: ${boardUploaded}`);

    if (!boardUploaded) {
      failures.push('board health upload failed');
    }
  } else {
    console.log('board health upload skipped: Blob token missing');
  }

  const shouldGenerate = process.env.IMAGE_GENERATION_ENABLED === 'true'
    && process.env.CHECK_DEPARTURE_SCENE_GENERATE === 'true';

  if (shouldGenerate) {
    if (!prompt) {
      failures.push('OpenAI check requested but prompt is missing');
    } else if (!hasEnv('OPENAI_API_KEY')) {
      failures.push('OpenAI check requested but OPENAI_API_KEY is missing');
    } else if (!blobToken) {
      failures.push('OpenAI check requested but BLOB_READ_WRITE_TOKEN is missing');
    } else {
      const loungeUploaded = await generateAndUploadHealthLounge({ prompt, token: blobToken });
      console.log(`lounge health upload succeeded: ${loungeUploaded}`);

      if (!loungeUploaded) {
        failures.push('lounge health upload failed');
      }
    }
  } else {
    console.log('OpenAI generation skipped: set IMAGE_GENERATION_ENABLED=true and CHECK_DEPARTURE_SCENE_GENERATE=true to opt in');
  }

  if (failures.length) {
    throw new Error(failures.join('; '));
  }
}

main()
  .then(() => {
    console.log('departure scene check passed');
  })
  .catch((error) => {
    console.error(`departure scene check failed: ${error.message}`);

    if (process.env.DEBUG === 'true' && error.stack) {
      console.error(error.stack);
    }

    process.exit(1);
  });
