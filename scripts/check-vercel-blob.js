#!/usr/bin/env node

const path = require('node:path');
const dotenv = require('dotenv');
const {
  head,
  list,
  put
} = require('@vercel/blob');

const projectRoot = path.resolve(__dirname, '..');
const healthAssetPath = 'departure-scenes/_health/blob-health.txt';
const healthPrefix = 'departure-scenes/_health/';

dotenv.config({ path: path.join(projectRoot, '.env') });

function getToken() {
  return String(process.env.BLOB_READ_WRITE_TOKEN || '');
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

function printSafeDiagnostics(diagnostics) {
  console.log(`has token: ${diagnostics.hasToken}`);
  console.log(`token length: ${diagnostics.tokenLength}`);
  console.log(`first 4 chars: ${diagnostics.first4Chars}`);
  console.log(`last 4 chars: ${diagnostics.last4Chars}`);
  console.log(`contains whitespace: ${diagnostics.containsWhitespace}`);
}

function cleanErrorMessage(error) {
  return error?.message || 'Vercel Blob check failed';
}

async function run() {
  const rawToken = getToken();
  const diagnostics = tokenDiagnostics(rawToken);
  const token = rawToken.trim();
  const content = `world-cup-sweepstake blob health ${new Date().toISOString()}\n`;
  let uploadSucceeded = false;
  let returnedUrlPresent = false;
  let metadataReadSucceeded = false;
  let listSucceeded = false;

  printSafeDiagnostics(diagnostics);

  try {
    if (!diagnostics.hasToken) {
      throw new Error('Blob is not configured: BLOB_READ_WRITE_TOKEN is missing');
    }

    const uploaded = await put(healthAssetPath, content, {
      token,
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false,
      allowOverwrite: true
    });
    uploadSucceeded = true;
    returnedUrlPresent = Boolean(uploaded.url);

    const metadata = await head(healthAssetPath, { token });
    metadataReadSucceeded = Boolean(metadata?.url && metadata?.pathname === healthAssetPath);

    const listed = await list({
      token,
      prefix: healthPrefix
    });
    listSucceeded = Array.isArray(listed.blobs);
  } finally {
    console.log(`upload succeeded: ${uploadSucceeded}`);
    console.log(`returned URL present: ${returnedUrlPresent}`);
    console.log(`metadata read succeeded: ${metadataReadSucceeded}`);
    console.log(`list succeeded: ${listSucceeded}`);
  }

  if (!uploadSucceeded || !metadataReadSucceeded || !listSucceeded) {
    throw new Error('Blob health check did not complete successfully');
  }
}

run().catch((error) => {
  console.error(`Blob check failed: ${cleanErrorMessage(error)}`);

  if (process.env.DEBUG === 'true') {
    console.error(error.stack || error);
  }

  process.exit(1);
});
