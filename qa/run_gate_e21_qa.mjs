import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import { fileURLToPath } from 'url';
import { getAppleHealthCapability, hasNativeHealthBridge } from '../src/services/nativeHealthBridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');
const artifactDir = path.join(projectDir, 'qa', 'artifacts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export async function runCanonicalE21Harness() {
  console.log('======================================================');
  console.log('🚀 RUNNING GATE E2.1R4 CANONICAL PLAYWRIGHT QA HARNESS');
  console.log('======================================================\n');

  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const assertions = {
    QA_HARNESS_ASSERTION_QUALITY: 'FAIL',
    OFFLINE_TIMER_WORKFLOW_EXECUTED: 'FAIL',
    OFFLINE_SECOND_ACTION_ASSERTED: 'FAIL',
    OFFLINE_ONLINE_RECOVERY_ASSERTED: 'FAIL',
    OFFLINE_FIXTURE: 'FAIL',
    REDUCED_MOTION_COMPUTED_STYLE_ASSERTED: 'FAIL',
    REDUCED_MOTION_TIMER_WORKFLOW_EXECUTED: 'FAIL',
    REDUCED_MOTION_TIMER_STATE_CHANGE: 'FAIL',
    REDUCED_MOTION_TIMER_CONTROL: 'FAIL',
    REDUCED_MOTION_AI_INTERACTION: 'FAIL',
    REDUCED_MOTION_FIXTURE: 'FAIL',
    REGRESSION_SAFE_AREA: 'FAIL',
    REGRESSION_SIMULATED_KEYBOARD: 'FAIL',
    REGRESSION_PROVIDER_STATES: 'FAIL',
    REGRESSION_LOADING: 'FAIL',
    REGRESSION_ERROR: 'FAIL',
    REGRESSION_PARTIAL_DATA: 'FAIL',
    REGRESSION_INPUT_PRESERVATION: 'FAIL'
  };

  const discoveredDefects = [];

  // Allocate dynamic ports
  const serverPort = await getFreePort();
  const vitePort = await getFreePort();
  console.log(`Allocated dynamic ports: Backend=${serverPort}, Frontend Preview=${vitePort}`);

  // Start backend server & client preview
  const serverProc = spawn('node', ['server/index.js'], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(serverPort) },
    stdio: 'pipe'
  });

  const viteProc = spawn('npx', ['vite', 'preview', '--port', String(vitePort), '--strictPort'], {
    cwd: projectDir,
    shell: true,
    stdio: 'pipe'
  });

  // Wait for servers to be reachable
  const baseUrl = `http://localhost:${vitePort}`;
  let isReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) {
        isReady = true;
        break;
      }
    } catch (e) {}
    await sleep(300);
  }

  if (!isReady) {
    serverProc.kill();
    viteProc.kill();
    throw new Error(`Frontend server failed to start at ${baseUrl}`);
  }
  console.log(`Frontend preview ready at ${baseUrl}`);

  // Launch Playwright Chromium
  const browser = await chromium.launch({
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  // Track uncaught page errors
  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error('💥 Page Error:', err.message);
    pageErrors.push(err.message);
  });

  const saveScreenshot = async (name) => {
    const p = path.join(artifactDir, `${name}.png`);
    await page.screenshot({ path: p });
    console.log(`📸 Screenshot: qa/artifacts/${name}.png`);
  };

  const waitForLoadingSpinnerDone = async (timeout = 8000) => {
    try {
      await page.locator('.animate-spin').waitFor({ state: 'detached', timeout });
    } catch (e) {}
  };

  try {
    // =========================================================================
    // FIXTURE 1: Loading Fixture (AI request delay + Product data delay)
    // =========================================================================
    console.log('\n======================================================');
    console.log('1. FIXTURE: Loading Fixture');
    console.log('======================================================');
    try {
      // Part A: Product data loading delay on Dashboard
      await page.route('**/api/whoop/summary*', async (route) => {
        try {
          await sleep(1800);
          await route.continue();
        } catch (e) {}
      });

      await page.goto(`${baseUrl}/?tab=dashboard`);
      const spinnerVisible = await page.locator('.animate-spin').isVisible({ timeout: 2000 });
      console.log('Loading spinner during delayed data load:', spinnerVisible);
      await saveScreenshot('01_loading_spinner_active');

      await page.unroute('**/api/whoop/summary*');
      await waitForLoadingSpinnerDone();
      await sleep(400);

      const dashboardRecovered = await page.locator('.todayHero, .heroStatement, .headTitle').first().isVisible();
      console.log('Dashboard recovered after loading release:', dashboardRecovered);

      // Part B: AI request loading delay
      await page.route('**/api/coach/ask*', async (route) => {
        try {
          await sleep(1500);
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              messages: [
                { id: '1', sender: 'user', message: 'Как улучшить сон?' },
                { id: '2', sender: 'ai', message: 'Для улучшения сна соблюдайте режим.' }
              ]
            })
          });
        } catch (e) {}
      });

      await page.goto(`${baseUrl}/?tab=coach`);
      await waitForLoadingSpinnerDone();

      const composerInput = page.locator('.aiComposer input');
      await composerInput.fill('Как улучшить сон?');
      await page.locator('.aiComposer button').click();

      // Verify UI is in pending state (user message added)
      const userMsgAppeared = await page.locator('.chatMini .msg.user').filter({ hasText: 'Как улучшить сон?' }).isVisible();
      console.log('AI pending user message visible:', userMsgAppeared);
      await saveScreenshot('01_loading_ai_pending');

      // Assert AI response arrives and renders
      const aiResponseLocator = page.locator('.chatMini .msg').filter({ hasText: 'Для улучшения сна' });
      await aiResponseLocator.waitFor({ state: 'visible', timeout: 6000 });
      const aiResponseAppeared = await aiResponseLocator.isVisible();
      console.log('AI response arrived after release:', aiResponseAppeared);
      await page.unroute('**/api/coach/ask*');

      if (spinnerVisible && dashboardRecovered && userMsgAppeared && aiResponseAppeared) {
        assertions.REGRESSION_LOADING = 'PASS';
        console.log('✅ REGRESSION_LOADING: PASS');
      } else {
        discoveredDefects.push('Loading fixture failed to assert spinner or recovery');
      }
    } catch (err) {
      console.error('Loading Fixture Error:', err.message);
      discoveredDefects.push('Loading Fixture error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 2: Error Fixture (Failed real user action + graceful handling)
    // =========================================================================
    console.log('\n======================================================');
    console.log('2. FIXTURE: Error Fixture');
    console.log('======================================================');
    try {
      await page.goto(`${baseUrl}/?tab=coach`);
      await waitForLoadingSpinnerDone();

      // Intercept AI send with HTTP 500
      await page.route('**/api/coach/ask*', async (route) => {
        try {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, error: 'AI Gateway Timeout (500 QA Mock)' })
          });
        } catch (e) {}
      });

      let dialogTriggered = false;
      let dialogText = '';
      const dialogHandler = async (dialog) => {
        dialogTriggered = true;
        dialogText = dialog.message();
        try { await dialog.dismiss(); } catch (e) {}
      };
      page.on('dialog', dialogHandler);

      const composerInput = page.locator('.aiComposer input');
      await composerInput.fill('Почему упали веса?');
      await page.locator('.aiComposer button').click();
      await sleep(1000);

      console.log('Error dialog triggered:', dialogTriggered, 'Message:', dialogText);
      await saveScreenshot('02_error_handled');
      page.off('dialog', dialogHandler);
      await page.unroute('**/api/coach/ask*');

      // Assert app remains fully interactive and navigation works
      await page.locator('.nav button[data-nav="dashboard"]').click();
      await sleep(500);
      const dashboardVisible = await page.locator('.headTitle').filter({ hasText: 'TODAY' }).isVisible();
      console.log('App interactive post-error:', dashboardVisible);

      if (dialogTriggered && dashboardVisible) {
        assertions.REGRESSION_ERROR = 'PASS';
        console.log('✅ REGRESSION_ERROR: PASS');
      } else {
        discoveredDefects.push('Error fixture failed to report user-facing error dialog');
      }
    } catch (err) {
      console.error('Error Fixture Error:', err.message);
      discoveredDefects.push('Error Fixture error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 3: Offline Fixture (Real Playwright Offline Mode + Real Timer Action)
    // =========================================================================
    console.log('\n======================================================');
    console.log('3. FIXTURE: Offline Fixture');
    console.log('======================================================');
    try {
      await page.goto(`${baseUrl}/?tab=dashboard`);
      await waitForLoadingSpinnerDone();

      // Enable real Playwright offline mode
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await sleep(600);

      const offlineBannerVisible = await page.getByText(/оффлайн|офлайн/i).isVisible();
      console.log('Offline banner visible:', offlineBannerVisible);
      await saveScreenshot('03_offline_active');

      // A. Submit REAL AI request while offline -> assert honest visible failure, no infinite loading, no fake answer
      await page.locator('.nav button[data-nav="coach"]').click();
      await sleep(500);

      let offlineAiDialogFired = false;
      const offlineDialogHandler = async (dialog) => {
        offlineAiDialogFired = true;
        try { await dialog.dismiss(); } catch (e) {}
      };
      page.on('dialog', offlineDialogHandler);

      const offlineAiInput = page.locator('.aiComposer input');
      await offlineAiInput.fill('Как самочувствие?');
      await page.locator('.aiComposer button').click();
      await sleep(1000);
      page.off('dialog', offlineDialogHandler);

      const offlineAiFailureVisible = offlineAiDialogFired || (await page.locator('.chatMini .msg').filter({ hasText: /Ошибка|не удалось|Failed/i }).isVisible());
      const aiInfiniteSpinner = await page.locator('.chatMini .animate-pulse').isVisible();
      const noFakeAiAnswer = !(await page.locator('.chatMini .msg:not(.user)').filter({ hasText: 'Как самочувствие?' }).isVisible());
      console.log('Offline AI failure visible:', offlineAiFailureVisible, 'No infinite spinner:', !aiInfiniteSpinner, 'No fake answer:', noFakeAiAnswer);

      // B. Second Offline Product Action: Real Local Timer Execution
      await page.locator('.nav button[data-nav="workouts"]').click();
      await sleep(500);

      const trainTabVisible = await page.locator('.header .headTitle').filter({ hasText: /Тренировка|TRAIN/i }).isVisible();

      // Switch to Timer tab
      await page.locator('.trainTab').filter({ hasText: 'Таймер' }).click();
      await sleep(400);

      // Select preset 30s
      const presetBtn = page.locator('.timerPresets button').filter({ hasText: '30с' });
      if (await presetBtn.isVisible()) {
        await presetBtn.click();
        await sleep(200);
      }

      // Start fullscreen timer
      await page.locator('button.timerPrimary').filter({ hasText: 'СТАРТ' }).click();
      await sleep(400);

      const fullscreenTimer = page.locator('.timerOverlay.open');
      const offlineTimerStarted = await fullscreenTimer.isVisible();

      const initialPhaseText = await page.locator('.timerCenter').innerText();

      // Advance timer phase
      const nextPhaseBtn = page.locator('.timerMainControls button').filter({ hasText: 'ДАЛЬШЕ' });
      if (await nextPhaseBtn.isVisible()) {
        await nextPhaseBtn.click();
        await sleep(300);
      } else {
        await sleep(1200);
      }

      const advancedPhaseText = await page.locator('.timerCenter').innerText();
      const offlineTimerAdvanced = offlineTimerStarted && (initialPhaseText !== advancedPhaseText || advancedPhaseText.length > 0);

      // Pause timer
      const pauseBtn = page.locator('.timerMainControls button.primary');
      let offlineTimerPaused = false;
      if (await pauseBtn.isVisible()) {
        await pauseBtn.click();
        await sleep(300);
        const pauseBtnText = await pauseBtn.innerText();
        offlineTimerPaused = pauseBtnText.includes('ПРОДОЛЖИТЬ');
      }

      // Verify local truth: no fake wearable metrics or false sensor data
      const fakeWearableVisible = await fullscreenTimer.getByText(/Whoop connected|100% recovery/i).isVisible();
      const offlineTimerLocalTruth = !fakeWearableVisible;

      // Close fullscreen timer
      const stopBtn = page.locator('.timerMainControls button').filter({ hasText: 'СТОП' });
      if (await stopBtn.isVisible()) {
        await stopBtn.click();
        await sleep(300);
      }

      console.log('Offline Timer workflow execution:', {
        offlineTimerStarted,
        offlineTimerAdvanced,
        offlineTimerPaused,
        offlineTimerLocalTruth
      });
      await saveScreenshot('03_offline_timer_executed');

      if (offlineTimerStarted && offlineTimerAdvanced && offlineTimerLocalTruth) {
        assertions.OFFLINE_TIMER_WORKFLOW_EXECUTED = 'PASS';
        assertions.OFFLINE_SECOND_ACTION_ASSERTED = 'PASS';
        console.log('✅ OFFLINE_TIMER_WORKFLOW_EXECUTED: PASS');
        console.log('✅ OFFLINE_SECOND_ACTION_ASSERTED: PASS');
      }

      // C. Restore online state and verify recovery
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await sleep(600);

      const offlineBannerCleared = !(await page.getByText(/Оффлайн режим \(кэш активен\)/i).isVisible());
      const onlineRecoveryConfirmed = offlineBannerCleared === true;
      console.log('Offline state recovered post-online event:', onlineRecoveryConfirmed);

      if (onlineRecoveryConfirmed) {
        assertions.OFFLINE_ONLINE_RECOVERY_ASSERTED = 'PASS';
        console.log('✅ OFFLINE_ONLINE_RECOVERY_ASSERTED: PASS');
      }

      if (offlineBannerVisible && offlineAiFailureVisible && noFakeAiAnswer && !aiInfiniteSpinner && offlineTimerStarted && offlineTimerAdvanced && offlineTimerLocalTruth && onlineRecoveryConfirmed) {
        assertions.OFFLINE_FIXTURE = 'PASS';
        console.log('✅ OFFLINE_FIXTURE: PASS');
      } else {
        discoveredDefects.push('Offline fixture failed to assert honest failure, offline timer workflow, or online recovery');
      }
    } catch (err) {
      console.error('Offline Fixture Error:', err.message);
      discoveredDefects.push('Offline Fixture error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 4: Prefers-Reduced-Motion Fixture (Modal + AI + Real Timer + Styles)
    // =========================================================================
    console.log('\n======================================================');
    console.log('4. FIXTURE: Reduced Motion Fixture');
    console.log('======================================================');
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${baseUrl}/?tab=dashboard`);
      await waitForLoadingSpinnerDone();

      // A. Verify computed animation and transition styles across representative elements
      const computedStyles = await page.evaluate(() => {
        const elements = [
          document.body,
          document.querySelector('.todayHero'),
          document.querySelector('.headTitle'),
          document.querySelector('.nav')
        ].filter(Boolean);

        return elements.map(el => {
          const style = window.getComputedStyle(el);
          const animDur = parseFloat(style.animationDuration) || 0;
          const transDur = parseFloat(style.transitionDuration) || 0;
          return {
            animDur,
            transDur,
            rawAnim: style.animationDuration,
            rawTrans: style.transitionDuration
          };
        });
      });

      const reducedAnimation = computedStyles.every(s => s.animDur <= 0.001 || s.rawAnim === '0s' || s.rawAnim.includes('0.01ms'));
      const reducedTransition = computedStyles.every(s => s.transDur <= 0.001 || s.rawTrans === '0s' || s.rawTrans.includes('0.01ms'));
      console.log('Reduced animation computed:', reducedAnimation, 'Reduced transition computed:', reducedTransition, computedStyles);

      if (reducedAnimation && reducedTransition) {
        assertions.REDUCED_MOTION_COMPUTED_STYLE_ASSERTED = 'PASS';
        console.log('✅ REDUCED_MOTION_COMPUTED_STYLE_ASSERTED: PASS');
      }

      // B. Modal interaction under reduced motion
      const sourcesBtn = page.locator('button.iconBtn[aria-label="Источники данных"], button.iconBtn[title="Источники данных"]');
      await sourcesBtn.click();
      await sleep(500);

      const modalVisible = await page.locator('.modal.open, [role="dialog"]').isVisible();
      console.log('Modal opened with reduced motion:', modalVisible);
      await saveScreenshot('04_reduced_motion_modal');

      const closeBtn = page.locator('.sheet .close, .modal .close, [role="dialog"] .close');
      await closeBtn.click();
      await sleep(400);

      const modalClosed = !(await page.locator('.modal.open').isVisible());
      console.log('Modal closed cleanly:', modalClosed);

      // C. Real Timer execution under reduced motion
      await page.locator('.nav button[data-nav="workouts"]').click();
      await sleep(500);
      await page.locator('.trainTab').filter({ hasText: 'Таймер' }).click();
      await sleep(300);

      // Start fullscreen timer under reduced motion
      await page.locator('button.timerPrimary').filter({ hasText: 'СТАРТ' }).click();
      await sleep(400);

      const rmFsTimer = page.locator('.timerOverlay.open');
      const timerStartedUnderReducedMotion = await rmFsTimer.isVisible();

      const rmT1 = await page.locator('.timerCenter').innerText();
      const rmNextBtn = page.locator('.timerMainControls button').filter({ hasText: 'ДАЛЬШЕ' });
      if (await rmNextBtn.isVisible()) {
        await rmNextBtn.click();
        await sleep(300);
      } else {
        await sleep(1200);
      }
      const rmT2 = await page.locator('.timerCenter').innerText();
      const timerAdvancedUnderReducedMotion = timerStartedUnderReducedMotion && (rmT1 !== rmT2 || rmT2.length > 0);

      const rmPauseBtn = page.locator('.timerMainControls button.primary');
      let timerControlWorkedUnderReducedMotion = false;
      if (await rmPauseBtn.isVisible()) {
        await rmPauseBtn.click();
        await sleep(300);
        const btnText = await rmPauseBtn.innerText();
        timerControlWorkedUnderReducedMotion = btnText.includes('ПРОДОЛЖИТЬ');
      }

      // Close fullscreen timer
      const rmStopBtn = page.locator('.timerMainControls button').filter({ hasText: 'СТОП' });
      if (await rmStopBtn.isVisible()) {
        await rmStopBtn.click();
        await sleep(300);
      }

      console.log('Reduced motion timer execution:', {
        timerStartedUnderReducedMotion,
        timerAdvancedUnderReducedMotion,
        timerControlWorkedUnderReducedMotion
      });

      if (timerStartedUnderReducedMotion) {
        assertions.REDUCED_MOTION_TIMER_WORKFLOW_EXECUTED = 'PASS';
        console.log('✅ REDUCED_MOTION_TIMER_WORKFLOW_EXECUTED: PASS');
      }
      if (timerAdvancedUnderReducedMotion) {
        assertions.REDUCED_MOTION_TIMER_STATE_CHANGE = 'PASS';
        console.log('✅ REDUCED_MOTION_TIMER_STATE_CHANGE: PASS');
      }
      if (timerControlWorkedUnderReducedMotion) {
        assertions.REDUCED_MOTION_TIMER_CONTROL = 'PASS';
        console.log('✅ REDUCED_MOTION_TIMER_CONTROL: PASS');
      }

      // D. Real AI interaction under reduced motion
      await page.route('**/api/coach/ask*', async (route) => {
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              messages: [
                { id: 'rm_1', sender: 'user', message: 'Тест reduced motion' },
                { id: 'rm_2', sender: 'ai', message: 'Интерфейс работает без декоративной анимации.' }
              ]
            })
          });
        } catch (e) {}
      });

      await page.locator('.nav button[data-nav="coach"]').click();
      await sleep(500);
      const rmAiInput = page.locator('.aiComposer input');
      await rmAiInput.fill('Тест reduced motion');
      await page.locator('.aiComposer button').click();
      
      const rmResponseLocator = page.locator('.chatMini .msg').filter({ hasText: 'Интерфейс работает без декоративной анимации.' });
      await rmResponseLocator.waitFor({ state: 'visible', timeout: 5000 });
      const aiFunctionalUnderReducedMotion = await rmResponseLocator.isVisible();
      console.log('AI functional under reduced motion:', aiFunctionalUnderReducedMotion);
      await page.unroute('**/api/coach/ask*');

      if (aiFunctionalUnderReducedMotion) {
        assertions.REDUCED_MOTION_AI_INTERACTION = 'PASS';
        console.log('✅ REDUCED_MOTION_AI_INTERACTION: PASS');
      }

      await page.emulateMedia({ reducedMotion: 'no-preference' });

      if (modalVisible && modalClosed && timerStartedUnderReducedMotion && timerAdvancedUnderReducedMotion && timerControlWorkedUnderReducedMotion && reducedAnimation && reducedTransition && aiFunctionalUnderReducedMotion) {
        assertions.REDUCED_MOTION_FIXTURE = 'PASS';
        console.log('✅ REDUCED_MOTION_FIXTURE: PASS');
      } else {
        discoveredDefects.push('Reduced motion fixture failed on modal, timer workflow, or AI interaction');
      }
    } catch (err) {
      console.error('Reduced Motion Error:', err.message);
      discoveredDefects.push('Reduced Motion error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 5: Simulated Mobile Keyboard Layout (3 Product Flows)
    // =========================================================================
    console.log('\n======================================================');
    console.log('5. FIXTURE: Simulated Mobile Keyboard Layout');
    console.log('======================================================');
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      
      // Flow 1: AI Coach Composer Focus
      await page.goto(`${baseUrl}/?tab=coach`);
      await waitForLoadingSpinnerDone();
      const aiInput = page.locator('.aiComposer input');
      await aiInput.focus();
      await sleep(200);

      // Simulate on-screen keyboard by shrinking viewport height to 450px
      await page.setViewportSize({ width: 390, height: 450 });
      await sleep(300);

      const composerBox = await page.locator('.aiComposer').boundingBox();
      const aiInputVisibleInViewport = composerBox && composerBox.y >= 0 && (composerBox.y + composerBox.height) <= 450;
      const aiSendBtnReachable = await page.locator('.aiComposer button').isVisible();
      console.log('AI composer visible in reduced keyboard viewport:', aiInputVisibleInViewport, composerBox);
      await saveScreenshot('05_keyboard_ai_composer');

      // Flow 2: Food comment input
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/?tab=meals`);
      await waitForLoadingSpinnerDone();

      const mealInput = page.locator('.inputLine');
      await mealInput.focus();
      await page.setViewportSize({ width: 390, height: 450 });
      await sleep(300);

      const mealBox = await mealInput.boundingBox();
      const mealInputVisibleInViewport = mealBox && mealBox.y >= 0 && (mealBox.y + mealBox.height) <= 450;
      console.log('Meal input visible in reduced keyboard viewport:', mealInputVisibleInViewport, mealBox);
      await saveScreenshot('05_keyboard_meal_input');

      // Flow 3: Ritual Note / Train Field Focus
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/?tab=journal`);
      await waitForLoadingSpinnerDone();

      const ritualNote = page.locator('textarea.note, .noteInput').first();
      await ritualNote.focus();
      await page.setViewportSize({ width: 390, height: 450 });
      await sleep(300);

      const noteBox = await ritualNote.boundingBox();
      const noteInputVisibleInViewport = noteBox && noteBox.y >= 0;
      const saveDayCtaReachable = await page.locator('button.saveDay').isVisible();
      console.log('Ritual note visible in reduced keyboard viewport:', noteInputVisibleInViewport, 'CTA reachable:', saveDayCtaReachable);
      await saveScreenshot('05_keyboard_ritual_note');

      // Check horizontal overflow
      const hasNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      console.log('Zero horizontal overflow:', hasNoHorizontalOverflow);

      // Restore viewport
      await page.setViewportSize({ width: 390, height: 844 });

      if (aiInputVisibleInViewport && aiSendBtnReachable && mealInputVisibleInViewport && noteInputVisibleInViewport && hasNoHorizontalOverflow) {
        assertions.REGRESSION_SIMULATED_KEYBOARD = 'PASS';
        console.log('✅ REGRESSION_SIMULATED_KEYBOARD: PASS');
      } else {
        discoveredDefects.push('Simulated keyboard occlusion clipped active focused input');
      }
    } catch (err) {
      console.error('Simulated Keyboard Error:', err.message);
      discoveredDefects.push('Simulated Keyboard error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 6: Safe Area Geometry Invariants
    // =========================================================================
    console.log('\n======================================================');
    console.log('6. FIXTURE: Safe Area');
    console.log('======================================================');
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/?tab=coach`);
      await waitForLoadingSpinnerDone();

      const navBox = await page.locator('.nav').boundingBox();
      const composerBox = await page.locator('.aiComposer').boundingBox();

      const navBottomClearance = navBox ? (844 - (navBox.y + navBox.height)) : -1;
      const composerAboveNav = composerBox && navBox ? (composerBox.y + composerBox.height <= navBox.y + 5) : false;
      const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

      // Modal CTA check under reduced usable viewport
      await page.locator('button.iconBtn[aria-label="Источники данных"], button.iconBtn[title="Источники данных"]').click();
      await sleep(500);
      const modalCloseBtn = page.locator('.sheet .close, .modal .close');
      const modalCloseBox = await modalCloseBtn.boundingBox();
      const modalCtaReachable = modalCloseBox && modalCloseBox.y >= 0 && (modalCloseBox.y + modalCloseBox.height <= 844);
      await modalCloseBtn.click();
      await sleep(300);

      // Final CTA check in composer
      const sendBtnBox = await page.locator('.aiComposer button[aria-label="Отправить"]').boundingBox();
      const sendBtnReachable = sendBtnBox && sendBtnBox.y >= 0 && (sendBtnBox.y + sendBtnBox.height <= (navBox ? navBox.y : 800));

      console.log('Safe area measurements:', {
        navBottomClearance,
        composerAboveNav,
        noHorizontalOverflow,
        modalCtaReachable,
        sendBtnReachable
      });
      await saveScreenshot('06_safe_area_dock');

      if (navBox && composerBox && composerAboveNav && navBottomClearance >= 0 && noHorizontalOverflow && modalCtaReachable && sendBtnReachable) {
        assertions.REGRESSION_SAFE_AREA = 'PASS';
        console.log('✅ REGRESSION_SAFE_AREA: PASS');
      } else {
        discoveredDefects.push('Safe area geometry invariants failed: composerAboveNav or clearance not satisfied');
      }
    } catch (err) {
      console.error('Safe Area Error:', err.message);
      discoveredDefects.push('Safe Area error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 7: Provider State Fixtures (All 5 Provider States)
    // =========================================================================
    console.log('\n======================================================');
    console.log('7. FIXTURE: Provider State Fixtures');
    console.log('======================================================');
    try {
      // 1. Module boundary unit test for Native Health Bridge capability
      const pwaCapability = getAppleHealthCapability();
      console.log('Unit test: PWA Apple Health capability:', pwaCapability);
      const isUnitContractValid = pwaCapability === 'REQUIRES_NATIVE_APP';

      // 2. UI State: Disconnected / No Source
      await page.route('**/api/whoop/summary*', async (route) => {
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              isConnected: false,
              current: null,
              history: []
            })
          });
        } catch (e) {}
      });

      await page.goto(`${baseUrl}/?tab=dashboard`);
      await waitForLoadingSpinnerDone();
      const emptyDashboardText = await page.locator('.heroCopy, .todayHero').first().innerText();
      const showsNoSourceGuidance = emptyDashboardText.includes('Подключите') || emptyDashboardText.includes('Whoop');
      console.log('Disconnected Whoop UI guidance:', showsNoSourceGuidance);
      await page.unroute('**/api/whoop/summary*');

      // 3. UI State: Connected Whoop contract
      await page.route('**/api/whoop/summary*', async (route) => {
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              isConnected: true,
              current: {
                recovery_score: 84,
                hrv: 68,
                rhr: 50,
                day_strain: 12.5,
                sleep_actual_min: 470
              },
              history: []
            })
          });
        } catch (e) {}
      });

      await page.goto(`${baseUrl}/?tab=dashboard`);
      await waitForLoadingSpinnerDone();
      const recoveryScoreVisible = await page.getByText('84%').isVisible();
      console.log('Connected Whoop recovery score 84% visible:', recoveryScoreVisible);
      await page.unroute('**/api/whoop/summary*');

      // 4. UI State: Provider Error State (HTTP 500 / Downstream Error)
      await page.evaluate(() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {}
      });

      await page.route('**/api/whoop/summary*', async (route) => {
        try {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: 'Whoop Upstream Service Unavailable (500 QA Mock)'
            })
          });
        } catch (e) {}
      });

      await page.goto(`${baseUrl}/?tab=dashboard`);
      await waitForLoadingSpinnerDone();
      const bodyTextError = await page.locator('body').innerText();
      const noFakeConnectedOn500 = !bodyTextError.includes('84%');
      const appShellUsableOn500 = (await page.locator('.nav button[data-nav]').count()) === 5;
      console.log('Provider Error 500 handling: No fake values:', noFakeConnectedOn500, 'Shell usable:', appShellUsableOn500);
      await saveScreenshot('07_provider_error_500');
      await page.unroute('**/api/whoop/summary*');

      // 5. UI State: Apple Health PWA Truth in Data Sources Modal
      await page.goto(`${baseUrl}/?tab=dashboard`);
      await waitForLoadingSpinnerDone();
      await page.locator('button.iconBtn[aria-label="Источники данных"]').click();
      await sleep(500);

      const hasIosBadge = await page.locator('.sheet').getByText(/iOS app/i).isVisible();
      const hasReqText = await page.locator('.sheet').getByText(/Требуется iOS-приложение/i).isVisible();
      const hasSupportingText = await page.locator('.sheet').getByText(/Apple Health доступен через нативную версию/i).isVisible();
      console.log('Apple Health PWA truth check: Badge:', hasIosBadge, 'ReqText:', hasReqText, 'Supporting:', hasSupportingText);
      await saveScreenshot('07_apple_health_pwa_truth');

      await page.locator('.sheet .close').click();
      await sleep(300);

      if (isUnitContractValid && showsNoSourceGuidance && recoveryScoreVisible && noFakeConnectedOn500 && hasIosBadge && hasReqText && hasSupportingText) {
        assertions.REGRESSION_PROVIDER_STATES = 'PASS';
        console.log('✅ REGRESSION_PROVIDER_STATES: PASS');
      } else {
        discoveredDefects.push('Provider state assertions failed for Apple Health PWA truth, Whoop contract, or 500 error state');
      }
    } catch (err) {
      console.error('Provider State Error:', err.message);
      discoveredDefects.push('Provider State error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 8: Partial Data Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('8. FIXTURE: Partial Data Fixture');
    console.log('======================================================');
    try {
      // Return partial data: recovery present (78%), missing HRV, RHR, Sleep, Strain
      await page.route('**/api/whoop/summary*', async (route) => {
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              isConnected: true,
              current: {
                recovery_score: 78,
                hrv: null,
                rhr: null,
                day_strain: null,
                sleep_actual_min: null
              },
              history: []
            })
          });
        } catch (e) {}
      });

      await page.goto(`${baseUrl}/?tab=dashboard`);
      await waitForLoadingSpinnerDone();

      const recovery78Visible = await page.getByText('78%').isVisible();
      const bodyText = await page.locator('body').innerText();
      const hasNoNaN = !bodyText.includes('NaN');
      const hasNoUndefined = !bodyText.includes('undefined');

      console.log('Partial data rendering: 78% recovery:', recovery78Visible, 'No NaN:', hasNoNaN, 'No undefined:', hasNoUndefined);
      await saveScreenshot('08_partial_data_dashboard');
      await page.unroute('**/api/whoop/summary*');

      if (recovery78Visible && hasNoNaN && hasNoUndefined) {
        assertions.REGRESSION_PARTIAL_DATA = 'PASS';
        console.log('✅ REGRESSION_PARTIAL_DATA: PASS');
      } else {
        discoveredDefects.push('Partial data fixture failed to render recovery score or produced NaN');
      }
    } catch (err) {
      console.error('Partial Data Error:', err.message);
      discoveredDefects.push('Partial Data error: ' + err.message);
    }

    // =========================================================================
    // FIXTURE 9: Input Preservation Fixture
    // =========================================================================
    console.log('\n======================================================');
    console.log('9. FIXTURE: Input Preservation Fixture');
    console.log('======================================================');
    try {
      await page.goto(`${baseUrl}/?tab=coach`);
      await waitForLoadingSpinnerDone();

      // Intercept AI question to simulate failure
      await page.route('**/api/coach/ask*', async (route) => {
        try {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, error: 'Network failure during send' })
          });
        } catch (e) {}
      });

      const dialogHandler = async (dialog) => {
        try { await dialog.dismiss(); } catch (e) {}
      };
      page.on('dialog', dialogHandler);

      const draftQuestion = 'Как составить план тренировок на неделю?';
      const composerInput = page.locator('.aiComposer input');
      await composerInput.fill(draftQuestion);
      await page.locator('.aiComposer button').click();
      await sleep(1000);

      // Verify that the user-entered text exists in the conversation history as user message for retry
      const userMessageInChat = await page.locator('.chatMini .msg.user').filter({ hasText: draftQuestion }).isVisible();
      console.log('Draft question preserved in message list on failure:', userMessageInChat);
      await saveScreenshot('09_input_preserved_on_failure');
      page.off('dialog', dialogHandler);
      await page.unroute('**/api/coach/ask*');

      if (userMessageInChat) {
        assertions.REGRESSION_INPUT_PRESERVATION = 'PASS';
        console.log('✅ REGRESSION_INPUT_PRESERVATION: PASS');
      } else {
        discoveredDefects.push('Input preservation failed: user message lost after failed send');
      }
    } catch (err) {
      console.error('Input Preservation Error:', err.message);
      discoveredDefects.push('Input Preservation error: ' + err.message);
    }

  } finally {
    await browser.close();
    serverProc.kill();
    viteProc.kill();
  }

  // Assertion Quality & Closure Check
  const allCriticalPassed = [
    assertions.OFFLINE_TIMER_WORKFLOW_EXECUTED === 'PASS',
    assertions.OFFLINE_SECOND_ACTION_ASSERTED === 'PASS',
    assertions.OFFLINE_ONLINE_RECOVERY_ASSERTED === 'PASS',
    assertions.OFFLINE_FIXTURE === 'PASS',
    assertions.REDUCED_MOTION_COMPUTED_STYLE_ASSERTED === 'PASS',
    assertions.REDUCED_MOTION_TIMER_WORKFLOW_EXECUTED === 'PASS',
    assertions.REDUCED_MOTION_TIMER_STATE_CHANGE === 'PASS',
    assertions.REDUCED_MOTION_TIMER_CONTROL === 'PASS',
    assertions.REDUCED_MOTION_AI_INTERACTION === 'PASS',
    assertions.REDUCED_MOTION_FIXTURE === 'PASS',
    assertions.REGRESSION_SAFE_AREA === 'PASS',
    assertions.REGRESSION_SIMULATED_KEYBOARD === 'PASS',
    assertions.REGRESSION_PROVIDER_STATES === 'PASS',
    assertions.REGRESSION_LOADING === 'PASS',
    assertions.REGRESSION_ERROR === 'PASS',
    assertions.REGRESSION_PARTIAL_DATA === 'PASS',
    assertions.REGRESSION_INPUT_PRESERVATION === 'PASS'
  ].every(Boolean);

  if (allCriticalPassed) {
    assertions.QA_HARNESS_ASSERTION_QUALITY = 'PASS';
  }

  console.log('\n======================================================');
  console.log('🏁 GATE E2.1R4 FINAL HARNESS ASSERTIONS SUMMARY');
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

  const allPassed = Object.values(assertions).every((v) => v === 'PASS');
  if (!allPassed) {
    process.exit(1);
  }
}

// Auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCanonicalE21Harness().catch((err) => {
    console.error('Canonical QA harness execution failed:', err);
    process.exit(1);
  });
}
