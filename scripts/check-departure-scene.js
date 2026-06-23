#!/usr/bin/env node

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { head, list, put } = require('@vercel/blob');
const { uploadWithRetry } = require('../src/services/blobStorageService');

const HEALTH_PREFIX = 'departure-scenes/_health/';
const TEXT_HEALTH_PATH = `${HEALTH_PREFIX}departure-scene-text.txt`;
const FIXED_SVG_HEALTH_PATH = `${HEALTH_PREFIX}departure-scene-fixed.svg`;
const BOARD_HEALTH_PATH = `${HEALTH_PREFIX}departure-board.svg`;
const LOUNGE_HEALTH_PATH = `${HEALTH_PREFIX}lounge.png`;
const FIXED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text x="10" y="40">Blob SVG health</text></svg>';

function cleanEnv(name) {
  return String(process.env[name] || '').trim();
}

function tokenDiagnostics(token) {
  const trimmedToken = token.trim();

  return {
    hasToken: trimmedToken.length > 0,
    tokenLength: trimmedToken.length,
    first4Chars: trimmedToken.slice(0, 4),
    last4Chars: trimmedToken.slice(-4),
    containsWhitespace: /\s/.test(token)
  };
}

function printDiagnostics() {
  const diagnostics = tokenDiagnostics(String(process.env.BLOB_READ_WRITE_TOKEN || ''));

  console.log('departure scene diagnostics');
  console.log(`has BLOB_READ_WRITE_TOKEN: ${diagnostics.hasToken}`);
  console.log(`token length: ${diagnostics.tokenLength}`);
  console.log(`first 4 chars: ${diagnostics.first4Chars}`);
  console.log(`last 4 chars: ${diagnostics.last4Chars}`);
  console.log(`contains whitespace: ${diagnostics.containsWhitespace}`);
  console.log(`IMAGE_GENERATION_ENABLED: ${cleanEnv('IMAGE_GENERATION_ENABLED') || 'false'}`);
  console.log(`CHECK_DEPARTURE_SCENE_GENERATE: ${cleanEnv('CHECK_DEPARTURE_SCENE_GENERATE') || 'false'}`);
  console.log(`style version: ${cleanEnv('DEPARTURE_SCENE_STYLE_VERSION') || '1'}`);
}

function safeErrorMessage(error) {
  return error?.message || 'Departure scene check failed';
}

function hasDisallowedControlCharacters(value) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function validateSvg(svg) {
  const failures = [];

  if (typeof svg !== 'string') {
    failures.push('SVG render did not return a string');
    return failures;
  }

  if (!svg.length) {
    failures.push('SVG render returned an empty string');
  }

  if (!svg.includes('<svg')) {
    failures.push('SVG output does not include <svg');
  }

  if (!svg.includes('xmlns=')) {
    failures.push('SVG output does not include xmlns');
  }

  if (svg.includes('undefined') || svg.includes('null')) {
    failures.push('SVG output contains undefined/null text');
  }

  if (hasDisallowedControlCharacters(svg)) {
    failures.push('SVG output contains disallowed control characters');
  }

  return failures;
}

async function uploadHealthAsset({ pathname, content, contentType, token }) {
  console.log(`uploading ${pathname}`);
  const body = String(contentType || '').toLowerCase().startsWith('image/svg+xml')
    ? Buffer.from(content, 'utf8')
    : content;
  const uploaded = await uploadWithRetry({
    pathname,
    content: body,
    options: {
      token,
      access: 'public',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true
    }
  });

  return {
    uploaded: true,
    urlPresent: Boolean(uploaded?.url),
    pathname: uploaded?.pathname || pathname,
    contentType: uploaded?.contentType || contentType
  };
}

async function uploadLoungeHealthAsset({ prompt, token }) {
  const OpenAI = require('openai');
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

  return uploadHealthAsset({
    pathname: LOUNGE_HEALTH_PATH,
    content: Buffer.from(b64Json, 'base64'),
    contentType: 'image/png',
    token
  });
}

