import type { EngineDocument } from 'soukai';

const FORMAT = 'https://pondersource.com/formats/solidfocus-guest-documents/v1';

export interface GuestDocumentEngine {
    getCollections(): Promise<string[]>;
    readMany(collection: string): Promise<Record<string, EngineDocument>>;
    create(collection: string, document: EngineDocument, url: string): Promise<unknown>;
}
export interface GuestBackup {
    format: typeof FORMAT;
    version: 1;
    legacySchemas: boolean;
    workspaces: string[];
    collections: { url: string; documents: { url: string; document: EngineDocument }[] }[];
}

function guestUrl(value: unknown, container = false): value is string {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);

        return (
            url.protocol === 'solid:' &&
            !url.username &&
            !url.password &&
            !url.hash &&
            !url.search &&
            (!container || url.pathname.endsWith('/'))
        );
    } catch {
        return false;
    }
}

function nativeDocument(value: unknown): value is EngineDocument {
    return (
        !!value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Array.isArray((value as EngineDocument)['@graph'])
    );
}

/** Read the same complete documents as upstream Cloud.Backup, without moving or deleting them. */
export async function exportGuestBackup(
    engine: GuestDocumentEngine,
    workspaces: string[],
    legacySchemas: boolean,
): Promise<GuestBackup> {
    const collections: GuestBackup['collections'] = [];

    for (const url of await engine.getCollections()) {
        // Authentication/settings and cached remote documents are outside guest model collections.
        if (!guestUrl(url, true)) continue;

        const documents = Object.entries(await engine.readMany(url)).map(([documentUrl, document]) => {
            if (!guestUrl(documentUrl) || !documentUrl.startsWith(url) || !nativeDocument(document)) {
                throw new Error('A guest collection contains an unsupported document');
            }

            return { url: documentUrl, document: structuredClone(document) };
        });

        if (documents.length) collections.push({ url, documents });
    }

    return parseGuestBackup(
        JSON.stringify({
            format: FORMAT,
            version: 1,
            legacySchemas,
            workspaces: workspaces.filter((url) => guestUrl(url, true)),
            collections,
        }),
    );
}

export function parseGuestBackup(text: string): GuestBackup {
    const backup = JSON.parse(text) as Partial<GuestBackup>;

    if (
        backup?.format !== FORMAT ||
        backup.version !== 1 ||
        typeof backup.legacySchemas !== 'boolean' ||
        !Array.isArray(backup.collections) ||
        !Array.isArray(backup.workspaces)
    ) {
        throw new Error('Choose a SolidFocus guest document backup');
    }

    const urls = new Set<string>();
    const collections = new Set<string>();

    for (const collection of backup.collections) {
        if (
            !collection ||
            !guestUrl(collection.url, true) ||
            collections.has(collection.url) ||
            !Array.isArray(collection.documents)
        )
            throw new Error('Invalid guest collection');

        collections.add(collection.url);
        for (const record of collection.documents) {
            if (
                !record ||
                !guestUrl(record.url) ||
                !record.url.startsWith(collection.url) ||
                urls.has(record.url) ||
                !nativeDocument(record.document)
            )
                throw new Error('Invalid guest document');

            urls.add(record.url);
        }
    }

    for (const url of backup.workspaces) {
        if (!guestUrl(url, true) || !urls.has(url)) throw new Error('A backup workspace is missing its document');
    }
    if (urls.size && !backup.workspaces.length) throw new Error('The backup does not identify its workspaces');

    return backup as GuestBackup;
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
        return (
            '{' +
            Object.keys(value)
                .sort()
                .map((key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]))
                .join(',') +
            '}'
        );
    }

    return JSON.stringify(value);
}

/** Insert new documents only. Matching partial imports can resume; changed projects are never overwritten. */
export async function importGuestBackup(engine: GuestDocumentEngine, text: string): Promise<GuestBackup> {
    const backup = parseGuestBackup(text);
    const records = new Map(
        backup.collections.flatMap((collection) =>
            collection.documents.map((record) => [
                record.url,
                { collection: collection.url, document: record.document },
            ])),
    );
    const present = new Set<string>();

    for (const collection of await engine.getCollections()) {
        for (const [url, document] of Object.entries(await engine.readMany(collection))) {
            if (!nativeDocument(document)) continue;

            const source = records.get(url);

            if (!source || source.collection !== collection || canonical(source.document) !== canonical(document)) {
                throw new Error('Import into an empty workspace; existing tasks will not be overwritten');
            }

            present.add(url);
        }
    }

    for (const [url, record] of records) {
        if (present.has(url)) continue;

        // Retain successful inserts if a later one fails. Retrying can resume
        // identical documents, while cleanup could erase a concurrent edit.
        await engine.create(record.collection, structuredClone(record.document), url);
    }

    return backup;
}
