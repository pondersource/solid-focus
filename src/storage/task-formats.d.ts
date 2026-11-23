import type { SchemaTask } from './schema-tasks.js';
type Fetcher = typeof globalThis.fetch;
type Attributes = Record<string, unknown>;
interface SchemaModel {
    getAttribute(name: string): unknown;
    setAttribute(name: string, value: unknown): void;
}
/** Plain schema definitions keep the owning format independent of a UI framework. */
export declare const focusSchemas: {
    readonly task: {
        readonly rdfsClasses: string[];
        readonly rdfContexts: {
            readonly default: "https://schema.org/";
            readonly ical: "http://www.w3.org/2002/12/cal/ical#";
        };
        readonly history: true;
        readonly tombstone: false;
        readonly fields: {
            readonly name: {
                readonly type: "string";
                readonly required: true;
                readonly alias: "_summary";
            };
            readonly description: "string";
            readonly status: {
                readonly type: "key";
                readonly rdfProperty: "actionStatus";
            };
            readonly priority: {
                readonly type: "number";
                readonly rdfProperty: "ical:priority";
            };
            readonly dueDate: {
                readonly type: "date";
                readonly rdfProperty: "ical:due";
            };
            readonly completedAt: {
                readonly type: "date";
                readonly rdfProperty: "ical:completed";
            };
            readonly _summary: {
                readonly type: "string";
                readonly rdfProperty: "ical:summary";
            };
        };
        readonly hooks: {
            readonly afterInitialize: (this: SchemaModel) => void;
            readonly beforeSave: (this: SchemaModel) => void;
        };
    };
    readonly legacyTask: {
        readonly rdfsClass: "lifecycle:Task";
        readonly rdfContexts: {
            readonly lifecycle: "http://purl.org/vocab/lifecycle/schema#";
            readonly cal: "http://www.w3.org/2002/12/cal/ical#";
            readonly purl: "http://purl.org/dc/terms/";
        };
        readonly history: true;
        readonly tombstone: false;
        readonly defaultResourceHash: "";
        readonly fields: {
            readonly name: {
                readonly type: "string";
                readonly rdfProperty: "rdfs:label";
                readonly required: true;
            };
            readonly description: {
                readonly type: "string";
                readonly rdfProperty: "rdfs:comment";
            };
            readonly priority: {
                readonly type: "number";
                readonly rdfProperty: "cal:priority";
            };
            readonly dueDate: {
                readonly type: "date";
                readonly rdfProperty: "cal:due";
            };
            readonly completedAt: {
                readonly type: "date";
                readonly rdfProperty: "cal:completed";
            };
            readonly legacyCreatedAt: {
                readonly type: "date";
                readonly rdfProperty: "purl:created";
                readonly alias: "createdAt";
            };
            readonly legacyUpdatedAt: {
                readonly type: "date";
                readonly rdfProperty: "purl:modified";
                readonly alias: "updatedAt";
            };
        };
    };
    readonly list: {
        readonly fields: {
            readonly name: {
                readonly type: "string";
                readonly rdfProperty: "rdfs:label";
            };
            readonly description: {
                readonly type: "string";
                readonly rdfProperty: "rdfs:comment";
            };
            readonly resourceUrls: {
                readonly type: "array";
                readonly rdfProperty: "ldp:contains";
                readonly items: "key";
            };
            readonly createdAt: {
                readonly type: "date";
                readonly rdfProperty: "purl:created";
            };
            readonly updatedAt: {
                readonly type: "date";
                readonly rdfProperty: "purl:modified";
            };
        };
        readonly history: true;
        readonly timestamps: true;
    };
    readonly workspace: {
        readonly rdfContexts: {
            readonly tasks: "https://schema.org/";
        };
        readonly fields: {
            readonly name: {
                readonly type: "string";
                readonly rdfProperty: "rdfs:label";
            };
            readonly description: {
                readonly type: "string";
                readonly rdfProperty: "rdfs:comment";
            };
            readonly resourceUrls: {
                readonly type: "array";
                readonly rdfProperty: "ldp:contains";
                readonly items: "key";
            };
            readonly createdAt: {
                readonly type: "date";
                readonly rdfProperty: "purl:created";
            };
            readonly updatedAt: {
                readonly type: "date";
                readonly rdfProperty: "purl:modified";
            };
            readonly color: {
                readonly type: "string";
                readonly rdfProperty: "schema:color";
            };
        };
    };
};
interface FocusModel {
    url: string;
    setEngine(engine: unknown): void;
    update(attributes: Attributes): Promise<FocusModel>;
    delete(): Promise<unknown>;
    loadRelationIfUnloaded(name: string): Promise<unknown>;
}
interface FocusModelClass {
    find(uri: string): Promise<FocusModel | null>;
    create(attributes: Attributes): Promise<FocusModel>;
    getEngine(): unknown;
    setEngine(engine: unknown): void;
    withCollection<T>(collection: string, operation: () => Promise<T>): Promise<T>;
}
export interface FocusModels {
    SolidEngine: new (fetcher: Fetcher) => unknown;
    Task: FocusModelClass;
    TasksList: FocusModelClass;
    Workspace: FocusModelClass;
}
/**
 * Domain operations share the original model schemas, CRDT history and per-document URLs.
 * Engine injection avoids shipping a second copy/version of Soukai into each application.
 */
export interface FocusStorage {
    engine: unknown;
    readTask(uri: string): Promise<FocusModel | null>;
    createTask(container: string, attributes: Attributes): Promise<FocusModel>;
    updateTask(uri: string, attributes: Attributes): Promise<FocusModel>;
    deleteTask(uri: string): Promise<void>;
    readTaskHistory(uri: string): Promise<{
        metadata: unknown;
        operations: unknown;
    } | null>;
    readList(uri: string): Promise<FocusModel | null>;
    createList(container: string, attributes: Attributes): Promise<FocusModel>;
    updateList(uri: string, attributes: Attributes): Promise<FocusModel>;
    readWorkspace(uri: string): Promise<FocusModel | null>;
    createWorkspace(container: string, attributes: Attributes): Promise<FocusModel>;
    updateWorkspace(uri: string, attributes: Attributes): Promise<FocusModel>;
}
export interface NativeQuad {
    subject: {
        termType: string;
        value: string;
    };
    predicate: {
        termType: string;
        value: string;
    };
    object: {
        termType: string;
        value: string;
        language?: string;
        datatype?: {
            value: string;
        };
    };
    graph: {
        termType: string;
        value: string;
    };
}
export interface FocusDocument {
    url: string;
    body: string;
    contentType: string;
    etag: string | null;
    quads: NativeQuad[];
    tasks: SchemaTask[];
    history: NativeQuad[];
}
export declare function openFocus(fetcher: Fetcher, models: FocusModels): FocusStorage;
/** A lossless native RDF view: callers keep the original document, term kinds and boundaries. */
export declare function readFocusDocument(url: string, fetcher?: Fetcher): Promise<FocusDocument>;
export {};
