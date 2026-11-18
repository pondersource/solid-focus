const { test, expect } = require('@playwright/test');
const { Parser } = require('n3');
const pod = 'http://localhost:4000/alice/';
const title = 'Focus Playwright task';
const appUrl = process.env.FOCUS_TEST_URL || 'http://localhost:5001';
const schema = 'https://schema.org/';
const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

async function connect(page, register = false) {
    if (process.env.FOCUS_TEST_URL) {
        await page.context().grantPermissions(['local-network-access'], { origin: new URL(appUrl).origin });
    }
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in', exact: true }).first().click();
    const login = page.getByLabel('Login url', { exact: true });
    await login.fill(pod);
    await login.press('Enter');
    if (register) {
        await page.getByText('Sign up', { exact: true }).click();
        await page.locator('#email').fill('alice@example.com');
        await page.locator('#password').fill('focus-ci-password');
        await page.locator('#confirmPassword').fill('focus-ci-password');
        await page.locator('#podName').fill('alice');
        await page.getByRole('button', { name: 'Sign up', exact: true }).click();
        await page.getByRole('link', { name: 'log in', exact: true }).click();
    }
    await page.locator('#email').fill('alice@example.com');
    await page.locator('#password').fill('focus-ci-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('button', { name: /authorize|consent/i }).click();
    await expect(page).toHaveURL(url => url.origin === new URL(appUrl).origin);
    await expect(page.getByLabel('Task name', { exact: true })).toBeVisible();
}

function expand(quads) {
    const nodes = new Map();
    for (const q of quads) {
        const node = nodes.get(q.subject.value) || { '@id': q.subject.value };
        nodes.set(q.subject.value, node);
        if (q.predicate.value === rdfType) {
            (node['@type'] ||= []).push(q.object.value);
        } else {
            const value = q.object.termType === 'NamedNode'
                ? { '@id': q.object.value }
                : { '@value': q.object.value, ...(q.object.datatype ? { '@type': q.object.datatype.value } : {}) };
            (node[q.predicate.value] ||= []).push(value);
        }
    }
    return [...nodes.values()];
}

test('creates and updates a private task, then recovers it from the Pod in a fresh browser', async ({ page, browser, request, baseURL }) => {
    page.on('response', response => {
        if (response.url().startsWith(pod + 'tasks/') && ['PUT', 'PATCH', 'POST'].includes(response.request().method())) {
            console.log('Pod write', response.request().method(), response.url(), response.status());
        }
    });
    await connect(page, true);
    const write = page.waitForResponse(response =>
        response.ok() && response.url().startsWith(pod + 'tasks/') &&
        ['PUT', 'PATCH', 'POST'].includes(response.request().method()) &&
        (response.request().postData() || '').includes(title) &&
        (response.request().postData() || '').includes('Action'),
    );
    await page.getByLabel('Task name', { exact: true }).fill(title);
    await page.getByLabel('Task name', { exact: true }).press('Enter');
    const saved = await write;
    const taskDocument = new URL(saved.headers().location || saved.url(), saved.url());
    taskDocument.hash = '';
    const taskUrl = taskDocument.href;
    console.log('Created task document', taskUrl);
    expect(taskUrl.endsWith('/')).toBeFalsy();
    expect([401, 403, 404]).toContain((await request.get(taskUrl)).status());

    await expect(page.getByText('Online', { exact: true })).toBeAttached({ timeout: 30_000 });
    await page.getByLabel(new RegExp('Select task.*' + title)).click();
    const priorityWrite = page.waitForResponse(response =>
        response.url() === taskUrl && response.request().method() === 'PATCH' && response.ok(),
    );
    await page.getByLabel('Make important', { exact: true }).click();
    await priorityWrite;
    await expect(page.getByText('Online', { exact: true })).toBeAttached({ timeout: 30_000 });
    const completionWrite = page.waitForResponse(response =>
        response.url() === taskUrl && response.request().method() === 'PATCH' && response.ok(),
    );
    await page.getByRole('listitem').filter({ hasText: title }).getByRole('checkbox').check();
    await completionWrite;
    await expect(page.getByText('Online', { exact: true })).toBeAttached({ timeout: 30_000 });

    const fresh = await browser.newContext({ baseURL });
    try {
        const freshPage = await fresh.newPage();
        const read = freshPage.waitForResponse(response =>
            response.url() === taskUrl && response.request().method() === 'GET' && response.ok(),
        );
        await connect(freshPage);
        const response = await read;
        const text = await response.text();
        const quads = new Parser({ baseIRI: taskUrl }).parse(text);
        const { parseSchemaTasks } = await import('../shared-data-modules/tasks/vanilla/build/src/schema-tasks.js');
        const tasks = parseSchemaTasks(expand(quads));
        expect(tasks).toEqual(expect.arrayContaining([expect.objectContaining({
            name: title, priority: 1, completed: true,
            actionStatus: schema + 'CompletedActionStatus',
        })]));
        await freshPage.getByLabel('Show completed', { exact: true }).click();
        await expect(freshPage.getByText(title, { exact: true }).first()).toBeVisible();
    } finally {
        await fresh.close();
    }
});
