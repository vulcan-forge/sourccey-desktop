// Run separately: bun tests/rest/browser-ui.test.js
// Exercises real components with mocked HTTP/native boundaries; no account or robot is used.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import path from 'node:path';

let baseURL = process.argv[2];
if (!baseURL) {
    const build = await Bun.build({
        entrypoints: [path.join(import.meta.dir, 'browser-fixture.tsx')],
        target: 'browser',
        define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
        plugins: [{
            name: 'mock-next-router',
            setup(builder) {
                builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: path.join(import.meta.dir, '../wifi/browser-router.ts') }));
            },
        }],
    });
    if (!build.success) throw new Error(build.logs.join('\n'));
    const script = await build.outputs[0].text();
    const server = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch(request) {
            return new URL(request.url).pathname === '/fixture.js'
                ? new Response(script, { headers: { 'Content-Type': 'text/javascript' } })
                : new Response('<!doctype html><html><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>', { headers: { 'Content-Type': 'text/html' } });
        },
    });
    try {
        const child = Bun.spawn(['node', import.meta.path, `http://127.0.0.1:${server.port}`], { stdout: 'inherit', stderr: 'inherit' });
        process.exitCode = await child.exited;
    } finally {
        server.stop(true);
    }
} else {
    const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chrome', headless: true });
    let passed = 0;
    const test = async (name, url, check) => {
        const page = await browser.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', route => route.abort());
        try {
            await page.goto(`${baseURL}${url}`);
            await check(page);
            assert.deepEqual(errors, [], 'No browser runtime errors');
            console.log(`PASS ${name}`);
            passed++;
        } finally { await page.close(); }
    };
    const submit = async page => {
        await page.getByPlaceholder('Email', { exact: true }).fill('test@example.com');
        await page.locator('input[autocomplete="current-password"]').fill('fixture-password');
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    };
    try {
        for (const native of [false, true]) {
            await test(`${native ? 'Tauri' : 'browser'} password login`, `/account?native=${native}`, async page => {
                if (!native) await page.route('https://api.vulcanrobotics.ai/v1/auth/login', route => {
                    assert.deepEqual(route.request().postDataJSON(), { email: 'test@example.com', password: 'fixture-password', provider: 0 });
                    return route.fulfill({ json: { account: { id: 'browser-account', email: 'test@example.com', role: 'USER' } } });
                });
                await submit(page);
                await page.getByRole('button', { name: 'Sign Out' }).waitFor();
                await page.getByText(native ? 'native-account' : 'browser-account', { exact: true }).waitFor();
                await page.getByRole('button', { name: 'Sign Out' }).click();
                await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
            });
            await test(`${native ? 'Tauri' : 'browser'} login rejection`, `/account?native=${native}&error=true`, async page => {
                if (!native) await page.route('https://api.vulcanrobotics.ai/v1/auth/login', route => route.fulfill({ status: 401, json: { detail: 'Invalid email or password.', code: 'invalid_credentials' } }));
                await submit(page);
                await page.getByText('Invalid email or password.', { exact: true }).waitFor();
                assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).isEnabled(), true);
            });
        }
        for (const provider of ['Google', 'GitHub']) {
            await test(`native ${provider} OAuth URL`, '/account?native=true', async page => {
                await page.getByRole('button', { name: `Continue with ${provider}` }).click();
                await page.waitForFunction(() => window.__restTest.calls.some(c => c.command === 'plugin:webview|create_webview_window'));
                const target = await page.evaluate(() => window.__restTest.calls.find(c => c.command === 'plugin:webview|create_webview_window').args.options.url);
                const url = new URL(target);
                assert.equal(url.origin, 'https://api.vulcanrobotics.ai');
                assert.equal(url.pathname, `/v1/auth/${provider.toLowerCase()}`);
                assert.equal(new URL(url.searchParams.get('redirect_uri')).pathname, '/desktop/auth/callback/');
            });
        }
        await test('catalog uses native HTTP transport', '/account?native=true', async page => {
            await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
            assert.deepEqual(await page.evaluate(() => window.__restTest.catalog()), { items: [], totalCount: 0, nextCursor: null, previousCursor: null });
            const call = await page.evaluate(() => window.__restTest.calls.find(c => c.command === 'desktop_get_robot_catalog'));
            assert.deepEqual(call.args, { path: 'robots', query: { limit: '5', cursor: 'opaque+/=', search: 'robot & one' } });
        });
        await test('developer URL save normalizes legacy URLs', '/developer?native=true', async page => {
            await page.getByRole('button', { name: /Developer Point desktop/ }).click();
            const input = page.locator('#custom-rest-api-url');
            await input.fill('http://dev-box.local:5200/v1/graphql/');
            await input.blur();
            await page.waitForFunction(() => window.__restTest.settings.customRestApiUrl === 'http://dev-box.local:5200/v1');
            assert.equal(await input.inputValue(), 'http://dev-box.local:5200/v1');
            await page.getByText('http://dev-box.local:5200/v1', { exact: true }).first().waitFor();
        });
        console.log(`${passed} browser scenarios passed`);
    } finally { await browser.close(); }
}
