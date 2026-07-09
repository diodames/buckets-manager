import type { RealPlayerDef } from './league';
import { seasonMarket2025 } from './seasonSignings';
import { youthAcademyProspects } from './youthAcademy';

/** Normalize player names for cross-source matching (scrape vs season signings). */
export function normalizePlayerNameKey(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[''`\-.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const NAME_FIXES: Record<string, { firstName: string; lastName: string }> = {
    'sir jabari rice': { firstName: "Sir'Jabari", lastName: 'Rice' },
    'jay shumate': { firstName: 'JT', lastName: 'Shumate' },
    'marcus armani santos silva': { firstName: 'Marcus', lastName: 'Santos-Silva' },
    'jamonda roshawn bryant': { firstName: 'Jamonda', lastName: 'Bryant' },
};

/**
 * Opening NBL rosters exclude mid-season signings and youth-only prospects.
 * Also applies canonical name fixes for scraped data.
 */
export function sanitizeOpeningRoster(teamId: string, roster: readonly RealPlayerDef[]): RealPlayerDef[] {
    const youthNames = new Set(
        youthAcademyProspects
            .filter((p) => p.teamId === teamId)
            .map((p) => normalizePlayerNameKey(p.firstName, p.lastName)),
    );
    const timedNames = new Set(
        seasonMarket2025.timedSignings.map((s) => normalizePlayerNameKey(s.firstName, s.lastName)),
    );

    return roster
        .filter((p) => !timedNames.has(normalizePlayerNameKey(p.firstName, p.lastName)))
        .filter((p) => !youthNames.has(normalizePlayerNameKey(p.firstName, p.lastName)))
        .map((p) => {
            const fix = NAME_FIXES[normalizePlayerNameKey(p.firstName, p.lastName)];
            if (!fix) {
                return { ...p };
            }
            return { ...p, firstName: fix.firstName, lastName: fix.lastName };
        });
}
