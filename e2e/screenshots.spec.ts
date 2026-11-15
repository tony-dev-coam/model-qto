// Portfolio screenshots of the NBU sample. Run: SHOT_DIR=docs/screenshots npx playwright test e2e/screenshots.spec.ts
import { expect, test, type Page } from '@playwright/test';
const OUT = process.env.SHOT_DIR!;
test.skip(!OUT, 'set SHOT_DIR to write screenshots');

async function loadSample(page: Page) {
  await page.getByRole('button', { name: 'Load sample: NBU Medical Clinic' }).click();
  const table = page.getByRole('region', { name: 'bill of quantities' });
  await expect(table.getByText('IfcWall', { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.ant-message-notice')).toHaveCount(0, { timeout: 15_000 }); // let the toast fade
  return table;
}
const expand = (table: any, text: string) => table.locator('tr', { hasText: text }).first().locator('.ant-table-row-expand-icon-collapsed').click();
async function price(table: any, rowText: string, value: string) {
  const input = table.locator('tr', { hasText: rowText }).first().getByLabel('unit price');
  await input.fill(value);
  await input.blur();
}

test('desktop', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/modelqto-empty-state-1440.png` });
  const table = await loadSample(page);
  await expand(table, 'IfcWall');
  await expand(table, 'Exterior - Insul Panel');
  await expand(table, 'IfcWindow');
  await expand(table, '1735 x 1000mm');
  await price(table, 'Insulation - Insulated Panel', '185');
  await price(table, 'Metal - Firring', '92');
  await price(table, 'Wood - Sheathing', '410');
  await price(table, 'Plasterboard', '120');
  await price(table, 'Metal - Stud Layer', '140');
  await table.locator('tr', { hasText: '1735 x 1000mm' }).locator('xpath=following-sibling::tr[1]').getByLabel('unit price').fill('640');
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  const box = (await page.locator('.viewer canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -30);
  await page.mouse.move(box.x + box.width + 300, box.y + 600);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/modelqto-boq-1440.png` });
  // Select the window line: 58 windows turn amber in 3D, then zoom back to the whole building.
  await table.locator('tr', { hasText: '1735 x 1000mm' }).locator('xpath=following-sibling::tr[1]').locator('td').first().click();
  await page.waitForTimeout(1500);
  await expect(table.locator('tr.row-selected')).toHaveCount(1);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -30);
  await page.mouse.move(box.x + box.width + 300, box.y + 600);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/modelqto-selection-1440.png` });
});

test('mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/modelqto-empty-state-390.png` });
  const table = await loadSample(page);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${OUT}/modelqto-model-390.png` });
  await expand(table, 'IfcWall');
  await page.evaluate(() => document.querySelector('.boq-panel')!.scrollIntoView());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/modelqto-boq-390.png` });
});
