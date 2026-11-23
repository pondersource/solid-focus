import { Authenticator, Solid } from '@aerogel/plugin-solid';
import { SolidEngine } from 'soukai-solid';
import { fetchLoginUserProfile } from '@noeldemartin/solid-utils';
import type { AuthSession } from '@aerogel/plugin-solid';
import type { SolidUserProfile } from '@noeldemartin/solid-utils';

import Task from '@/models/Task';
import TasksList from '@/models/TasksList';
import Workspace from '@/models/Workspace';
import type { FocusModels, FocusStorage } from './task-formats';
import { guestData } from './guest-handoff';

type TasksApi = {
    nativeSolidDocuments?: boolean;
    root: string;
    webId: string;
    fetch: typeof fetch;
    openFocus(models: FocusModels): FocusStorage;
};
type Connection = {
    api: TasksApi;
    ready: Promise<void>;
    restore(): Promise<SolidUserProfile | null>;
    onUser(listener: (user: SolidUserProfile | null) => void): () => void;
    fetch: typeof fetch;
    open(): void;
    disconnect(): void;
    rs: {
        connected: boolean;
        backend: string;
        setBackend(name: string): void;
        solid: { setAuthURL(url: string): void; connect(): Promise<void> };
    };
};
const runtime = globalThis as typeof globalThis & {
    RemoteStorage: unknown;
    Widget: unknown;
    PonderSourceDomains: {
        Tasks: unknown;
        connectApp(module: unknown, options: object): Connection;
    };
    ponderStorage: Connection;
};

export const storage = runtime.PonderSourceDomains.connectApp(runtime.PonderSourceDomains.Tasks, {
    RemoteStorage: runtime.RemoteStorage,
    Widget: runtime.Widget,
    nativeSolid: true,
    widgetOptions: { guestData, skipInitial: false, leaveOpen: false },
    apiKeys: {
        googledrive: '682507954614-erhifm4fj4dt7ft6duto0smcp54fmi6i.apps.googleusercontent.com',
        dropbox: 'gaezgoax9khjilj',
        onedrive: '580dcb92-f05e-4ec9-ac33-48f005b8bd01',
    },
});
runtime.ponderStorage = storage;

// The upstream task/sidebar panels are fixed to the viewport. Keep their lower
// edge above the widget's real layout area as its state and size change.
const storageHost = document.getElementById('storage-widget');

if (storageHost) {
    new ResizeObserver(() => {
        document.documentElement.style.setProperty('--storage-control-height', `${storageHost.offsetHeight}px`);
    }).observe(storageHost);
}

/** Open after the originating click has passed the widget's outside-click listener. */
export function openStorage(): void {
    setTimeout(() => storage.open(), 0);
}

export class RemoteStorageAuthenticator extends Authenticator {

    private pending?: (session: AuthSession) => void;
    private context?: TasksApi;

    public async login(loginUrl: string): Promise<AuthSession> {
        const user = await storage.restore();

        if (user) return this.activate(user);

        // Existing Solid deep links/account dialogs still use the backend's native
        // rs.js connection flow. The main connect action opens the full widget.
        const pending = new Promise<AuthSession>((resolve) => (this.pending = resolve));

        storage.rs.setBackend('solid');
        storage.rs.solid.setAuthURL(loginUrl);

        try {
            await storage.rs.solid.connect();
        } catch (error) {
            this.pending = undefined;
            throw error;
        }

        return pending;
    }

    public async logout(): Promise<void> {
        storage.disconnect();
        this._engine = undefined;
        this.context = undefined;

        await this.endSession();
    }

    public async connected(user: SolidUserProfile): Promise<boolean> {
        if (!this.pending) return false;

        const resolve = this.pending;

        this.pending = undefined;
        resolve(await this.activate(user));

        return true;
    }

    protected async restoreSession(): Promise<void> {
        const user = await storage.restore();

        if (user) await this.activate(user);
    }

    private async activate(user: SolidUserProfile): Promise<AuthSession> {
        const api = storage.api;

        if (api.webId !== user.webId) throw new Error('The storage connection changed while opening the workspace');
        if (this.context === api && Solid.session?.authenticator === this) return Solid.session;

        this._engine = api.openFocus({ Task, TasksList, Workspace, SolidEngine } as unknown as FocusModels)
            .engine as SolidEngine;

        await this.initAuthenticatedFetch(storage.fetch);

        if (api.nativeSolidDocuments) {
            // Preserve the Pod's existing type-index/profile pointers. The connector's
            // minimal identity must not make Soukai create a replacement type index.
            const profile = await fetchLoginUserProfile(user.webId, { fetch: storage.fetch, required: true });

            user = { ...user, ...profile, storageUrls: [api.root], writableProfileUrl: user.writableProfileUrl };
            Solid.setState({ profiles: { ...Solid.profiles, [user.webId]: user } });
        }

        this.context = api;

        return this.startSession({ user, loginUrl: user.webId });
    }

}

export const authenticator = new RemoteStorageAuthenticator();
let changingAccount = Promise.resolve();

storage.onUser((user) => {
    changingAccount = changingAccount
        .then(async () => {
            await Solid.booted;

            if (!user) {
                if (Solid.isLoggedIn()) await Solid.logout(true);

                return;
            }

            if (await authenticator.connected(user)) return;
            if (Solid.isLoggedIn() && Solid.user.webId === user.webId) return;

            Solid.setState({ profiles: { ...Solid.profiles, [user.webId]: user } });

            await Solid.login(user.webId, { authenticator: 'remotestorage', loading: false });
        })
        .catch((error: unknown) => {
            const alert = document.createElement('p');

            alert.setAttribute('role', 'alert');
            const message = error instanceof Error ? error.message : String(error);

            alert.textContent = `Storage could not be opened: ${message}`;
            document.getElementById('storage-widget')?.append(alert);
        });
});

declare module '@aerogel/plugin-solid' {
    interface Authenticators {
        remotestorage: RemoteStorageAuthenticator;
    }
}

/** Restore the widget identity before Cloud chooses its collections or mounts the UI. */
export async function restoreStorageConnection(): Promise<void> {
    const user = await storage.restore();

    await changingAccount;
    if (!user || Solid.isLoggedIn()) return;

    Solid.setState({ profiles: { ...Solid.profiles, [user.webId]: user } });
    await Solid.login(user.webId, { authenticator: 'remotestorage', loading: false });
}
