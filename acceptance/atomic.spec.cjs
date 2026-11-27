const { readFileSync } = require('node:fs');
const { test, expect } = require('@playwright/test');

function run(source) {
    const core = 'https://atomicdata.dev/properties/';
    const table = 'https://example.test/tasks';
    const rowClass = table + '/task';
    const rows = new Map();
    let next = 0;
    function resource(subject) {
        const values = {...rows.get(subject)};
        return {
            subject,
            get: property => values[property],
            set: (property, value) => { values[property] = value; },
            save: async () => { rows.set(subject, values); },
            destroy: async () => { rows.delete(subject); },
        };
    }
    const store = {
        getData: async () => ({table, rowClass}),
        query: async ({property, value}) => [...rows].filter(([, row]) => row[property] === value).map(([key]) => key),
        getResource: async subject => resource(subject),
        getMany: async subjects => subjects.map(resource),
        newResource: async ({parent, isA, propVals}) => {
            rows.set(table + '/' + ++next, {...propVals, [core + 'parent']: parent, [core + 'isA']: isA});
        },
    };

    window.addEventListener('message', async ({data}) => {
        if (data === 'snapshot') {
            window.parent.postMessage([...rows], '*');
        } else if (Array.isArray(data)) {
            for (const [key, value] of data) rows.set(key, value);
            next = rows.size;
            const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
            const {view} = await import(url);
            URL.revokeObjectURL(url);
            await view({root: document.getElementById('root'), store});
        }
    });
}

test('Focus persists tasks in named workspaces and lists in Atomic’s sandbox', async ({ page }) => {
    const source = readFileSync('../atomic/focus-0.1.0.js', 'utf8');
    const payload = JSON.stringify(source).replace(/</g, '\\u003c');
    const document = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-demo' blob:; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'">
<div id="root"></div><script type="module" nonce="demo">(${run})(${payload})</script>`;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<iframe id="app" width="1000" height="640" sandbox="allow-scripts allow-modals"></iframe>');
    const iframe = page.locator('#app');
    const frame = page.frameLocator('#app');

    async function open(rows) {
        await iframe.evaluate((element, {document, rows}) => new Promise(resolve => {
            element.addEventListener('load', () => {
                element.contentWindow.postMessage(rows, '*');
                resolve();
            }, {once: true});
            element.srcdoc = document;
        }), {document, rows});
        await expect(frame.getByRole('heading', {name: 'Focus'})).toBeVisible();
    }

    await open([]);
    await frame.getByLabel('Task', {exact: true}).fill('Write notes');
    await frame.getByLabel('Workspace', {exact: true}).fill('Studio');
    await frame.getByLabel('List', {exact: true}).fill('Editorial');
    await frame.getByLabel('Due date', {exact: true}).fill('2026-12-01');
    await frame.getByRole('button', {name: 'Add task'}).click();
    await expect(frame.getByRole('heading', {name: 'Studio / Editorial'})).toBeVisible();
    await expect(frame.getByText('Due 2026-12-01')).toBeVisible();
    await frame.getByRole('button', {name: 'Complete task'}).click();
    await expect(frame.getByRole('status')).toHaveText('Task completed.');
    await expect(frame.getByRole('heading', {name: 'Write notes'})).toHaveCount(0);
    const rows = await iframe.evaluate(element => new Promise(resolve => {
        window.addEventListener('message', event => resolve(event.data), {once: true});
        element.contentWindow.postMessage('snapshot', '*');
    }));
    expect(rows).toHaveLength(1);
    await open(rows);
    await frame.getByRole('checkbox', {name: 'Show completed tasks'}).check();
    await expect(frame.getByRole('heading', {name: 'Write notes'})).toBeVisible();
    await frame.getByRole('button', {name: 'Reopen task'}).click();
    await expect(frame.getByRole('status')).toHaveText('Task reopened.');
    expect(errors).toEqual([]);
});
