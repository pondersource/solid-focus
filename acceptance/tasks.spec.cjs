const { test, expect } = require('@playwright/test');
const provider = 'http://localhost:4013';
const pod = provider + '/alice/';

async function connect(page, baseURL) {
    await page.goto(baseURL);
    await page.getByRole('button', { name: 'Log in', exact: true }).first().click();
    await page.getByRole('button', { name: 'Connect storage', exact: true }).click();
    await page.locator('.rs-choose-solid').click();
    await page.locator('[name="rs-provider-address"]').fill(provider);
    await page.locator('.rs-solid-connect').click();
    await page.locator('#email').fill('alice@example.com');
    await page.locator('#password').fill('storage-test-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('button', { name: /authorize|consent/i }).click();
    await expect(page).toHaveURL(url => url.origin === new URL(baseURL).origin);
}

async function snapshot(page, url) {
    return page.evaluate(async documentUrl => {
        const document = await window.ponderStorage.api.readFocusDocument(documentUrl);
        return { url: document.url, body: document.body, tasks: document.tasks,
            quads: document.quads.map(q => ({ s: q.subject.value, st: q.subject.termType,
                p: q.predicate.value, o: q.object.value, ot: q.object.termType,
                language: q.object.language, datatype: q.object.datatype?.value })) };
    }, url);
}

test('guest tasks remain local and survive reload while every backend is available', async ({ page, baseURL }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    for (const backend of ['remotestorage', 'dropbox', 'googledrive', 'solid', 'lws', 'onedrive', 'atomic', 'nextgraph']) {
        const choice = backend === 'remotestorage' ? '.rs-choose-rs' : '.rs-choose-' + backend;
        await expect(page.locator(choice)).toHaveCount(1);
    }
    await page.getByRole('button', { name: 'Get started', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Task name' }).fill('Guest task survives reload');
    await page.getByRole('textbox', { name: 'Task name' }).press('Enter');
    await expect(page.getByText('Guest task survives reload', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Guest task survives reload', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.ponderStorage.rs.connected)).toBe(false);
    expect(errors).toEqual([]);
});

test('complete guest archive survives transfer into a fresh browser without authenticating it', async ({ page, browser, baseURL }) => {
    await page.goto(baseURL);
    await page.getByRole('button', { name: 'Get started', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Task name' }).fill('Transfer this complete guest project');
    await page.getByRole('textbox', { name: 'Task name' }).press('Enter');
    await expect(page.getByText('Transfer this complete guest project', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Configuration', exact: true }).click();
    await page.getByText('Connect account', { exact: true }).click();
    await page.locator('.rs-choose-nextgraph').click();
    await expect(page.locator('[name=rs-nextgraph-wallet]')).toHaveValue('https://nextgraph.net');
    await page.locator('.rs-nextgraph-connect').click();
    await expect(page.locator('.rs-nextgraph-error')).toContainText('Export your guest projects');
    await page.locator('.rs-nextgraph-back').click();
    expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);
    const download = page.waitForEvent('download');
    await page.locator('.rs-export-guest').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('solidfocus-guest-projects.json');
    const body = await require('node:fs/promises').readFile(await file.path(), 'utf8');
    const backup = JSON.parse(body);
    expect(backup.workspaces.length).toBeGreaterThan(0);
    expect(backup.collections.flatMap(collection => collection.documents).some(record =>
        JSON.stringify(record.document).includes('Transfer this complete guest project'))).toBe(true);
    await page.evaluate(() => window.ponderStorage.widget.guestData.beforeConnect());
    const fresh = await browser.newContext();
    try {
        const second = await fresh.newPage();
        await second.goto(baseURL);
        await second.waitForFunction(() => window.ponderStorage?.widget?.guestData);
        // Exercise the app hook independently of the native wallet UI.
        await second.evaluate(text => window.ponderStorage.widget.guestData.import(
            new File([text], 'solidfocus-guest-projects.json', { type: 'application/json' })), body);
        await expect(second.getByText('Transfer this complete guest project', { exact: true })).toBeVisible();
        expect(await second.evaluate(() => window.ponderStorage.rs.connected)).toBe(false);
        await second.reload();
        await expect(second.getByText('Transfer this complete guest project', { exact: true })).toBeVisible();
        const exported = await second.evaluate(() => window.ponderStorage.widget.guestData.export());
        expect(JSON.parse(exported.body)).toEqual(backup);
    } finally { await fresh.close(); }
});

test('native task creation/edit preserves RDF and is visible to a fresh signed-in browser', async ({ page, browser, baseURL }) => {
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    const observe = request => {
        if (request.url().startsWith(pod) && ['PUT', 'PATCH', 'POST', 'DELETE'].includes(request.method())) writes.push(request.url());
    };
    page.on('request', observe);
    await connect(page, baseURL);
    const title = 'Native SolidFocus acceptance task';
    const created = page.waitForResponse(response => response.ok() && response.url().startsWith(pod + 'tasks/')
        && ['PATCH', 'PUT', 'POST'].includes(response.request().method())
        && (response.request().postData() || '').includes(title));
    await page.getByRole('textbox', { name: 'Task name' }).fill(title);
    await page.getByRole('textbox', { name: 'Task name' }).press('Enter');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const documentUrl = (await created).url();
    // The first HTTP write precedes completion of the upstream Cloud sync.
    // Finish that cycle before introducing an independent external edit.
    await expect(page.getByText('Online', { exact: true })).toHaveCount(1);
    const original = await snapshot(page, documentUrl);
    expect(original.tasks.find(task => task.name === title).uri).toBe(documentUrl + '#it');
    expect(original.quads.filter(q => q.s === documentUrl + '#it' && q.p.endsWith('#type')).map(q => q.o)).toEqual(
        expect.arrayContaining(['https://schema.org/Action', 'http://www.w3.org/2002/12/cal/ical#Vtodo']));
    const createdAt = original.quads.find(q => q.p.endsWith('/createdAt')).o;
    const separateUrl = pod + 'separate-native-document';
    const separateBefore = await page.evaluate(async ({ documentUrl, separateUrl }) => {
        const session = window.ponderStorage.rs.solid.getSession();
        const fetch = session.fetch.bind(session);
        const document = await fetch(documentUrl);
        const extra = '\n<#it> <https://unknown.test/language> "hola"@es; <https://unknown.test/link> '
            + '[ <https://unknown.test/lexical> "0007"^^<http://www.w3.org/2001/XMLSchema#integer> ]; '
            + '<https://unknown.test/document> <https://other.test/original#it>.\n';
        const updated = await fetch(documentUrl, { method: 'PUT', headers: { 'Content-Type': 'text/turtle',
            'If-Match': document.headers.get('ETag') }, body: await document.text() + extra });
        if (!updated.ok) throw Error('Could not seed unknown RDF: HTTP ' + updated.status);
        const separate = await fetch(separateUrl, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' },
            body: '<#other> <https://schema.org/name> "Do not rewrite this document".' });
        if (!separate.ok) throw Error('Could not create separate document');
        return (await fetch(separateUrl)).text();
    }, { documentUrl, separateUrl });

    await page.getByRole('listitem').filter({ hasText: title }).locator('button[aria-label^="Select task"]').click();
    const edited = page.waitForResponse(response => response.url() === documentUrl && response.ok()
        && response.request().method() === 'PATCH' && (response.request().postData() || '').includes('priority'));
    await page.getByRole('button', { name: 'Make important', exact: true }).click();
    await edited;
    await expect.poll(async () => (await snapshot(page, documentUrl)).tasks.find(task => task.name === title)?.priority).toBe(1);
    const updated = await snapshot(page, documentUrl);
    expect(updated.quads.some(q => q.language === 'es' && q.o === 'hola')).toBe(true);
    expect(updated.quads.some(q => q.st === 'BlankNode' && q.o === '0007' && q.datatype.endsWith('#integer'))).toBe(true);
    expect(updated.quads.some(q => q.ot === 'NamedNode' && q.o === 'https://other.test/original#it')).toBe(true);
    expect(updated.quads.some(q => q.o === 'https://vocab.noeldemartin.com/crdt/SetPropertyOperation')).toBe(true);
    expect(updated.quads.find(q => q.p.endsWith('/createdAt')).o).toBe(createdAt);
    expect(await page.evaluate(async url => (await window.ponderStorage.api.fetch(url)).text(), separateUrl)).toBe(separateBefore);

    const context = await browser.newContext();
    const fresh = await context.newPage();
    fresh.on('pageerror', error => errors.push(error.message));
    fresh.on('request', observe);
    await connect(fresh, baseURL);
    await expect(fresh.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
    const reloaded = await snapshot(fresh, documentUrl);
    expect(reloaded.tasks.find(task => task.name === title).priority).toBe(1);
    expect(reloaded.quads.some(q => q.language === 'es' && q.o === 'hola')).toBe(true);
    expect(writes.some(url => url.includes('/_rs/'))).toBe(false);
    expect(writes.some(url => url.startsWith(pod + 'settings/privateTypeIndex'))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});
