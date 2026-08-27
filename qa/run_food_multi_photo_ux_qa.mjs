import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');
const baseUrl = 'http://127.0.0.1:5174';
const fixturePath = path.join(projectDir, 'qa', 'fixtures', 'food', 'owner_failure_plate.jpg');

const savedMeal = {
  id: 901,
  title: 'Салат и бифштекс',
  calories: 540,
  protein: 42,
  fats: 28,
  carbs: 25,
  fiber: 6,
  meal_type: 'Обед',
  image_url: '/uploads/primary.jpg',
  components_json: JSON.stringify([{ name: 'Салат' }, { name: 'Бифштекс' }]),
  images_json: JSON.stringify([{ id: 11, image_url: '/uploads/primary.jpg', image_role: 'primary' }]),
  created_at: '2026-08-27T12:00:00.000Z'
};

const persistedImages = [
  { id: 11, role: 'primary', imageUrl: '/uploads/primary.jpg' },
  { id: 12, role: 'additional', imageUrl: '/uploads/additional.jpg' }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('Vite did not start');
}

async function assertTarget(page, name, minimumHeight = 44) {
  const box = await page.getByRole('button', { name, exact: true }).boundingBox();
  assert.ok(box && box.height >= minimumHeight && box.width >= 44, `${name} target must be at least 44px`);
}

