const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const directory = mkdtempSync(join(tmpdir(), 'solidfocus-native-pod-'));
const seed = join(directory, 'accounts.json');
const config = join(directory, 'config.json');
const port = process.env.SOLIDFOCUS_POD_PORT || '4013';
writeFileSync(seed, JSON.stringify([{ email: 'alice@example.com', password: 'storage-test-password', pods: [{ name: 'alice', settings: { linkStorage: true } }] }]), { mode: 0o600 });
// Use CSS's supported atomic-body accessor; the default direct writer can truncate
// existing documents when navigation interrupts a PUT before its body arrives.
writeFileSync(config, JSON.stringify({
    '@context': 'https://linkedsoftwaredependencies.org/bundles/npm/@solid/community-server/^7.0.0/components/context.jsonld',
    import: ['css:config/file.json'],
    '@graph': [{ '@id': 'urn:solidfocus:test:atomic-files', '@type': 'Override',
        overrideInstance: { '@id': 'urn:solid-server:default:FileDataAccessor' },
        overrideParameters: { '@type': 'AtomicFileDataAccessor', resourceMapper: { '@id': 'urn:solid-server:default:FileIdentifierMapper' },
            rootFilePath: { '@id': 'urn:solid-server:default:variable:rootFilePath' }, tempFilePath: '/.internal/tempFiles/' } }],
}));
const server = spawn(process.execPath, [require.resolve('@solid/community-server/bin/server.js'), '--port', port,
    '--baseUrl', `http://localhost:${port}/`, '--rootFilePath', join(directory, 'data'), '--config', config,
    '--loggingLevel', 'error', '--seedConfig', seed], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', code => { rmSync(directory, { recursive: true, force: true }); process.exit(code || 0); });
