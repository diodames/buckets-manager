import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Belt-and-suspenders enforcement of the architecture boundary (Biome checks
// it too): pure game logic must never import the engine or touch the DOM.
const PURE_DIRS = ['src/core', 'src/i18n', 'src/config'];

function tsFilesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => join(entry.parentPath, entry.name));
}

describe('architecture boundary', () => {
    it('pure modules do not import blit386 or browser globals', () => {
        for (const dir of PURE_DIRS) {
            for (const file of tsFilesUnder(dir)) {
                const source = readFileSync(file, 'utf8');
                expect(source.includes("from 'blit386'"), `${file} imports blit386`).toBe(false);
                // Match API usage (window.x, document.x, localStorage.x), not
                // the plain English word "window" in UI strings.
                expect(/\b(window|document|localStorage)\s*[.[(]/.test(source), `${file} touches browser globals`).toBe(
                    false,
                );
            }
        }
    });

    it('core does not read wall-clock time or ambient randomness', () => {
        for (const file of tsFilesUnder('src/core')) {
            const source = readFileSync(file, 'utf8');
            expect(source.includes('Math.random'), `${file} uses Math.random`).toBe(false);
            expect(source.includes('Date.now'), `${file} uses Date.now`).toBe(false);
            expect(source.includes('new Date('), `${file} constructs Date`).toBe(false);
        }
    });
});
