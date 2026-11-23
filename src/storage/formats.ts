import type { focusSchemas as schemaDefinitions } from './task-formats';

/** The format definitions belong to the remoteStorage Tasks data module. */
export const focusSchemas = (
    globalThis as typeof globalThis & {
        PonderSourceDomains: { focusSchemas: typeof schemaDefinitions };
    }
).PonderSourceDomains.focusSchemas;
