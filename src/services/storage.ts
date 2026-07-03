// Thin storage abstraction so game code never touches localStorage directly
// and tests can run against an in-memory double.
export interface StorageAdapter {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    list(prefix: string): string[];
}

export class LocalStorageAdapter implements StorageAdapter {
    get(key: string): string | null {
        return window.localStorage.getItem(key);
    }

    set(key: string, value: string): void {
        window.localStorage.setItem(key, value);
    }

    remove(key: string): void {
        window.localStorage.removeItem(key);
    }

    list(prefix: string): string[] {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key?.startsWith(prefix)) {
                keys.push(key);
            }
        }
        return keys;
    }
}

export class MemoryStorageAdapter implements StorageAdapter {
    private readonly data = new Map<string, string>();

    get(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    set(key: string, value: string): void {
        this.data.set(key, value);
    }

    remove(key: string): void {
        this.data.delete(key);
    }

    list(prefix: string): string[] {
        return [...this.data.keys()].filter((k) => k.startsWith(prefix));
    }
}

export const SAVE_SLOT_KEYS = ['bbm.save.1', 'bbm.save.2', 'bbm.save.3'] as const;
export const AUTOSAVE_KEY = 'bbm.autosave';
export const SETTINGS_KEY = 'bbm.settings';