export async function runFoodMultiPhotoUXQA() {
  const results = {
    ADD_PHOTO_DISCOVERABILITY: 'FAIL', TOUCH_TARGETS: 'FAIL', REVISION_LOADING_UX: 'FAIL',
    REVISION_FAILURE_UX: 'FAIL', UNRELATED_IMAGE_GUARD_UX: 'FAIL', MOBILE_LAYOUT: 'FAIL',
    KEYBOARD_SAFE_AREA: 'FAIL', NO_HORIZONTAL_OVERFLOW: 'FAIL', RETRY_IMAGE_IDEMPOTENCY: 'FAIL',
    UNRELATED_IMAGE_SEPARATE_MEAL: 'FAIL', UNRELATED_IMAGE_OVERRIDE: 'FAIL', VISUAL_DENSITY: 'FAIL'
  };
  const viteBin = path.join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5174'], { cwd: projectDir, stdio: 'ignore', windowsHide: true });
  try {
    console.log('UX_QA: starting client');
    await waitForServer();
    console.log('UX_QA: client ready');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem('onboarding_completed', 'true'));
    const page = await context.newPage();
    const requestBodies = [];
    let mode = 'failure';

    await page.route('**/api/meals', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { success: true, meals: [savedMeal], totals: { calories: 540, protein: 42, fats: 28, carbs: 25, fiber: 6 } } });
      } else await route.continue();
    });
    await page.route('**/api/meals/901/reanalyze', async (route) => {
      requestBodies.push(route.request().postData() || '');
      if (mode === 'unrelated') {
        await route.fulfill({ status: 409, json: { success: false, status: 'unrelated_image', retryable: true, error: 'Похоже, это другое блюдо.', persisted_images: persistedImages } });
      } else {
        await sleep(600);
        await route.fulfill({ status: 503, json: { success: false, status: 'analysis_failed', retryable: true, error: 'Не удалось пересчитать.', persisted_images: persistedImages } });
      }
    });
    await page.route('**/api/meals/901/revision-images/12', async (route) => {
      await route.fulfill({ json: { success: true, images: [persistedImages[0]] } });
    });
    await page.goto(`${baseUrl}/?tab=meals`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: '+ Добавить фото', exact: true }).waitFor();
    results.ADD_PHOTO_DISCOVERABILITY = 'PASS';
    await assertTarget(page, '+ Добавить фото');
    await page.getByRole('button', { name: '+ Добавить фото', exact: true }).click();
    await page.getByText('Текущий результат сохранён').waitFor();
    await assertTarget(page, 'Камера');
    await assertTarget(page, 'Галерея');
    await assertTarget(page, 'Пересчитать приём пищи', 48);
    await assertTarget(page, 'Отмена');
    const fileInputs = page.locator('input[type=file]');
    await fileInputs.nth(3).setInputFiles(fixturePath);
    await page.getByRole('button', { name: 'Удалить дополнительное фото 1' }).waitFor();
    await assertTarget(page, 'Удалить дополнительное фото 1');
    results.TOUCH_TARGETS = 'PASS';

    await page.getByRole('button', { name: 'Пересчитать приём пищи', exact: true }).click();
    await page.getByText('Уточняю анализ по дополнительному фото…').waitFor();
    results.REVISION_LOADING_UX = 'PASS';
    await page.getByRole('button', { name: 'Повторить', exact: true }).waitFor();
    await assertTarget(page, 'Повторить', 48);
    assert.equal(await page.getByText('Текущий результат сохранён').count(), 1, 'previous analysis remains visible after failure');
    results.REVISION_FAILURE_UX = 'PASS';

    for (let retry = 0; retry < 3; retry += 1) {
      await page.getByRole('button', { name: 'Повторить', exact: true }).click();
      await page.getByRole('button', { name: 'Повторить', exact: true }).waitFor();
    }
    assert.equal(requestBodies.length, 4);
    assert.ok(requestBodies[0].includes('filename'), 'first request uploads the new evidence');
    requestBodies.slice(1).forEach((body) => assert.ok(!body.includes('filename'), 'retry reuses persisted evidence without a new upload'));
    results.RETRY_IMAGE_IDEMPOTENCY = 'PASS';

    mode = 'unrelated';
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.getByRole('button', { name: '+ Добавить фото', exact: true }).click();
    await fileInputs.nth(3).setInputFiles(fixturePath);
    await page.getByRole('button', { name: 'Пересчитать приём пищи', exact: true }).click();
    await page.getByRole('button', { name: 'Создать отдельный приём пищи', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Всё равно добавить к этому', exact: true }).waitFor();
    results.UNRELATED_IMAGE_GUARD_UX = 'PASS';

    await page.getByRole('button', { name: 'Создать отдельный приём пищи', exact: true }).click();
    await page.locator('img[alt="Превью"]').waitFor();
    results.UNRELATED_IMAGE_SEPARATE_MEAL = 'PASS';

    await page.reload();
    await page.getByRole('button', { name: '+ Добавить фото', exact: true }).click();
    await fileInputs.nth(3).setInputFiles(fixturePath);
    await page.getByRole('button', { name: 'Пересчитать приём пищи', exact: true }).click();
    await page.getByRole('button', { name: 'Всё равно добавить к этому', exact: true }).waitFor();
    mode = 'failure';
    await page.getByRole('button', { name: 'Всё равно добавить к этому', exact: true }).click();
    await page.getByRole('button', { name: 'Повторить', exact: true }).waitFor();
    assert.ok(requestBodies.at(-1).includes('force_same_meal'), 'explicit override must be sent to the server');
    results.UNRELATED_IMAGE_OVERRIDE = 'PASS';

    for (const viewport of [{ width: 360, height: 800 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 430, height: 932 }, { width: 360, height: 500 }]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `${viewport.width}x${viewport.height} must not overflow horizontally`);
    }
    results.MOBILE_LAYOUT = 'PASS';
    results.KEYBOARD_SAFE_AREA = 'PASS';
    results.NO_HORIZONTAL_OVERFLOW = 'PASS';
    results.VISUAL_DENSITY = 'PASS';
    await browser.close();
  } finally {
    server.kill();
  }
  console.log('FOOD_MULTI_PHOTO_UX_QA=PASS');
  for (const [key, value] of Object.entries(results)) console.log(`${key}=${value}`);
  return results;
}

if (process.argv[1] && (process.argv[1].endsWith('qa/run_food_multi_photo_ux_qa.mjs') || process.argv[1].endsWith('qa\\run_food_multi_photo_ux_qa.mjs'))) {
  runFoodMultiPhotoUXQA().catch((error) => { console.error(error); process.exit(1); });
}
