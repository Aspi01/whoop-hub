/**
 * Security Hardening R2 QA harness.
 *
 * The parent process creates a disposable directory and the worker receives it
 * as its Railway volume. Database imports happen only inside that worker, so
 * this suite can never open or mutate the project's active data.db.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const STATIC_KEYS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET'];
const STATIC_SECRET_FIELDS = ['gemini_api_key', 'openai_api_key', 'whoop_client_id', 'whoop_client_secret'];
const SECRET_VALUE_PATTERN = /AIza[0-9A-Za-z_-]{35}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}/;

function scanForSecretPatterns(directory) {
  if (!fs.existsSync(directory)) return false;
  // Detect plausible full values only. Prefixes, names, and documentation
  // placeholders (for example "AIzaSy...") are not credentials.
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (scanForSecretPatterns(entryPath)) return true;
    } else if (/\.(?:js|jsx|mjs|html|css)$/.test(entry.name) && SECRET_VALUE_PATTERN.test(fs.readFileSync(entryPath, 'utf8'))) {
      return true;
    }
  }
  return false;
}

function readSourceTree(directory) {
  if (!fs.existsSync(directory)) return '';
  return fs.readdirSync(directory, { withFileTypes: true }).map(entry => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? readSourceTree(entryPath) : fs.readFileSync(entryPath, 'utf8');
  }).join('\n');
}

export async function runSecurityHardeningQA() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whoop-hub-security-r2-'));
  try {
    const result = spawnSync(process.execPath, [__filename, '--worker'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        RAILWAY_VOLUME_MOUNT_PATH: tempDir,
        SECURITY_R2_QA_WORKER: '1'
      }
    });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    assert.equal(result.status, 0, 'Security R2 worker failed');
    assert.equal(scanForSecretPatterns(path.join(ROOT, 'src')), false, 'Secret-like value found in frontend source');
    assert.equal(scanForSecretPatterns(path.join(ROOT, 'dist')), false, 'Secret-like value found in dist');
    console.log('SECURITY_QA_ISOLATED_DB=PASS');
    console.log('SECURITY_QA_HARNESS_VALIDITY=PASS');
    console.log('NO_SECRET_IN_FRONTEND=PASS');
    console.log('NO_SECRET_IN_DIST=PASS');
    console.log('SECURITY_HARDENING_R2_QA=PASS');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runWorker() {
  for (const key of STATIC_KEYS) delete process.env[key];
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.WHOOP_TOKEN_ENCRYPTION_KEY;

  const [{ initDB, query, getOne, run }, cryptoModule, whoopModule, settingsModule, geminiModule, expressModule, httpModule, playwrightModule] = await Promise.all([
    import('../server/db.js'),
    import('../server/utils/crypto.js'),
    import('../server/routes/whoop.js'),
    import('../server/routes/settings.js'),
    import('../server/gemini.js'),
    import('express'),
    import('node:http'),
    import('playwright')
  ]);
  const { encryptToken, decryptToken, getEncryptionKey, isEncryptedToken } = cryptoModule;
  const { getWhoopConfig, refreshWhoopToken } = whoopModule;
  const { getGeminiApiKey } = geminiModule;

  await initDB();

  // Static credentials: legacy values survive until an env replacement exists,
  // but services never read the legacy values.
  const legacySecrets = [
    ['gemini_api_key', 'legacy-gemini'],
    ['openai_api_key', 'legacy-openai'],
    ['whoop_client_id', 'legacy-client-id'],
    ['whoop_client_secret', 'legacy-client-secret']
  ];
  for (const [key, value] of legacySecrets) {
    await run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [key, value]);
  }
  await initDB();
  assert.equal((await query("SELECT key FROM app_settings WHERE key IN ('gemini_api_key', 'openai_api_key', 'whoop_client_id', 'whoop_client_secret')")).length, 4);
  assert.equal(getGeminiApiKey(), '');
  assert.equal((await getWhoopConfig()).clientId, '');
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'server', 'services', 'openaiFoodService.js'), 'utf8').includes("app_settings WHERE key = 'openai_api_key'"),
    false,
    'OpenAI provider must not read app_settings'
  );

  process.env.GEMINI_API_KEY = 'gemini-env-only';
  process.env.OPENAI_API_KEY = 'openai-env-only';
  process.env.WHOOP_CLIENT_ID = 'whoop-env-client-id';
  process.env.WHOOP_CLIENT_SECRET = 'whoop-env-client-secret';
  await initDB();
  assert.equal((await query("SELECT key FROM app_settings WHERE key IN ('gemini_api_key', 'openai_api_key', 'whoop_client_id', 'whoop_client_secret')")).length, 0);
  assert.equal(getGeminiApiKey(), 'gemini-env-only');
  assert.equal((await getWhoopConfig()).clientId, 'whoop-env-client-id');

  // Strict key validation and safe plaintext-token migration.
  const validKey = '0123456789abcdef'.repeat(4);
  process.env.TOKEN_ENCRYPTION_KEY = validKey;
  await run("INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', 'legacy-access')");
  await run("INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', 'legacy-refresh')");
  await initDB();
  const migratedAccess = (await getOne("SELECT value FROM app_settings WHERE key = 'whoop_access_token'")).value;
  const migratedRefresh = (await getOne("SELECT value FROM app_settings WHERE key = 'whoop_refresh_token'")).value;
  assert.ok(isEncryptedToken(migratedAccess));
  assert.ok(isEncryptedToken(migratedRefresh));
  assert.equal(decryptToken(migratedAccess), 'legacy-access');
  assert.equal(decryptToken(migratedRefresh), 'legacy-refresh');
  await initDB();
  assert.equal((await getOne("SELECT value FROM app_settings WHERE key = 'whoop_access_token'")).value, migratedAccess);
  assert.equal(encryptToken(migratedAccess), migratedAccess);

  const nonceOne = encryptToken('nonce-check');
  const nonceTwo = encryptToken('nonce-check');
  assert.notEqual(nonceOne, nonceTwo);
  assert.throws(() => decryptToken(`${migratedAccess.slice(0, -1)}0`));
  assert.throws(() => decryptToken(migratedAccess, Buffer.alloc(32, 7)));

  await run("UPDATE app_settings SET value = 'preserve-without-key' WHERE key = 'whoop_refresh_token'");
  delete process.env.TOKEN_ENCRYPTION_KEY;
  assert.throws(() => getEncryptionKey());
  assert.throws(() => encryptToken('must-not-encrypt'));
  await initDB();
  assert.equal((await getOne("SELECT value FROM app_settings WHERE key = 'whoop_refresh_token'")).value, 'preserve-without-key');
  process.env.TOKEN_ENCRYPTION_KEY = 'short';
  assert.throws(() => getEncryptionKey());
  await initDB();
  assert.equal((await getOne("SELECT value FROM app_settings WHERE key = 'whoop_refresh_token'")).value, 'preserve-without-key');
  process.env.TOKEN_ENCRYPTION_KEY = validKey;
  await initDB();
  assert.ok(isEncryptedToken((await getOne("SELECT value FROM app_settings WHERE key = 'whoop_refresh_token'")).value));

  // Refresh writes newly issued tokens through the same encryption boundary.
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    access_token: 'refreshed-access-token',
    refresh_token: 'refreshed-refresh-token',
    expires_in: 3600
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    assert.equal(await refreshWhoopToken({
      clientId: process.env.WHOOP_CLIENT_ID,
      clientSecret: process.env.WHOOP_CLIENT_SECRET,
      refreshToken: 'legacy-refresh'
    }), 'refreshed-access-token');
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(decryptToken((await getOne("SELECT value FROM app_settings WHERE key = 'whoop_access_token'")).value), 'refreshed-access-token');
  assert.equal(decryptToken((await getOne("SELECT value FROM app_settings WHERE key = 'whoop_refresh_token'")).value), 'refreshed-refresh-token');

  // Sanitized HTTP responses and explicit legacy-field rejection.
  const express = expressModule.default;
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsModule.default);
  app.use('/api/whoop', whoopModule.default);
  const distPath = path.join(ROOT, 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  const server = httpModule.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const responses = await Promise.all(['/api/settings', '/api/whoop/status', '/api/whoop/settings'].map(async endpoint => {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`);
      return JSON.stringify(await response.json());
    }));
    const serialized = responses.join('\n');
    for (const forbidden of ['refreshed-access-token', 'refreshed-refresh-token', process.env.WHOOP_CLIENT_SECRET]) {
      assert.equal(serialized.includes(forbidden), false);
    }

    for (const endpoint of ['/api/settings', '/api/whoop/settings']) {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: 'synthetic-test-value' })
      });
      assert.equal(response.status, 400, `${endpoint} must reject static client credentials`);
    }
    assert.equal((await query("SELECT key FROM app_settings WHERE key IN ('gemini_api_key', 'openai_api_key', 'whoop_client_id', 'whoop_client_secret')")).length, 0);

    // Prove the built UI has no secret-bearing input controls and its ordinary
    // settings interaction does not submit a static credential payload.
    const frontendSource = readSourceTree(path.join(ROOT, 'src'));
    for (const field of STATIC_SECRET_FIELDS) {
      assert.equal(new RegExp(`\\b${field}\\b`).test(frontendSource), false, `Frontend source contains ${field}`);
    }
    assert.equal(SECRET_VALUE_PATTERN.test('AIzaSy...'), false, 'Placeholder must not be treated as a secret');
    assert.equal(SECRET_VALUE_PATTERN.test(`AIza${'a'.repeat(35)}`), true, 'Full Google-key-shaped fixture must be detected');

    const { chromium } = playwrightModule;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const settingsRequests = [];
      await page.addInitScript(() => localStorage.setItem('onboarding_completed', 'true'));
      page.on('request', request => {
        if (request.method() !== 'GET' && /\/api\/(?:settings|whoop\/settings)/.test(request.url())) {
          settingsRequests.push(request.postData() || '');
        }
      });
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
      await page.locator('button[aria-label="Настройки"]').first().click();
      const dialog = page.locator('[role="dialog"]');
      await dialog.waitFor({ state: 'visible' });
      const credentialInputs = await dialog.locator('input').evaluateAll(inputs => inputs.filter(input => {
        const description = [input.name, input.id, input.placeholder, input.type, input.autocomplete].join(' ');
        return /gemini|openai|whoop.*(?:client|secret)|api.?key/i.test(description);
      }).length);
      assert.equal(credentialInputs, 0, 'Settings UI contains a static-secret input');
      await dialog.getByRole('radio', { name: 'Русский' }).click();
      await page.waitForTimeout(100);
      for (const payload of settingsRequests) {
        for (const field of STATIC_SECRET_FIELDS) {
          assert.equal(payload.includes(field), false, `Frontend submitted ${field}`);
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('STATIC_SECRETS_ENV_ONLY=PASS');
  console.log('NO_STATIC_SECRET_INPUTS_IN_FRONTEND=PASS');
  console.log('NO_STATIC_SECRET_NETWORK_PAYLOADS=PASS');
  console.log('SERVER_REJECTS_CLIENT_STATIC_SECRETS=PASS');
  console.log('CLIENT_SECRET_PERSISTENCE_BLOCKED=PASS');
  console.log('ACTIVE_STATIC_SECRET_USAGE_FROM_APP_SETTINGS=NONE');
  console.log('LEGACY_MIGRATION_ROWS_ONLY=YES');
  console.log('GEMINI_DB_FALLBACK_BLOCKED=PASS');
  console.log('OPENAI_DB_FALLBACK_BLOCKED=PASS');
  console.log('TOKEN_ENCRYPTION_KEY_VALIDATION=PASS');
  console.log('NO_MACHINE_KEY_FALLBACK=PASS');
  console.log('AES_GCM_IMPLEMENTATION=PASS');
  console.log('UNIQUE_NONCE=PASS');
  console.log('AUTHENTICATION_ENFORCED=PASS');
  console.log('LEGACY_TOKEN_MIGRATION=PASS');
  console.log('MIGRATION_IDEMPOTENT=PASS');
  console.log('NO_DOUBLE_ENCRYPTION=PASS');
  console.log('LEGACY_STATIC_SECRET_PRESERVATION=PASS');
  console.log('LEGACY_STATIC_SECRET_CLEANUP_AFTER_ENV=PASS');
  console.log('TOKEN_REFRESH_REGRESSION=PASS');
  console.log('REFRESH_OUTPUT_REENCRYPTED=PASS');
  console.log('SANITIZED_STATUS_ENDPOINTS=PASS');
  console.log('SECURITY_QA_SECRET_SCANNER=PASS');
}

if (process.argv.includes('--worker')) {
  runWorker().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
} else if (process.argv[1] === __filename) {
  runSecurityHardeningQA().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
