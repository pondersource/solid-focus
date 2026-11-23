import { describe, expect, it } from 'vitest';
import type { EngineDocument } from 'soukai';

import { exportGuestBackup, importGuestBackup, parseGuestBackup } from './guest-backup';

function fixture() {
    const collections = new Map<string, Record<string, EngineDocument>>();
    const engine = {
        async getCollections() {
            return [...collections.keys()];
        },
        async readMany(collection: string) {
            return structuredClone(collections.get(collection) ?? {});
        },
        async create(collection: string, document: EngineDocument, url: string) {
            const records = collections.get(collection) ?? {};

            if (records[url]) throw new Error('Existing document');
            records[url] = structuredClone(document);
            collections.set(collection, records);
        },
    };

    return { engine, collections };
}

async function sample() {
    const source = fixture();
    const root = 'solid://focus/workspaces/';
    const workspace = root + 'work/';
    const document: EngineDocument = {
        '@graph': [
            {
                '@id': workspace,
                'https://example.test/unknown': {
                    '@value': '0007',
                    '@type': 'http://www.w3.org/2001/XMLSchema#integer',
                },
                'https://example.test/nested': { '@id': '_:retained' },
            },
            { '@id': '_:retained', 'label': 'unrecognized' },
        ],
    };

    await source.engine.create(root, document, workspace);
    const history = { '@graph': [{ '@id': workspace + 'history', 'operations': [1, 2, 3] }] };

    await source.engine.create(workspace, history, workspace + 'history');
    source.collections.set('https://remote.example/tasks/', { 'https://remote.example/tasks/a': document });

    return { source, workspace, backup: await exportGuestBackup(source.engine, [workspace], false) };
}

describe('Complete guest document transfer', () => {

    it('preserves complete JSON-LD, original identifiers and history without exporting remote cache', async () => {
        const { source, workspace, backup } = await sample();
        const target = fixture();
        const before = structuredClone([...source.collections]);

        expect(backup.collections).toHaveLength(2);
        await importGuestBackup(target.engine, JSON.stringify(backup));
        expect(await exportGuestBackup(target.engine, [workspace], false)).toEqual(backup);
        expect([...source.collections]).toEqual(before);
        await importGuestBackup(target.engine, JSON.stringify(backup));
        expect(await exportGuestBackup(target.engine, [workspace], false)).toEqual(backup);
    });

    it('refuses changed or unrelated documents and invalid archives before inserting', async () => {
        const { backup } = await sample();
        const target = fixture();

        const other = { '@graph': [{ '@id': 'solid://other/a', 'title': 'keep me' }] };

        await target.engine.create('solid://other/', other, 'solid://other/a');
        const before = structuredClone([...target.collections]);

        await expect(importGuestBackup(target.engine, JSON.stringify(backup))).rejects.toThrow('empty workspace');
        expect([...target.collections]).toEqual(before);
        const duplicate = { ...backup, collections: [...backup.collections, backup.collections[0]] };

        expect(() => parseGuestBackup(JSON.stringify(duplicate))).toThrow('Invalid guest collection');
        expect(() => parseGuestBackup(JSON.stringify({ ...backup, workspaces: ['https://foreign.example/'] }))).toThrow(
            'missing its document',
        );
    });

    it('retains a partial import and resumes it without deleting concurrent edits', async () => {
        const { backup, workspace } = await sample();
        const target = fixture();
        let writes = 0;

        await expect(
            importGuestBackup(
                {
                    ...target.engine,
                    async create(...args) {
                        if (++writes === 2) throw new Error('Local storage failed');

                        return target.engine.create(...args);
                    },
                },
                JSON.stringify(backup),
            ),
        ).rejects.toThrow('Local storage failed');
        expect([...target.collections.values()].flatMap(Object.keys)).toHaveLength(1);
        await importGuestBackup(target.engine, JSON.stringify(backup));
        expect(await exportGuestBackup(target.engine, [workspace], false)).toEqual(backup);
        const root = backup.collections[0]?.url ?? '';
        const records = target.collections.get(root) ?? {};
        const edited = { '@graph': [{ title: 'edited after import' }] };

        expect(records[workspace]).toBeDefined();
        records[workspace] = edited;
        await expect(importGuestBackup(target.engine, JSON.stringify(backup))).rejects.toThrow('empty workspace');
        expect(target.collections.get(root)?.[workspace]).toEqual(edited);
    });

});
