import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';

test('sample file → 3D + BOQ → price → Excel, without sending anything off-origin', async ({ page }) => {
  const offOrigin: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) offOrigin.push(r.url());
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample: NBU Medical Clinic' }).click();
  const table = page.getByRole('region', { name: 'bill of quantities' });
  await expect(table.getByText('IfcWall', { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('canvas')).toBeVisible();

  // Expand the first group down to a leaf, then price it.
  while ((await table.getByLabel('unit price').count()) === 0) await table.locator('.ant-table-row-expand-icon-collapsed').first().click();
  const price = table.getByLabel('unit price').first();
  await price.fill('100');
  await price.blur();
  const totalCell = table.locator('.ant-table-summary b.num');
  await expect(totalCell).not.toHaveText('0');
  const webTotal = Number((await totalCell.textContent())!.replace(/,/g, ''));

  // BOQ row → 3D highlight within 200 ms (performance 'select' measure from TakeoffProvider).
  await page.evaluate(() => performance.clearMeasures('select'));
  await table.locator('tr.row-group', { hasText: 'IfcWindow' }).first().click();
  await expect(table.locator('tr.row-selected')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('select').length)).toBeGreaterThan(0);
  const selectMs = await page.evaluate(() => performance.getEntriesByName('select')[0].duration);
  console.log(`row click → highlight: ${selectMs.toFixed(0)} ms`);
  expect(selectMs).toBeLessThanOrEqual(200);

  // 3D pick on the building → its BOQ row is selected and revealed. The view centre of the NBU clinic looks into
  // rooms (elements outside the takeoff), so try a few points down to the front facade until one hits a takeoff element.
  const canvas = (await page.locator('.viewer canvas').boundingBox())!;
  const leafSelected = table.locator('tr.row-selected:not(.row-group)');
  for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.65], [0.45, 0.68], [0.6, 0.6], [0.35, 0.62]]) {
    await page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    if (await leafSelected.isVisible({ timeout: 1500 }).catch(() => false)) break;
  }
  await expect(leafSelected).toBeVisible();

  // Excel total equals web total.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Excel' }).click()]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await download.path())!);
  const ws = wb.getWorksheet('BOQ')!;
  const result = (ws.getRow(ws.rowCount).getCell(8).value as ExcelJS.CellFormulaValue).result as number;
  expect(Math.round(result)).toBe(webTotal);

  expect(offOrigin).toEqual([]);
  expect(errors).toEqual([]);
});

test('a non-IFC file shows a readable error', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.ifc', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('This is not an IFC file')).toBeVisible();
});
