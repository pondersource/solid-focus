const { defineConfig } = require('@playwright/test');
const path = require('node:path');
const cssRoot = path.join(process.env.RUNNER_TEMP || require('node:os').tmpdir(), 'focus-css');
module.exports = defineConfig({
    testDir: '.', timeout: 120_000, workers: 1,
    expect: { timeout: 15_000 },
    use: { baseURL: 'http://localhost:5001', trace: 'retain-on-failure' },
    webServer: [
        { command: 'pnpm exec vite preview --host 127.0.0.1 --port 5001 --strictPort', cwd: '..', url: 'http://localhost:5001' },
        { command: './node_modules/.bin/community-solid-server -p 4000 -l warn', cwd: cssRoot, url: 'http://localhost:4000' },
    ],
});
