// Performance check on large local files (not committed). Run: PERF=1 npx playwright test e2e/perf.spec.ts
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { expect, test } from '@playwright/test';

const FILES = [
  { path: `${homedir()}/bim-samples/office_arc.ifc`, budgetS: 30, expectBoq: true }, // ≥ 50 MB target: ≤ 30 s
  { path: `${homedir()}/bim-samples/office_hvac.ifc`, budgetS: 300, expectBoq: false }, // 167 MB: must finish, MEP is out of scope
];

for (const f of FILES) {
  test(`opens ${f.path.split('/').pop()}`, async ({ page }) => {
    test.skip(!process.env.PERF || !existsSync(f.path), 'set PERF=1 and provide the file');
    test.setTimeout((f.budgetS + 60) * 1000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const t0 = Date.now();
    await page.locator('input[type=file]').setInputFiles(f.path);
    const region = page.getByRole('region', { name: 'bill of quantities' });
    // Done = the BOQ table replaced the empty state, or an error is shown.
    await expect(region.locator('.ant-table').or(page.locator('.ant-alert-error'))).toBeVisible({ timeout: f.budgetS * 1000 });
    const seconds = (Date.now() - t0) / 1000;
    console.log(`${f.path.split('/').pop()}: ${seconds.toFixed(1)} s, BOQ rows ${await region.locator('tr.ant-table-row').count()}`);
    await expect(page.locator('.ant-alert-error')).toHaveCount(0);
    if (f.expectBoq) await expect(region.getByText('IfcWall', { exact: true })).toBeVisible();
    expect(seconds).toBeLessThanOrEqual(f.budgetS);
    expect(errors).toEqual([]);
  });
}
