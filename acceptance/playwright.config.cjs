const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: '.',
    testMatch: '*.spec.cjs',
    workers: 1,
    retries: 0,
    timeout: 90_000,
    use: { baseURL: process.env.ACCEPTANCE_URL || 'http://localhost:5013/solid-focus/',
        launchOptions: { executablePath: process.env.CHROMIUM_PATH }, trace: 'retain-on-failure' },
    webServer: [
        ...(!process.env.ACCEPTANCE_URL ? [{ command: 'pnpm dev --host 127.0.0.1 --port 5013 --strictPort', cwd: '..',
            url: 'http://localhost:5013/solid-focus/', reuseExistingServer: !process.env.CI }] : []),
        { command: 'node pod-server.cjs', url: 'http://localhost:4013', reuseExistingServer: false },
    ],
});