async function main() {
  printDiagnostics();

  const blobToken = cleanEnv('BLOB_READ_WRITE_TOKEN');
  const failures = [];

  if (!blobToken) {
    throw new Error('Blob is not configured: BLOB_READ_WRITE_TOKEN is missing');
  }

  const textUpload = await uploadHealthAsset({
    pathname: TEXT_HEALTH_PATH,
    content: `departure scene blob text health ${new Date().toISOString()}\n`,
    contentType: 'text/plain',
    token: blobToken
  });
  console.log(`text upload succeeded: ${textUpload.uploaded}`);
  console.log(`text returned URL present: ${textUpload.urlPresent}`);

  const fixedSvgUpload = await uploadHealthAsset({
    pathname: FIXED_SVG_HEALTH_PATH,
    content: FIXED_SVG,
    contentType: 'image/svg+xml; charset=utf-8',
    token: blobToken
  });
  console.log(`fixed SVG upload succeeded: ${fixedSvgUpload.uploaded}`);
  console.log(`fixed SVG returned URL present: ${fixedSvgUpload.urlPresent}`);

  const { getEliminatedTeamsData } = require('../src/services/sweepstakeService');
  const {
    buildDepartureLoungePrompt,
    buildDepartureSceneHash,
    getSafePromptPreview
  } = require('../src/services/departureScenePromptService');
  const { renderDepartureBoardSvg } = require('../src/services/departureBoardRenderService');

  const eliminatedData = await getEliminatedTeamsData();
  const loungeTeams = eliminatedData.loungeTeams || [];
  const departureBoard = eliminatedData.departureBoard || [];
  const styleVersion = cleanEnv('DEPARTURE_SCENE_STYLE_VERSION') || '1';
  const prompt = buildDepartureLoungePrompt({ loungeTeams, styleVersion });
  const sceneHash = buildDepartureSceneHash({ loungeTeams, styleVersion });
  const boardSvg = renderDepartureBoardSvg({ departureBoard, generatedAt: new Date().toISOString() });
  const boardSvgBytes = Buffer.byteLength(boardSvg, 'utf8');

  if (loungeTeams.length && !prompt) {
    failures.push('prompt was not built for eliminated lounge teams');
  }

  if (prompt && prompt.length > 2500) {
    failures.push('prompt exceeds 2500 characters');
  }

  if (loungeTeams.length && !sceneHash) {
    failures.push('sceneHash was not built for eliminated lounge teams');
  }

  failures.push(...validateSvg(boardSvg));

  console.log(`lounge team count: ${loungeTeams.length}`);
  console.log(`departure board count: ${departureBoard.length}`);
  console.log(`prompt built: ${Boolean(prompt)}`);
  console.log(`prompt length: ${prompt ? prompt.length : 0}`);
  console.log(`prompt preview present: ${Boolean(getSafePromptPreview(prompt))}`);
  console.log(`sceneHash present: ${Boolean(sceneHash)}`);
  console.log(`board SVG type: ${typeof boardSvg}`);
  console.log(`board SVG length: ${boardSvg.length}`);
  console.log(`board SVG byte length: ${boardSvgBytes}`);
  console.log(`board SVG includes xmlns: ${boardSvg.includes('xmlns=')}`);
  console.log(`board SVG has disallowed control characters: ${hasDisallowedControlCharacters(boardSvg)}`);

  if (!failures.length) {
    const boardUpload = await uploadHealthAsset({
      pathname: BOARD_HEALTH_PATH,
      content: boardSvg,
      contentType: 'image/svg+xml; charset=utf-8',
      token: blobToken
    });
    console.log(`board SVG upload succeeded: ${boardUpload.uploaded}`);
    console.log(`board SVG returned URL present: ${boardUpload.urlPresent}`);

    const boardMetadata = await head(BOARD_HEALTH_PATH, { token: blobToken });
    console.log(`board SVG metadata read succeeded: ${Boolean(boardMetadata?.url && boardMetadata?.pathname === BOARD_HEALTH_PATH)}`);
    console.log(`board SVG metadata content type: ${boardMetadata?.contentType || 'unknown'}`);
    console.log(`board SVG metadata size: ${boardMetadata?.size || 0}`);

    const listed = await list({
      token: blobToken,
      prefix: HEALTH_PREFIX
    });
    console.log(`health prefix list succeeded: ${Array.isArray(listed.blobs)}`);
    console.log(`health prefix asset count: ${Array.isArray(listed.blobs) ? listed.blobs.length : 0}`);
  }

  const shouldGenerate = process.env.IMAGE_GENERATION_ENABLED === 'true'
    && process.env.CHECK_DEPARTURE_SCENE_GENERATE === 'true';

  if (shouldGenerate) {
    if (!prompt) {
      failures.push('OpenAI check requested but prompt is missing');
    } else if (!cleanEnv('OPENAI_API_KEY')) {
      failures.push('OpenAI check requested but OPENAI_API_KEY is missing');
    } else {
      const loungeUpload = await uploadLoungeHealthAsset({ prompt, token: blobToken });
      console.log(`lounge health upload succeeded: ${loungeUpload.uploaded}`);
      console.log(`lounge health returned URL present: ${loungeUpload.urlPresent}`);
    }
  } else {
    console.log('OpenAI generation skipped: set IMAGE_GENERATION_ENABLED=true and CHECK_DEPARTURE_SCENE_GENERATE=true to opt in');
  }

  if (failures.length) {
    throw new Error(failures.join('; '));
  }
}

process.on('unhandledRejection', (error) => {
  console.error(`departure scene check failed: ${safeErrorMessage(error)}`);

  if (process.env.DEBUG === 'true' && error?.stack) {
    console.error(error.stack);
  }

  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  console.error(`departure scene check failed: ${safeErrorMessage(error)}`);

  if (process.env.DEBUG === 'true' && error?.stack) {
    console.error(error.stack);
  }

  process.exitCode = 1;
});

main()
  .then(() => {
    if (!process.exitCode) {
      console.log('departure scene check passed');
    }
  })
  .catch((error) => {
    console.error(`departure scene check failed: ${safeErrorMessage(error)}`);

    if (process.env.DEBUG === 'true' && error.stack) {
      console.error(error.stack);
    }

    process.exitCode = 1;
  });
