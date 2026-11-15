import { expect, test, type Page } from '@playwright/test';

// Measurement menu on the left edge: each tool produces a value tag, measuring clicks don't pick BOQ rows.
async function useTool(page: Page, name: string) {
  await page.getByRole('button', { name: 'Measurement', exact: true }).hover();
  await page.getByRole('menu', { name: 'Measurement' }).getByRole('button', { name }).click();
  await page.mouse.move(0, 0); // close the menu
}

test('measure length, face area and volume on the sample', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample: NBU Medical Clinic' }).click();
  const table = page.getByRole('region', { name: 'bill of quantities' });
  await expect(table.getByText('IfcWall', { exact: true })).toBeVisible({ timeout: 120_000 });

  const c = (await page.locator('.viewer canvas').boundingBox())!;
  const at = (fx: number, fy: number) => [c.x + c.width * fx, c.y + c.height * fy] as const;
  const click = async (fx: number, fy: number) => {
    await page.mouse.move(...at(fx, fy), { steps: 5 });
    await page.waitForTimeout(400); // snap / hover preview runs on pointer move
    await page.mouse.click(...at(fx, fy));
    await page.waitForTimeout(400);
  };
  const tags = (unit: string) => page.locator('.measure-label:visible').filter({ hasText: new RegExp(`^\\d+\\.\\d+ ${unit}$`) });

  await useTool(page, 'Length free');
  await click(0.45, 0.65);
  await click(0.6, 0.65);
  await expect(tags('m')).toHaveCount(1);
  await expect(table.locator('tr.row-selected')).toHaveCount(0); // measuring clicks don't select

  await useTool(page, 'Area face');
  await click(0.5, 0.62);
  await expect.poll(() => tags('m2').count()).toBeGreaterThan(0); // + hover preview of the face under the cursor

  await useTool(page, 'Volume');
  await click(0.55, 0.66);
  await expect.poll(() => tags('m3').count(), { timeout: 10_000 }).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/measure.png' });

  await page.keyboard.press('Escape');
  await useTool(page, 'Delete all measurements');
  await expect(page.locator('.measure-label:visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});
