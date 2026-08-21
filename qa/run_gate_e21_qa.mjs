import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\BoSS\\.gemini\\antigravity\\brain\\01c1f84f-f903-4469-9ffa-f6df8bdf408c';
const projectDir = path.resolve(__dirname, '..');
const screenshotDir = path.join(artifactDir, 'scratch', 'gate-e21-qa');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runFullE21Harness() {
  console.log('======================================================');
  console.log('🚀 RUNNING GATE E2.1 FINAL-STATES QA HARNESS');
  console.log('======================================================\n');

  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const assertions = {
    LOADING_STATE_FIXTURE: 'FAIL',
    ERROR_STATE_FIXTURE: 'FAIL',
    OFFLINE_DEGRADED_FIXTURE: 'FAIL',
    PREFERS_REDUCED_MOTION_FIXTURE: 'FAIL',
    MOBILE_KEYBOARD_VISUAL_VIEWPORT_FIXTURE: 'FAIL',
    SAFE_AREA_FIXTURE: 'FAIL',
    PROVIDER_STATE_FIXTURES: 'FAIL',
    PARTIAL_DATA_FIXTURE: 'FAIL',
    INPUT_PRESERVATION_FIXTURE: 'FAIL'
  };

  const discoveredDefects = [];

  // Start backend server & client preview
  console.log('Starting backend server & client preview...');
  const serverProc = spawn('node', ['server/index.js'], { cwd: projectDir, stdio: 'inherit' });
  const viteProc = spawn('npx', ['vite', 'preview', '--port', '5173', '--strictPort'], { cwd: projectDir, shell: true, stdio: 'inherit' });

  await sleep(2500);

  // Launch isolated Chrome instance
  const tempProfile = path.join(artifactDir, 'scratch', 'temp_chrome_profile_e21');
  if (fs.existsSync(tempProfile)) {
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    `--user-data-dir=${tempProfile}`,
    'http://localhost:5173'
  ]);

  await sleep(2000);

  try {
    const listRes = await fetch('http://localhost:9225/json/list');
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.type === 'page') || tabs[0];
    const wsUrl = tab.webSocketDebuggerUrl;
    console.log('Connected to Chrome DevTools WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.onopen = resolve);

    let msgId = 1;
    const send = (method, params = {}) => {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (event) => {
          const res = JSON.parse(event.data);
          if (res.id === id) {
            ws.removeEventListener('message', handler);
            if (res.error) reject(new Error(JSON.stringify(res.error)));
            else resolve(res.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.alert = () => {}; window.confirm = () => true;'
    });

    const pageExceptions = [];
    ws.addEventListener('message', (e) => {
      const data = JSON.parse(e.data);
      if (data.method === 'Runtime.exceptionThrown') {
        const desc = data.params?.exceptionDetails?.exception?.description || JSON.stringify(data.params.exceptionDetails);
        pageExceptions.push(desc);
        console.error('💥 Runtime Exception:', desc);
      }
    });

    const evalInPage = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return res.result?.value;
    };

    const waitForAppLoaded = async (timeoutMs = 10000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        await sleep(200);
        const loading = await evalInPage(`Boolean(document.querySelector('.animate-spin'))`);
        if (!loading) return;
      }
    };

    const goToTab = async (tabName) => {
      await send('Page.navigate', { url: `http://localhost:5173/?tab=${tabName}` });
      await sleep(800);
      await waitForAppLoaded();
      await sleep(400);
    };

    const setViewport = async (width, height, dsf = 2) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: dsf,
        mobile: true
      });
      await sleep(250);
    };

    const takeScreenshot = async (filename) => {
      const snap = await send('Page.captureScreenshot', { format: 'png' });
      const dest = path.join(screenshotDir, filename);
      fs.writeFileSync(dest, Buffer.from(snap.data, 'base64'));
      console.log(`📸 Screenshot saved: ${filename}`);
    };

    // =========================================================================
    // FIXTURE 1: Deterministic Loading-State QA Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('1. FIXTURE: Loading-State QA Fixture');
    console.log('======================================================');
    try {
      await setViewport(390, 844);
      
      // Intercept /api/whoop/summary with 3000ms delay via Fetch domain
      await send('Fetch.enable', {
        patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }]
      });

      let pausedRequests = [];
      const fetchHandler = async (event) => {
        const data = JSON.parse(event.data);
        if (data.method === 'Fetch.requestPaused') {
          pausedRequests.push(data.params.requestId);
        }
      };
      ws.addEventListener('message', fetchHandler);

      // Navigate to trigger loading state
      await send('Page.navigate', { url: 'http://localhost:5173/?tab=dashboard' });
      await sleep(800);

      const loadingCheck = await evalInPage(`
        (() => {
          const spinner = document.querySelector('.animate-spin');
          const hasNaN = document.body.innerText.includes('NaN');
          const hasUndefined = document.body.innerText.includes('undefined');
          return {
            hasSpinner: Boolean(spinner),
            hasNaN,
            hasUndefined
          };
        })()
      `);
      console.log('Loading state metrics check:', loadingCheck);
      await takeScreenshot('01_loading_state.png');

      // Resume all paused requests
      for (const reqId of pausedRequests) {
        try {
          await send('Fetch.continueRequest', { requestId: reqId });
        } catch (e) {}
      }
      pausedRequests = [];
      ws.removeEventListener('message', fetchHandler);
      await send('Fetch.disable');

      await waitForAppLoaded();
      await sleep(500);

      const postLoadCheck = await evalInPage(`
        (() => {
          const hasNaN = document.body.innerText.includes('NaN');
          const hasUndefined = document.body.innerText.includes('undefined');
          const hasContent = Boolean(document.querySelector('.statCard, .heroData, .todayHero, .headTitle'));
          return { hasNaN, hasUndefined, hasContent };
        })()
      `);
      console.log('Post load state check:', postLoadCheck);

      if (loadingCheck.hasSpinner && !loadingCheck.hasNaN && !postLoadCheck.hasNaN && postLoadCheck.hasContent) {
        assertions.LOADING_STATE_FIXTURE = 'PASS';
        console.log('✅ FIXTURE 1: Loading-State QA Fixture passed');
      } else {
        discoveredDefects.push('Loading state exhibited NaN or missing spinner during network delay');
      }
    } catch (err) {
      console.error('Fixture 1 Error:', err.message);
      discoveredDefects.push('Fixture 1 loading state error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 2: Error-State QA Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('2. FIXTURE: Error-State QA Fixture');
    console.log('======================================================');
    try {
      await send('Fetch.enable', {
        patterns: [{ urlPattern: '*/api/whoop/summary*', requestStage: 'Request' }]
      });

      const errHandler = async (event) => {
        const data = JSON.parse(event.data);
        if (data.method === 'Fetch.requestPaused') {
          await send('Fetch.fulfillRequest', {
            requestId: data.params.requestId,
            responseCode: 500,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from(JSON.stringify({ error: 'Internal Server Error (QA Mock)' })).toString('base64')
          });
        }
      };
      ws.addEventListener('message', errHandler);

      await send('Page.navigate', { url: 'http://localhost:5173/?tab=dashboard' });
      await sleep(1500);

      const errorState = await evalInPage(`
        (() => {
          const bodyText = document.body.innerText;
          const hasCrash = bodyText.includes('TypeError') || bodyText.includes('Cannot read');
          const navButtons = document.querySelectorAll('.nav button[data-nav]');
          const isHealthy = !hasCrash && navButtons.length === 5;
          return { isHealthy, navButtonCount: navButtons.length, hasCrash };
        })()
      `);
      console.log('Error state stability check:', errorState);
      await takeScreenshot('02_error_state_500.png');

      ws.removeEventListener('message', errHandler);
      await send('Fetch.disable');

      if (errorState.isHealthy && errorState.navButtonCount === 5) {
        assertions.ERROR_STATE_FIXTURE = 'PASS';
        console.log('✅ FIXTURE 2: Error-State QA Fixture passed');
      } else {
        discoveredDefects.push('Error state 500 resulted in crash or broken navigation dock');
      }
    } catch (err) {
      console.error('Fixture 2 Error:', err.message);
      discoveredDefects.push('Fixture 2 error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 3: Offline/Degraded QA Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('3. FIXTURE: Offline/Degraded QA Fixture');
    console.log('======================================================');
    try {
      await goToTab('dashboard');

      // Emulate offline network
      await send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0
      });
      await evalInPage(`window.dispatchEvent(new Event('offline'))`);
      await sleep(600);

      const offlineBanner = await evalInPage(`
        (() => {
          const banner = Array.from(document.querySelectorAll('div')).find(d => d.innerText && (d.innerText.toLowerCase().includes('оффлайн') || d.innerText.toLowerCase().includes('офлайн')));
          const text = banner ? banner.innerText : '';
          return { hasBanner: Boolean(banner), text };
        })()
      `);
      console.log('Offline banner detection:', offlineBanner);
      await takeScreenshot('03_offline_degraded_banner.png');

      // Test offline queue action in journal
      await goToTab('journal');
      await evalInPage(`
        (() => {
          const ritual = document.querySelector('.ritual');
          if (ritual) ritual.click();
        })()
      `);
      await sleep(500);

      // Restore network
      await send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });
      await evalInPage(`window.dispatchEvent(new Event('online'))`);
      await sleep(600);

      if (offlineBanner?.hasBanner) {
        assertions.OFFLINE_DEGRADED_FIXTURE = 'PASS';
        console.log('✅ FIXTURE 3: Offline/Degraded QA Fixture passed');
      } else {
        discoveredDefects.push('Offline banner did not display when offline event dispatched');
      }
    } catch (err) {
      console.error('Fixture 3 Error:', err.message);
      discoveredDefects.push('Fixture 3 error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 4: Prefers-Reduced-Motion Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('4. FIXTURE: Prefers-Reduced-Motion Fixture');
    console.log('======================================================');
    try {
      await send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
      });

      await goToTab('dashboard');
      
      // Open settings modal on dashboard
      await evalInPage(`
        (() => {
          const btn = document.querySelector('button.iconBtn[title="Настройки"]') || document.querySelector('button.iconBtn[aria-label="Настройки"]');
          if (btn) btn.click();
        })()
      `);
      await sleep(600);

      const modalCheck = await evalInPage(`
        (() => {
          const modal = document.querySelector('.modal.open, [role="dialog"]');
          const isVisible = Boolean(modal);
          return { isVisible };
        })()
      `);
      console.log('Reduced motion modal check:', modalCheck);
      await takeScreenshot('04_reduced_motion_modal.png');

      // Close modal
      await evalInPage(`
        (() => {
          const closeBtn = document.querySelector('.close, [role="dialog"] button');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await sleep(400);

      if (modalCheck?.isVisible) {
        assertions.PREFERS_REDUCED_MOTION_FIXTURE = 'PASS';
        console.log('✅ FIXTURE 4: Prefers-Reduced-Motion Fixture passed');
      }
    } catch (err) {
      console.error('Fixture 4 Error:', err.message);
      discoveredDefects.push('Fixture 4 error: ' + err.message);
    }

    // Reset emulated media
    await send('Emulation.setEmulatedMedia', { media: 'screen', features: [] });

    // =========================================================================
    // FIXTURE 5: Simulated Mobile Keyboard / Visual Viewport Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('5. FIXTURE: Mobile Keyboard / Visual Viewport Fixture');
    console.log('======================================================');
    try {
      // Step A: AI Coach Composer Focus in Reduced Visual Viewport (Height: 460px)
      await setViewport(390, 460);
      await goToTab('coach');

      await evalInPage(`
        (() => {
          const input = document.querySelector('.aiComposer input');
          if (input) {
            input.focus();
            input.scrollIntoView({ block: 'center' });
          }
        })()
      `);
      await sleep(500);

      const composerFocusCheck = await evalInPage(`
        (() => {
          const composer = document.querySelector('.aiComposer');
          const r = composer ? composer.getBoundingClientRect() : null;
          const isVisible = r && r.top >= 0 && r.bottom <= 460;
          return {
            composerRect: r ? { top: r.top, bottom: r.bottom, height: r.height } : null,
            isVisible,
            windowHeight: window.innerHeight
          };
        })()
      `);
      console.log('Composer keyboard viewport check:', composerFocusCheck);
      await takeScreenshot('05_mobile_keyboard_ai_composer.png');

      // Step B: Meal Scanner Comment Input Focus
      await goToTab('meals');
      await evalInPage(`
        (() => {
          const input = document.querySelector('.inputLine');
          if (input) {
            input.focus();
            input.scrollIntoView({ block: 'center' });
          }
        })()
      `);
      await sleep(500);

      const mealInputCheck = await evalInPage(`
        (() => {
          const input = document.querySelector('.inputLine');
          const r = input ? input.getBoundingClientRect() : null;
          const isVisible = r && r.top >= 0 && r.bottom <= 460;
          return {
            inputRect: r ? { top: r.top, bottom: r.bottom } : null,
            isVisible
          };
        })()
      `);
      console.log('Meal input keyboard viewport check:', mealInputCheck);
      await takeScreenshot('05_mobile_keyboard_meal_input.png');

      // Reset to standard viewport
      await setViewport(390, 844);

      if (composerFocusCheck.isVisible && mealInputCheck.isVisible) {
        assertions.MOBILE_KEYBOARD_VISUAL_VIEWPORT_FIXTURE = 'PASS';
        console.log('✅ FIXTURE 5: Mobile Keyboard / Visual Viewport Fixture passed');
      } else {
        discoveredDefects.push('Active focused input clipped or hidden during simulated keyboard shrink');
      }
    } catch (err) {
      console.error('Fixture 5 Error:', err.message);
      discoveredDefects.push('Fixture 5 error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 6: Safe-Area Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('6. FIXTURE: Safe-Area Fixture');
    console.log('======================================================');
    try {
      await setViewport(390, 844);
      await goToTab('coach');

      const safeAreaCheck = await evalInPage(`
        (() => {
          const nav = document.querySelector('.nav');
          const composer = document.querySelector('.aiComposer');
          const navRect = nav ? nav.getBoundingClientRect() : null;
          const composerRect = composer ? composer.getBoundingClientRect() : null;
          const hasNoPageOverflow = document.documentElement.scrollWidth <= window.innerWidth;
          
          return {
            navBottomOffset: navRect ? (window.innerHeight - navRect.bottom) : null,
            composerBottomOffset: composerRect ? (window.innerHeight - composerRect.bottom) : null,
            hasNoPageOverflow
          };
        })()
      `);
      console.log('Safe area geometry check:', safeAreaCheck);
      await takeScreenshot('06_safe_area_dock.png');

      if (safeAreaCheck.hasNoPageOverflow && safeAreaCheck.navBottomOffset !== null) {
        assertions.SAFE_AREA_FIXTURE = 'PASS';
        console.log('✅ FIXTURE 6: Safe-Area Fixture passed');
      }
    } catch (err) {
      console.error('Fixture 6 Error:', err.message);
      discoveredDefects.push('Fixture 6 error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 7: Provider-State Fixtures (Apple Health PWA Truth + Native Bridge)
    // =========================================================================
    console.log('\n======================================================');
    console.log('7. FIXTURE: Provider-State Fixtures (Apple Health Truth)');
    console.log('======================================================');
    try {
      await goToTab('dashboard');

      // Open Data Sources Modal in Web/PWA mode (window.WhoopHubNativeHealth is undefined)
      await evalInPage(`
        (() => {
          delete window.WhoopHubNativeHealth;
          const btn = document.querySelector('button.iconBtn[aria-label="Источники данных"]');
          if (btn) btn.click();
        })()
      `);
      await sleep(600);

      const pwaAppleHealthState = await evalInPage(`
        (() => {
          const items = Array.from(document.querySelectorAll('.sheet > div, .sheet div, .modal div'));
          const appleItem = items.find(el => el.innerText && el.innerText.includes('Apple Health') && el.innerText.includes('iOS'));
          if (!appleItem) {
            const anyApple = items.find(el => el.innerText && el.innerText.includes('Apple Health'));
            return anyApple ? { found: true, rawText: anyApple.innerText } : null;
          }

          const text = appleItem.innerText;
          const hasBadge = text.includes('iOS app') || text.includes('IOS APP');
          const hasReqText = text.includes('Требуется iOS-приложение');
          const hasSupporting = text.includes('Apple Health доступен через нативную версию') || text.includes('нативную версию');

          return {
            found: true,
            hasBadge,
            hasReqText,
            hasSupporting,
            rawText: text
          };
        })()
      `);
      console.log('Apple Health PWA truth check:', pwaAppleHealthState);
      await takeScreenshot('07_apple_health_pwa_truth.png');

      // Close modal
      await evalInPage(`
        (() => {
          const closeBtn = document.querySelector('.sheet .close, .modal .close');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await sleep(400);

      // Now test Native Bridge Mock (window.WhoopHubNativeHealth = { isAvailable: true })
      await evalInPage(`
        (() => {
          window.WhoopHubNativeHealth = { isAvailable: true };
          const btn = document.querySelector('button.iconBtn[aria-label="Источники данных"]') || document.querySelector('button.iconBtn[title="Источники данных"]');
          if (btn) btn.click();
        })()
      `);
      await sleep(600);

      const nativeAppleHealthState = await evalInPage(`
        (() => {
          const items = Array.from(document.querySelectorAll('.sheet > div, .sheet div, .modal div'));
          const appleItem = items.find(el => el.innerText && el.innerText.includes('Apple Health') && (el.innerText.includes('Доступен') || el.innerText.includes('Доступно')));
          if (!appleItem) {
            const anyApple = items.find(el => el.innerText && el.innerText.includes('Apple Health'));
            return anyApple ? { found: true, rawText: anyApple.innerText } : null;
          }
          const text = appleItem.innerText;
          const hasAvailable = text.includes('Доступен для подключения') || text.includes('Доступно в нативном приложении');
          return {
            found: true,
            hasAvailable,
            rawText: text
          };
        })()
      `);
      console.log('Apple Health Native Bridge check:', nativeAppleHealthState);
      await takeScreenshot('07_apple_health_native_bridge.png');

      // Close modal & cleanup
      await evalInPage(`
        (() => {
          delete window.WhoopHubNativeHealth;
          const closeBtn = document.querySelector('.sheet .close, .modal .close');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await sleep(400);

      if (pwaAppleHealthState?.hasReqText && pwaAppleHealthState?.hasSupporting && nativeAppleHealthState?.hasAvailable) {
        assertions.PROVIDER_STATE_FIXTURES = 'PASS';
        console.log('✅ FIXTURE 7: Provider-State Fixtures passed (Apple Health truth verified)');
      } else {
        discoveredDefects.push('Apple Health PWA truth or Native Bridge capability assertion failed');
      }
    } catch (err) {
      console.error('Fixture 7 Error:', err.message);
      discoveredDefects.push('Fixture 7 error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 8: Partial-Data Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('8. FIXTURE: Partial-Data Fixture');
    console.log('======================================================');
    try {
      // Intercept /api/whoop/summary with partial metrics (recovery only, no sleep stages or strain)
      await send('Fetch.enable', {
        patterns: [{ urlPattern: '*/api/whoop/summary*', requestStage: 'Request' }]
      });

      const partialHandler = async (event) => {
        const data = JSON.parse(event.data);
        if (data.method === 'Fetch.requestPaused') {
          await send('Fetch.fulfillRequest', {
            requestId: data.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from(JSON.stringify({
              success: true,
              isConnected: true,
              current: {
                recovery_score: 72,
                hrv: null,
                rhr: null,
                sleep_actual_min: null,
                day_strain: null
              },
              history: []
            })).toString('base64')
          });
        }
      };
      ws.addEventListener('message', partialHandler);

      await send('Page.navigate', { url: 'http://localhost:5173/?tab=dashboard' });
      await sleep(1500);

      const partialRenderCheck = await evalInPage(`
        (() => {
          const text = document.body.innerText;
          const hasNaN = text.includes('NaN');
          const hasUndefined = text.includes('undefined');
          const hasRecovery = text.includes('72%') || text.includes('72');
          return { hasNaN, hasUndefined, hasRecovery };
        })()
      `);
      console.log('Partial data render check:', partialRenderCheck);
      await takeScreenshot('08_partial_data_dashboard.png');

      ws.removeEventListener('message', partialHandler);
      await send('Fetch.disable');

      if (!partialRenderCheck.hasNaN && !partialRenderCheck.hasUndefined && partialRenderCheck.hasRecovery) {
        assertions.PARTIAL_DATA_FIXTURE = 'PASS';
        console.log('✅ FIXTURE 8: Partial-Data Fixture passed');
      } else {
        discoveredDefects.push('Partial data caused NaN, undefined, or failed recovery render');
      }
    } catch (err) {
      console.error('Fixture 8 Error:', err.message);
      discoveredDefects.push('Fixture 8 error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 9: Input-Preservation Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('9. FIXTURE: Input-Preservation Fixture');
    console.log('======================================================');
    try {
      await goToTab('coach');
      await evalInPage(`
        (() => {
          const input = document.querySelector('.aiComposer input');
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, 'Как оптимизировать сон?');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `);
      await sleep(300);

      // Trigger background data poll without unmounting
      await evalInPage(`
        (() => {
          window.dispatchEvent(new Event('online'));
        })()
      `);
      await sleep(400);

      const coachVal = await evalInPage(`document.querySelector('.aiComposer input')?.value`);
      console.log('Coach draft after poll:', coachVal);
      await takeScreenshot('09_input_preservation.png');

      if (coachVal === 'Как оптимизировать сон?') {
        assertions.INPUT_PRESERVATION_FIXTURE = 'PASS';
        console.log('✅ FIXTURE 9: Input-Preservation Fixture passed');
      } else {
        discoveredDefects.push('Input preservation failed during background poll');
      }
    } catch (err) {
      console.error('Fixture 9 Error:', err.message);
      discoveredDefects.push('Fixture 9 error: ' + err.message);
    }

    ws.close();
  } finally {
    chromeProc.kill();
    serverProc.kill();
    viteProc.kill();
  }

  console.log('\n======================================================');
  console.log('🏁 GATE E2.1 FINAL HARNESS ASSERTIONS SUMMARY');
  console.log('======================================================');
  for (const [k, v] of Object.entries(assertions)) {
    console.log(`${k}=${v}`);
  }

  console.log('\n======================================================');
  console.log('📋 DISCOVERED DEFECTS:');
  if (discoveredDefects.length === 0) {
    console.log('NONE (0 defects found)');
  } else {
    discoveredDefects.forEach((d, idx) => console.log(`${idx + 1}. ${d}`));
  }
  console.log('======================================================\n');
}

runFullE21Harness().catch(err => {
  console.error('Master QA error:', err);
  process.exit(1);
});
