// Run separately: bun tests/wifi/browser-ui.test.js
// Uses installed Edge/Chrome; no robot, passwords or live radio operations.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import path from 'node:path';

let baseURL = process.argv[2];
if (!baseURL) {
    const build = await Bun.build({
        entrypoints: [path.join(import.meta.dir, 'browser-fixture.tsx')],
        target: 'browser',
        define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
        plugins: [
            {
                name: 'mock-next-router',
                setup(builder) {
                    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: path.join(import.meta.dir, 'browser-router.ts') }));
                },
            },
        ],
    });
    if (!build.success) throw new Error(build.logs.join('\n'));
    const script = await build.outputs[0].text();
    const server = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch(request) {
            return new URL(request.url).pathname === '/fixture.js'
                ? new Response(script, { headers: { 'Content-Type': 'text/javascript' } })
                : new Response(
                      '<!doctype html><html><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
                      { headers: { 'Content-Type': 'text/html' } }
                  );
        },
    });
    // Playwright's Windows subprocess transport requires Node. Bun serves the
    // in-memory fixture while the Node child drives the browser.
    try {
        const child = Bun.spawn(['node', import.meta.path, `http://127.0.0.1:${server.port}`], { stdout: 'inherit', stderr: 'inherit' });
        const code = await child.exited;
        server.stop(true);
        process.exit(code);
    } finally {
        server.stop(true);
    }
}
const browser = await chromium.launch({
    channel: process.env.SOURCCEY_TEST_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chrome'),
    headless: true,
});
let passed = 0;
async function test(name, scenario, modal, check) {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error('Browser error:', error.message);
    });
    try {
        console.log(`TEST ${name}`);
        await page.goto(`${baseURL}/kiosk/${modal ? 'modal' : 'settings'}?scenario=${scenario}`);
        await check(page);
        assert.deepEqual(errors, [], 'No browser runtime errors');
        console.log(`PASS ${name}`);
        passed++;
    } finally {
        await page.close();
    }
}
const toggle = (page) => page.getByRole('checkbox', { name: 'Broadcast Robot Wi-Fi' });
const calls = (page, command) => page.evaluate((cmd) => window.__networkTest.calls.filter((c) => c.command === cmd), command);
const ready = (page) => page.waitForFunction(() => document.getElementById('ap-password')?.value === 'saved-password');
const waitMessage = (page, text) => page.getByText(text, { exact: false }).first().waitFor();
const selectNetwork = async (page) => {
    await page.getByRole('button', { name: /Customer Wi-Fi.*80%/ }).click();
};
try {
    await test('Saved credentials load atomically; unsaved edits survive status refresh', '', false, async (page) => {
        await ready(page);
        assert.equal(await page.locator('#ap-ssid').inputValue(), 'Saved Robot');
        await page.locator('#ap-ssid').fill('Draft Robot');
        const count = (await calls(page, 'get_access_point_status')).length;
        await page.evaluate(() => window.__networkTest.refreshStatus());
        assert.ok((await calls(page, 'get_access_point_status')).length > count);
        assert.equal(await page.locator('#ap-ssid').inputValue(), 'Draft Robot');
        assert.equal((await calls(page, 'save_access_point_credentials')).length, 0);
    });
    for (const scenario of ['slow-credentials', 'stale-credentials']) {
        await test(`Cannot enable with pending or stale credentials: ${scenario}`, scenario, false, async (page) => {
            await page.locator('#ap-password').waitFor();
            assert.equal(await toggle(page).isDisabled(), true);
            await ready(page);
            await page.waitForFunction(() => !document.querySelector('input[aria-label="Broadcast Robot Wi-Fi"]').disabled);
        });
    }
    for (const [scenario, message] of [
        ['credentials-error', 'Could not load saved'],
        ['status-error', 'Could not check robot'],
    ]) {
        await test(`${scenario} blocks toggle and displays real error`, scenario, false, async (page) => {
            await waitMessage(page, message);
            assert.equal(await toggle(page).isDisabled(), true);
            assert.equal((await calls(page, 'set_access_point')).length, 0);
        });
    }
    await test('Enable sends visible credentials; status comes from backend', '', false, async (page) => {
        await ready(page);
        await page.locator('#ap-ssid').fill('New Robot');
        await toggle(page).check();
        await waitMessage(page, 'Robot address: 192.168.4.1');
        assert.equal(await toggle(page).isChecked(), true);
        assert.deepEqual((await calls(page, 'set_access_point'))[0].args, { ssid: 'New Robot', password: 'saved-password' });
        assert.equal((await calls(page, 'save_access_point_credentials')).length, 0);
    });
    await test('Activation failure does not show enabled or replace saved credentials', 'enable-error', false, async (page) => {
        await ready(page);
        await toggle(page)
            .check()
            .catch(() => {}); // Controlled checkbox stays off on failure.
        await waitMessage(page, 'Adapter does not support hotspot mode');
        assert.equal(await toggle(page).isChecked(), false);
        assert.equal((await calls(page, 'save_access_point_credentials')).length, 0);
    });
    await test('Pending hotspot activation blocks repeat requests', 'pending-enable', false, async (page) => {
        await ready(page);
        await toggle(page).click();
        assert.equal(await toggle(page).isDisabled(), true);
        assert.equal((await calls(page, 'set_access_point')).length, 1);
        await page.evaluate(() => window.__networkTest.pending());
        await waitMessage(page, 'Robot address: 192.168.4.1');
    });
    await test('Saving while active restarts with edited credentials', 'hotspot', false, async (page) => {
        await ready(page);
        await page.locator('#ap-password').fill('updated-password');
        await page.getByRole('button', { name: 'Save and Restart Robot Wi-Fi' }).click();
        await waitMessage(page, 'Robot Wi-Fi updated');
        assert.equal((await calls(page, 'set_access_point'))[0].args.password, 'updated-password');
    });
    await test('Save failure is not reported as success', 'save-error', false, async (page) => {
        await ready(page);
        await page.getByRole('button', { name: 'Save Robot Network Credentials' }).click();
        await waitMessage(page, 'Cannot write credentials file');
        assert.equal(await page.getByText('Robot network credentials saved.', { exact: true }).count(), 0);
    });
    await test('Disable with no saved network reports disconnected rather than success', 'hotspot', false, async (page) => {
        await ready(page);
        await toggle(page).uncheck();
        await waitMessage(page, 'Robot Wi-Fi is off. Select a network from the Wi-Fi menu.');
        assert.equal(await toggle(page).isChecked(), false);
        assert.equal((await calls(page, 'set_wifi')).length, 1);
    });
    await test('A stalled status refresh does not leave the hotspot toggle loading', 'stalled-refresh', false, async (page) => {
        await ready(page);
        await toggle(page).uncheck();
        await waitMessage(page, 'Robot Wi-Fi is off. Select a network from the Wi-Fi menu.');
        assert.equal(await toggle(page).isChecked(), false);
        assert.equal(await toggle(page).isDisabled(), false);
        assert.equal(await page.locator('.animate-spin').count(), 0);
    });
    await test('Wi-Fi dialog detects hotspot and explicitly switches before scanning', 'hotspot', true, async (page) => {
        await page.getByRole('button', { name: 'Switch to Wi-Fi', exact: true }).waitFor();
        assert.equal((await calls(page, 'scan_wifi_networks')).length, 0);
        assert.equal(await page.getByText('Connected to Saved Robot', { exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Switch to Wi-Fi', exact: true }).click();
        await selectNetwork(page);
        assert.equal((await calls(page, 'set_wifi')).length, 1);
    });
    await test('Wi-Fi dialog completes mode switching when the status refresh stalls', 'stalled-refresh', true, async (page) => {
        await page.getByRole('button', { name: 'Switch to Wi-Fi', exact: true }).click();
        await waitMessage(page, 'Robot Wi-Fi is off. Select a network from the Wi-Fi menu.');
        assert.equal(await page.getByRole('button', { name: 'Switching...', exact: true }).count(), 0);
        assert.equal((await calls(page, 'set_wifi')).length, 1);
    });
    for (const scenario of ['', 'wpa', 'wpa2', 'mixed', 'open', 'connect-error']) {
        await test(`Wi-Fi connect payload and result: ${scenario || 'WPA3'}`, scenario, true, async (page) => {
            await selectNetwork(page);
            if (scenario !== 'open') await page.locator('#wifi-password').fill('customer-password');
            await page.getByRole('button', { name: 'Connect', exact: true }).click();
            await waitMessage(
                page,
                scenario === 'connect-error' ? 'Connection failed: authentication failed' : 'Successfully connected to Customer Wi-Fi'
            );
            assert.deepEqual((await calls(page, 'connect_to_wifi'))[0].args, {
                ssid: 'Customer Wi-Fi',
                password: scenario === 'open' ? '' : 'customer-password',
                security: { open: 'Open', wpa: 'WPA', wpa2: 'WPA2', mixed: 'WPA2 WPA3' }[scenario] ?? 'WPA3',
            });
            assert.equal(await page.getByText(/Connection failed: Connection failed:/).count(), 0);
        });
    }
    await test(
        'Pending connect prevents duplicate Enter and refresh; closed modal ignores late completion',
        'pending-connect',
        true,
        async (page) => {
            await selectNetwork(page);
            await page.locator('#wifi-password').fill('customer-password');
            await page.locator('#wifi-password').press('Enter');
            await page.waitForFunction(() => window.__networkTest.pending !== null);
            assert.equal(await page.getByRole('button', { name: /Refresh|Scanning/ }).isDisabled(), true);
            assert.equal((await calls(page, 'connect_to_wifi')).length, 1);
            await page.getByRole('button', { name: 'Close Wi-Fi settings' }).click();
            await page.evaluate(() => window.__networkTest.pending());
            await page.getByRole('button', { name: 'Open Wi-Fi', exact: true }).click();
            await waitMessage(page, 'Connected to Customer Wi-Fi');
            assert.equal(await page.getByText('Successfully connected to Customer Wi-Fi', { exact: true }).count(), 0);
        }
    );
    await test('Disconnect clears current connection after backend confirmation', 'connected', true, async (page) => {
        await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
        await waitMessage(page, 'Successfully disconnected from WiFi');
        assert.equal(await page.getByText('Connected to Customer Wi-Fi', { exact: true }).count(), 0);
    });
    await test('Disable failure preserves actual enabled status', 'disable-error', false, async (page) => {
        await ready(page);
        await toggle(page).click();
        await waitMessage(page, 'Could not disable hotspot');
        assert.equal(await toggle(page).isChecked(), true);
    });
    await test('Disconnect failure preserves current network', 'disconnect-error', true, async (page) => {
        await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
        await waitMessage(page, 'Disconnect not authorized');
        assert.equal(await page.getByText('Connected to Customer Wi-Fi', { exact: true }).count(), 1);
    });
    await test('Scan failures are visible and refresh remains available', 'scan-error', true, async (page) => {
        await waitMessage(page, 'Wi-Fi scan unavailable');
        assert.equal(await page.getByRole('button', { name: 'Refresh', exact: true }).isDisabled(), false);
        assert.equal(await page.getByText('Connected to Customer Wi-Fi', { exact: true }).count(), 1);
    });
    console.log(`${passed} browser interaction tests passed (mocked native IPC, real production components).`);
} finally {
    await browser.close();
}
