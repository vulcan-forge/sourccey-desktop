// Run separately: bun tests/wifi/browser-ui.test.js
// Uses installed Edge/Chrome; no robot, passwords or live radio operations.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

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
    const css = process.env.SOURCCEY_NETWORK_TEST_CSS ? await Bun.file(process.env.SOURCCEY_NETWORK_TEST_CSS).text() : '';
    const server = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch(request) {
            if (new URL(request.url).pathname === '/fixture.css') return new Response(css, { headers: { 'Content-Type': 'text/css' } });
            return new URL(request.url).pathname === '/fixture.js'
                ? new Response(script, { headers: { 'Content-Type': 'text/javascript' } })
                : new Response(
                      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
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
// The switch uses a visually hidden input. Click its visible enclosing label,
// as a customer does, so this suite also works with production CSS.
const clickToggle = (page) => toggle(page).locator('..').click();
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
        await clickToggle(page);
        await waitMessage(page, 'Robot address: 192.168.4.1');
        assert.equal(await toggle(page).isChecked(), true);
        assert.deepEqual((await calls(page, 'set_access_point'))[0].args, { ssid: 'New Robot', password: 'saved-password' });
        assert.equal((await calls(page, 'save_access_point_credentials')).length, 0);
    });
    await test('Activation failure does not show enabled or replace saved credentials', 'enable-error', false, async (page) => {
        await ready(page);
        await clickToggle(page);
        await waitMessage(page, 'Adapter does not support hotspot mode');
        assert.equal(await toggle(page).isChecked(), false);
        assert.equal((await calls(page, 'save_access_point_credentials')).length, 0);
    });
    await test('Pending hotspot activation blocks repeat requests', 'pending-enable', false, async (page) => {
        await ready(page);
        await clickToggle(page);
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
        await clickToggle(page);
        await waitMessage(page, 'Robot Wi-Fi is off. Select a network from the Wi-Fi menu.');
        assert.equal(await toggle(page).isChecked(), false);
        assert.equal((await calls(page, 'set_wifi')).length, 1);
    });
    await test('A stalled status refresh does not leave the hotspot toggle loading', 'stalled-refresh', false, async (page) => {
        await ready(page);
        await clickToggle(page);
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
    for (const scenario of ['', 'wpa', 'wpa2', 'mixed', 'open', 'connect-error', 'missing-secret']) {
        await test(`Wi-Fi connect payload and result: ${scenario || 'WPA3'}`, scenario, true, async (page) => {
            await selectNetwork(page);
            if (scenario !== 'open') await page.locator('#wifi-password').fill('customer-password');
            await page.getByRole('button', { name: 'Connect', exact: true }).click();
            await waitMessage(
                page,
                ['connect-error', 'missing-secret'].includes(scenario)
                    ? 'Check the password and try again.'
                    : 'Successfully connected to Customer Wi-Fi'
            );
            assert.deepEqual((await calls(page, 'connect_to_wifi'))[0].args, {
                ssid: 'Customer Wi-Fi',
                password: scenario === 'open' ? '' : 'customer-password',
                security: { open: 'Open', wpa: 'WPA', wpa2: 'WPA2', mixed: 'WPA2 WPA3' }[scenario] ?? 'WPA3',
            });
            assert.equal(await page.getByText(/Connection failed: Connection failed:/).count(), 0);
            assert.equal(await page.getByText(/journalctl|passwd-file|NM_CONNECTION|nmcli cannot/).count(), 0);
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
            await page.getByRole('button', { name: 'Close network settings' }).click();
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
        await clickToggle(page);
        await waitMessage(page, 'Could not disable hotspot');
        assert.equal(await toggle(page).isChecked(), true);
    });
    await test('Disconnect failure preserves current network', 'disconnect-error', true, async (page) => {
        await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
        await waitMessage(page, 'Network access was denied.');
        assert.equal(await page.getByText('Connected to Customer Wi-Fi', { exact: true }).count(), 1);
    });
    await test('Scan failures are visible and refresh remains available', 'scan-error', true, async (page) => {
        await waitMessage(page, 'Could not scan Wi-Fi networks. Check the connection and try again.');
        assert.equal(await page.getByRole('button', { name: 'Refresh', exact: true }).isDisabled(), false);
        assert.equal(await page.getByText('Connected to Customer Wi-Fi', { exact: true }).count(), 1);
    });
    for (const scenario of ['ethernet', 'ethernet-ipv6', 'ethernet-scan-error', 'ethernet-hotspot']) {
        await test(`Ethernet remains visible: ${scenario}`, scenario, true, async (page) => {
            await waitMessage(page, 'Primary connection');
            await waitMessage(page, scenario === 'ethernet-ipv6' ? '2001:db8::2/64' : '10.0.0.2/24');
            await waitMessage(page, 'Local network connected. Internet access is unavailable.');
            assert.equal((await calls(page, 'connect_ethernet')).length, 0);
            if (scenario === 'ethernet-hotspot') assert.equal((await calls(page, 'scan_wifi_networks')).length, 0);
            if (scenario === 'ethernet-scan-error') await waitMessage(page, 'Could not scan Wi-Fi networks.');
        });
    }
    await test(
        'Ethernet cable insertions connect automatically once each; unplug clears addresses',
        'ethernet-unplugged',
        true,
        async (page) => {
            await waitMessage(page, 'Cable unplugged');
            assert.equal((await calls(page, 'connect_ethernet')).length, 0);
            const insert = () =>
                page.evaluate(async () => {
                    const device = window.__networkTest.network.ethernet[0];
                    device.cable_connected = true;
                    device.state = 'disconnected';
                    await window.__networkTest.refreshNetwork();
                });
            await insert();
            await waitMessage(page, '10.0.0.2/24');
            assert.equal((await calls(page, 'connect_ethernet')).length, 1);
            await page.evaluate(() => window.__networkTest.refreshNetwork());
            assert.equal((await calls(page, 'connect_ethernet')).length, 1);
            await page.evaluate(async () => {
                const state = window.__networkTest;
                state.network.ethernet[0].cable_connected = false;
                state.network.ethernet[0].state = 'unavailable';
                state.network.ethernet[0].addresses = [];
                state.network.primary_interface = null;
                await state.refreshNetwork();
            });
            await waitMessage(page, 'Cable unplugged');
            assert.equal(await page.getByText('10.0.0.2/24', { exact: true }).count(), 0);
            await insert();
            await waitMessage(page, '10.0.0.2/24');
            assert.equal((await calls(page, 'connect_ethernet')).length, 2);
        }
    );
    await test('Ethernet DHCP failure is actionable and does not retry forever', 'ethernet-dhcp-error', true, async (page) => {
        const button = page.getByRole('button', { name: 'Connect Ethernet enx123' });
        await button.waitFor();
        await page.waitForFunction(() => window.__networkTest.calls.some((call) => call.command === 'connect_ethernet'));
        await page.evaluate(() => window.__networkTest.refreshNetwork());
        assert.equal((await calls(page, 'connect_ethernet')).length, 1);
        await button.click();
        await waitMessage(page, 'The network did not assign an IP address.');
        assert.equal((await calls(page, 'connect_ethernet')).length, 2);
        assert.equal(await page.getByText(/journalctl|NM_CONNECTION|IP configuration/).count(), 0);
    });
    await test('Pending automatic Ethernet connection disables duplicate requests', 'ethernet-pending', true, async (page) => {
        await page.waitForFunction(() => window.__networkTest.pending !== null);
        const button = page.getByRole('button', { name: 'Connect Ethernet enx123' });
        assert.equal(await button.isDisabled(), true);
        await page.evaluate(() => window.__networkTest.refreshNetwork());
        assert.equal((await calls(page, 'connect_ethernet')).length, 1);
        await page.evaluate(() => window.__networkTest.pending());
        await waitMessage(page, 'Primary connection');
    });
    await test('Ethernet status failure does not prevent Wi-Fi connection', 'ethernet-status-error', true, async (page) => {
        await waitMessage(page, 'Could not read wired network status.');
        await selectNetwork(page);
        await page.locator('#wifi-password').fill('customer-password');
        await page.getByRole('button', { name: 'Connect', exact: true }).click();
        await waitMessage(page, 'Successfully connected to Customer Wi-Fi');
        assert.equal(await page.getByText(/D-Bus|NM_CONNECTION/).count(), 0);
    });
    if (process.env.SOURCCEY_NETWORK_TEST_CSS) {
        for (const viewport of [
            { width: 1280, height: 720 },
            { width: 800, height: 480 },
        ]) {
            await test(`Network dialog remains usable at ${viewport.width}x${viewport.height}`, 'ethernet', true, async (page) => {
                await page.setViewportSize(viewport);
                await waitMessage(page, 'Primary connection');
                const dialog = page.getByRole('dialog');
                const bounds = await dialog.boundingBox();
                assert.ok(
                    bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height
                );
                await selectNetwork(page);
                await page.locator('#wifi-password').fill('synthetic-password');
                await page.getByRole('button', { name: 'Connect', exact: true }).scrollIntoViewIfNeeded();
                assert.equal(await page.getByRole('button', { name: 'Connect', exact: true }).isVisible(), true);
                assert.equal(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth), false);
                if (process.env.SOURCCEY_NETWORK_TEST_SCREENSHOTS) {
                    await mkdir(process.env.SOURCCEY_NETWORK_TEST_SCREENSHOTS, { recursive: true });
                    await page.screenshot({
                        path: path.join(process.env.SOURCCEY_NETWORK_TEST_SCREENSHOTS, `network-${viewport.width}x${viewport.height}.png`),
                    });
                }
            });
        }
    }
    console.log(`${passed} browser interaction tests passed (mocked native IPC, real production components).`);
} finally {
    await browser.close();
}
