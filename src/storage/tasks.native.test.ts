import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { InMemoryEngine, bootModels, setEngine } from 'soukai';
import { SolidEngine, bootSolidModels, defineSolidContainerSchema } from 'soukai-solid';

import type TaskModel from '@/models/Task';
import type { FocusDocument, FocusModels, FocusStorage, focusSchemas as schemaDefinitions } from './task-formats';

type Api = {
    root: string;
    initialize(): Promise<void>;
    fetch: typeof fetch;
    openFocus(models: FocusModels): FocusStorage;
    readFocusDocument(url: string): Promise<FocusDocument>;
};
type Namespace = { Tasks: { builder(client: object): { exports: Api } }; focusSchemas: typeof schemaDefinitions };
let namespace: Namespace;
let models: FocusModels;
let Task: typeof TaskModel;

beforeAll(async () => {
    // Exercise the same distributable consumed by the app, including the owning Tasks builder.
    runInThisContext(readFileSync(new URL('../assets/public/storage/domains.js', import.meta.url), 'utf8'));
    namespace = (globalThis as typeof globalThis & { PonderSourceDomains: Namespace }).PonderSourceDomains;
    Task = (await import('@/models/Task')).default;

    const TasksList = defineSolidContainerSchema(namespace.focusSchemas.list);
    const Workspace = defineSolidContainerSchema(TasksList, namespace.focusSchemas.workspace);

    bootSolidModels();
    bootModels({ Task, TasksList, Workspace });
    setEngine(new InMemoryEngine());
    models = { Task, TasksList, Workspace, SolidEngine } as unknown as FocusModels;
});

async function open(data = new Map()): Promise<Api> {
    const client = {
        declareType() {
            /* Test client records are validated by the owning module. */
        },
        async getObject(path: string) {
            return structuredClone(data.get(path));
        },
        async storeObject(_type: string, path: string, value: unknown) {
            data.set(path, structuredClone(value));
        },
        async remove(path: string) {
            data.delete(path);
        },
        async getListing() {
            return {};
        },
    };
    const api = namespace.Tasks.builder(client).exports;

    await api.initialize();

    return api;
}

describe('Native SolidFocus formats through the remoteStorage Tasks module', () => {

    it('creates and edits native task/list/workspace documents and reloads with complete history', async () => {
        const data = new Map();
        const api = await open(data);
        const focus = api.openFocus(models);
        const workspaceAttributes = { url: `${api.root}tasks/`, name: 'Work', color: '#00f' };
        const workspace = await focus.createWorkspace(api.root, workspaceAttributes);
        const list = await focus.createList(workspace.url, { url: `${workspace.url}inbox/`, name: 'Inbox' });
        const task = await focus.createTask(list.url, { url: `${list.url}original#it`, name: 'Native task' });
        const original = await api.readFocusDocument(task.url);
        const unrelated = `${list.url}separate`;
        const extra =
            '\n<#it> <https://unknown.test/name> "hola"@es; <https://unknown.test/link> ' +
            '[ <https://unknown.test/lexical> "0007"^^<http://www.w3.org/2001/XMLSchema#integer> ].\n' +
            '<https://other.test/document#subject> <https://unknown.test/value> "retained".\n';

        expect(
            (
                await api.fetch(original.url, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'text/turtle' },
                    body: original.body + extra,
                })
            ).ok,
        ).toBe(true);
        expect(
            (
                await api.fetch(unrelated, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'text/turtle' },
                    body: '<#it> <https://schema.org/name> "Separate document".',
                })
            ).ok,
        ).toBe(true);

        const separateBefore = await (await api.fetch(unrelated)).text();
        const createdAt = original.history.find((q) => q.predicate.value.endsWith('/createdAt'))?.object.value;

        await focus.updateTask(task.url, {
            name: 'Edited task',
            priority: 1,
            completedAt: new Date('2026-11-23T10:00:00Z'),
        });

        const fresh = await open(data);
        const document = await fresh.readFocusDocument(task.url);
        const reloaded = (await fresh.openFocus(models).readTask(task.url)) as unknown as InstanceType<typeof Task>;

        expect(reloaded.name).toBe('Edited task');
        expect(reloaded.completed).toBe(true);
        expect(document.url).toBe(original.url);
        expect(document.tasks.find((t) => t.uri === task.url)?.actionStatus).toBe(
            'https://schema.org/CompletedActionStatus',
        );
        expect(document.quads.some((q) => q.object.language === 'es' && q.object.value === 'hola')).toBe(true);
        expect(
            document.quads.some(
                (q) =>
                    q.subject.termType === 'BlankNode' &&
                    q.object.value === '0007' &&
                    q.object.datatype?.value.endsWith('#integer'),
            ),
        ).toBe(true);
        expect(document.quads.some((q) => q.subject.value === 'https://other.test/document#subject')).toBe(true);
        expect(document.history.some((q) => q.object.value.endsWith('/SetPropertyOperation'))).toBe(true);
        expect(document.history.find((q) => q.predicate.value.endsWith('/createdAt'))?.object.value).toBe(createdAt);
        expect(await (await fresh.fetch(unrelated)).text()).toBe(separateBefore);
        expect(((await fresh.openFocus(models).readWorkspace(workspace.url)) as unknown as { name: string }).name).toBe(
            'Work',
        );
        expect(((await fresh.openFocus(models).readList(list.url)) as unknown as { name: string }).name).toBe('Inbox');
    });

    it('restores shared model configuration after a failed native operation', async () => {
        const api = await open();
        const originalEngine = Task.getEngine();
        const originalCollection = Task.collection;

        await expect(
            api.openFocus(models).updateTask(`${api.root}missing/original#it`, { name: 'Never saved' }),
        ).rejects.toThrow('not found');
        expect(Task.getEngine()).toBe(originalEngine);
        expect(Task.collection).toBe(originalCollection);
    });

});
