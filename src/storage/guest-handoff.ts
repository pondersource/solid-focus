import { Events } from '@aerogel/core';
import { Cloud } from '@aerogel/plugin-local-first';
import { ignoreModelsCollection, trackModelsCollection } from '@aerogel/plugin-soukai';
import { requireEngine } from 'soukai';
import type { IndexedDBEngine } from 'soukai';

import Task from '@/models/Task';
import TaskSchema from '@/models/Task.schema';
import LegacyTaskSchema from '@/models/legacy/LegacyTask.schema';
import Workspace from '@/models/Workspace';
import Workspaces from '@/services/Workspaces';
import { exportGuestBackup, importGuestBackup, parseGuestBackup } from './guest-backup';

let lastExport: string | undefined;

async function snapshot(): Promise<string> {
    await Workspaces.booted;

    return JSON.stringify(
        await exportGuestBackup(
            requireEngine<IndexedDBEngine>(),
            Workspaces.all.map((workspace) => workspace.url),
            Workspaces.usingLegacySchemas === true,
        ),
    );
}

/** Complete local documents stay separate from wallet authentication and replication. */
export const guestData = {
    accept: 'application/json,.json',
    async export(): Promise<{ filename: string; type: string; body: string }> {
        const body = await snapshot();

        lastExport = body;

        return { filename: 'solidfocus-guest-projects.json', type: 'application/json', body };
    },
    async beforeConnect(): Promise<void> {
        const current = await snapshot();

        if (parseGuestBackup(current).collections.length && current !== lastExport) {
            throw new Error('Export your guest projects before connecting Nextgraph. Export again if you edit them.');
        }
    },
    async import(file: File): Promise<{ message: string }> {
        await Workspaces.booted;
        if (file.size > 100 * 1024 * 1024) throw new Error('Guest project files must be smaller than 100 MiB.');
        if (Cloud.syncing || Cloud.setupOngoing) {
            throw new Error('Wait for synchronization to finish before importing.');
        }

        const ready = Cloud.ready;
        let writeStarted = false;
        const engine = requireEngine<IndexedDBEngine>();

        Cloud.ready = false;
        try {
            const backup = await importGuestBackup(
                {
                    getCollections: () => engine.getCollections(),
                    readMany: (collection) => engine.readMany(collection),
                    create: (collection, document, url) => {
                        writeStarted = true;

                        return engine.create(collection, document, url);
                    },
                },
                await file.text(),
            );

            Workspaces.usingLegacySchemas = backup.legacySchemas;
            if (backup.legacySchemas) {
                Cloud.registerSchemaMigration(Task, TaskSchema);
                await Task.updateSchema(LegacyTaskSchema);
            }

            const roots = backup.collections
                .filter((collection) => collection.documents.some((record) => backup.workspaces.includes(record.url)))
                .map((collection) => collection.url);

            Cloud.modelCollections[Workspace.modelName] = roots;
            for (const root of roots) {
                ignoreModelsCollection(Workspace, root);
                await trackModelsCollection(Workspace, root);
            }

            await Events.emit('cloud:backup-completed');
            Cloud.setupDismissed = false;
            await Workspaces.open();

            return { message: 'Imported projects locally. Choose Back up now to sync them; keep your export file.' };
        } catch (error) {
            if (!writeStarted) Cloud.ready = ready;
            throw error;
        }
    },
};
