import type { RealPlayerDef } from './league';
import { preferredLineupForTeam } from './openingLineups';
import { balanceRosterPositions } from './rosterPositionBalance';
import { tierFromOverall } from '../core/league/playerRating';
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
    // Scrape puts the suffix in lastName, which shortPlayerName shows as "W. Jr".
    'wesley lavon person jr': { firstName: 'Wesley', lastName: 'Person' },
    'clevon brown jr': { firstName: 'Clevon', lastName: 'Brown' },
    'terry henderson jr': { firstName: 'Terry', lastName: 'Henderson' },
    'terry henderson jr.': { firstName: 'Terry', lastName: 'Henderson' },
    'jacob nicholas evans iii': { firstName: 'Jacob', lastName: 'Evans' },
    'keyshaun darrius langley': { firstName: 'Keyshaun', lastName: 'Langley' },
    'keyshawn maklik feazell': { firstName: 'KeyShawn', lastName: 'Feazell' },
};

interface RatingOverride {
    teamId: string;
    /** Match against normalized "first last" after NAME_FIXES. */
    nameKey: string;
    targetOverall: number;
    /** Optional position fix that survives roster scrapes. */
    position?: RealPlayerDef['position'];
}

/** Hand-tuned targetOverall values that survive roster scrapes. */
const RATING_OVERRIDES: readonly RatingOverride[] = [
    { teamId: 'DEC', nameKey: 'tadeas slowiak', targetOverall: 62 },
    { teamId: 'OST', nameKey: 'michal svoboda', targetOverall: 64 },
    { teamId: 'OLO', nameKey: 'lamb autrey', targetOverall: 66 },
    { teamId: 'OLO', nameKey: 'kyler filewich', targetOverall: 67, position: 'C' },
    { teamId: 'USK', nameKey: 'terry henderson', targetOverall: 63 },
    { teamId: 'USK', nameKey: 'jakub soldan', targetOverall: 51, position: 'C' },
    { teamId: 'USK', nameKey: 'frantisek fuxa', targetOverall: 55 },
    { teamId: 'OPA', nameKey: 'isaiah john gray', targetOverall: 69 },
    { teamId: 'OPA', nameKey: 'jakub sirina', targetOverall: 67 },
    { teamId: 'OPA', nameKey: 'krystof kavan', targetOverall: 62 },
    { teamId: 'OPA', nameKey: 'jan svandrlik', targetOverall: 65 },
    // Nymburk retargeted to ~64 team average (post-NAME_FIXES keys).
    { teamId: 'NYM', nameKey: 'ondrej sehnal', targetOverall: 70 },
    { teamId: 'NYM', nameKey: 'jaromir bohacik', targetOverall: 67 },
    { teamId: 'NYM', nameKey: 'keyshawn feazell', targetOverall: 67 },
    { teamId: 'NYM', nameKey: 'tony perkins', targetOverall: 66 },
    { teamId: 'NYM', nameKey: 'jt shumate', targetOverall: 65 },
    { teamId: 'NYM', nameKey: 'wesley dreamer', targetOverall: 63 },
    { teamId: 'NYM', nameKey: 'matej svoboda', targetOverall: 63 },
    { teamId: 'NYM', nameKey: 'martin kriz', targetOverall: 60 },
    { teamId: 'NYM', nameKey: 'frantisek rylich', targetOverall: 58 },
    { teamId: 'NYM', nameKey: 'goran filipovic', targetOverall: 63 },
    { teamId: 'BRN', nameKey: 'keyshaun langley', targetOverall: 58 },
];

/**
 * Early-season leavers who must not appear on the playoff-era opening snapshot.
 * Keys are normalized full names (after diacritic/apostrophe stripping).
 */
const PLAYOFF_REMOVES: Record<string, readonly string[]> = {
    // Apostrophes are stripped by normalizePlayerNameKey (Sir'Jabari → sirjabari).
    BRN: ['ross anthony williams', 'ross williams', 'jacob austin groves', 'jacob groves'],
    NYM: ['sirjabari rice', 'jhamir brickus'],
};

/**
 * Real players forced onto playoff-era opening rosters when the scrape is short
 * or mid-season arrivals were historically stripped.
 */
const ROSTER_SUPPLEMENTS: Record<string, readonly RealPlayerDef[]> = {
    NYM: [
        {
            firstName: 'Vojtěch',
            lastName: 'Hruban',
            position: 'SF',
            tier: 4,
            heightCm: 200,
            born: 1989,
            nationality: 'CZE',
            targetOverall: 63,
            mpg: 16.8,
        },
        {
            firstName: 'Jaquan',
            lastName: 'Lawrence',
            position: 'SF',
            tier: 4,
            heightCm: null,
            born: 1999,
            nationality: 'USA',
            targetOverall: 61,
            mpg: 15.6,
        },
        {
            firstName: 'Marcus',
            lastName: 'Santos-Silva',
            position: 'C',
            tier: 4,
            heightCm: null,
            born: 1997,
            nationality: 'USA',
            targetOverall: 62,
            mpg: 15.4,
        },
        {
            firstName: 'Tony',
            lastName: 'Perkins',
            position: 'SG',
            tier: 4,
            heightCm: 193,
            born: 2001,
            nationality: 'USA',
            targetOverall: 66,
            mpg: 17.6,
        },
    ],
    BRN: [
        {
            firstName: 'Keyshaun',
            lastName: 'Langley',
            position: 'PG',
            tier: 3,
            heightCm: null,
            born: 2000,
            nationality: 'USA',
            targetOverall: 58,
            mpg: 24,
        },
    ],
    HKR: [
        {
            firstName: 'Vojtěch',
            lastName: 'Synáček',
            position: 'SG',
            tier: 2,
            heightCm: 190,
            born: 2003,
            nationality: 'CZE',
            targetOverall: 55,
            mpg: 24.5,
        },
    ],
    OLO: [
        {
            firstName: 'Kevin',
            lastName: 'Mervart',
            position: 'C',
            tier: 3,
            heightCm: 206,
            born: 2002,
            nationality: 'CAN',
            targetOverall: 58,
            mpg: null,
        },
    ],
};

function applyNameFix(player: RealPlayerDef): RealPlayerDef {
    const fix = NAME_FIXES[normalizePlayerNameKey(player.firstName, player.lastName)];
    if (!fix) {
        return { ...player };
    }
    return { ...player, firstName: fix.firstName, lastName: fix.lastName };
}

function applyRatingOverride(teamId: string, player: RealPlayerDef): RealPlayerDef {
    const key = normalizePlayerNameKey(player.firstName, player.lastName);
    const override = RATING_OVERRIDES.find((row) => row.teamId === teamId && row.nameKey === key);
    if (!override) {
        return player;
    }
    return {
        ...player,
        targetOverall: override.targetOverall,
        tier: tierFromOverall(override.targetOverall),
        ...(override.position ? { position: override.position } : {}),
    };
}

function isPlayoffRemoved(teamId: string, player: RealPlayerDef): boolean {
    const removes = PLAYOFF_REMOVES[teamId];
    if (!removes || removes.length === 0) {
        return false;
    }
    const key = normalizePlayerNameKey(player.firstName, player.lastName);
    return removes.includes(key);
}

function mergeSupplements(teamId: string, roster: RealPlayerDef[]): RealPlayerDef[] {
    const extras = ROSTER_SUPPLEMENTS[teamId];
    if (!extras || extras.length === 0) {
        return roster;
    }
    const present = new Set(roster.map((p) => normalizePlayerNameKey(p.firstName, p.lastName)));
    // Also treat last-name-only presence for supplements (e.g. Langley already scraped).
    const presentLast = new Set(roster.map((p) => normalizePlayerNameKey('', p.lastName).trim()));
    const out = [...roster];
    for (const extra of extras) {
        const key = normalizePlayerNameKey(extra.firstName, extra.lastName);
        const last = normalizePlayerNameKey('', extra.lastName).trim();
        if (present.has(key) || presentLast.has(last)) {
            continue;
        }
        out.push(applyRatingOverride(teamId, applyNameFix(extra)));
        present.add(key);
        presentLast.add(last);
    }
    return out;
}

const OPENING_ROSTER_CAP = 12;

function protectedLastNames(teamId: string): Set<string> {
    const protectedNames = new Set<string>();
    const lineup = preferredLineupForTeam(teamId);
    if (lineup) {
        for (const slot of Object.values(lineup)) {
            protectedNames.add(normalizePlayerNameKey('', slot.lastName).trim());
        }
    }
    for (const extra of ROSTER_SUPPLEMENTS[teamId] ?? []) {
        protectedNames.add(normalizePlayerNameKey('', extra.lastName).trim());
    }
    return protectedNames;
}

/** Prefer high-minute players when trimming, but never drop lineup/supplement anchors. */
function trimToOpeningCap(teamId: string, roster: RealPlayerDef[]): RealPlayerDef[] {
    if (roster.length <= OPENING_ROSTER_CAP) {
        return roster;
    }
    const keep = protectedLastNames(teamId);
    const anchors = roster.filter((p) => keep.has(normalizePlayerNameKey('', p.lastName).trim()));
    const rest = roster
        .filter((p) => !keep.has(normalizePlayerNameKey('', p.lastName).trim()))
        .sort((a, b) => {
            const mpgA = a.mpg ?? 0;
            const mpgB = b.mpg ?? 0;
            if (mpgB !== mpgA) {
                return mpgB - mpgA;
            }
            return (b.targetOverall ?? 0) - (a.targetOverall ?? 0);
        });
    const room = Math.max(0, OPENING_ROSTER_CAP - anchors.length);
    return [...anchors, ...rest.slice(0, room)];
}

/**
 * Opening NBL rosters are a playoff-era snapshot: youth-only prospects excluded,
 * early-season leavers removed, name/rating overrides applied, late arrivals
 * supplemented when missing from the scrape, then positions rebalanced so each
 * club has depth at every slot.
 */
export function sanitizeOpeningRoster(teamId: string, roster: readonly RealPlayerDef[]): RealPlayerDef[] {
    const youthNames = new Set(
        youthAcademyProspects
            .filter((p) => p.teamId === teamId)
            .map((p) => normalizePlayerNameKey(p.firstName, p.lastName)),
    );
    // Kept for forward-compat if timed signings return; playoff snapshot empties 2025 list.
    const timedNames = new Set(
        seasonMarket2025.timedSignings.map((s) => normalizePlayerNameKey(s.firstName, s.lastName)),
    );

    const cleaned = roster
        .filter((p) => !timedNames.has(normalizePlayerNameKey(p.firstName, p.lastName)))
        .filter((p) => !youthNames.has(normalizePlayerNameKey(p.firstName, p.lastName)))
        .map((p) => applyNameFix(p))
        .filter((p) => !isPlayoffRemoved(teamId, p))
        .map((p) => applyRatingOverride(teamId, p));

    return balanceRosterPositions(trimToOpeningCap(teamId, mergeSupplements(teamId, cleaned)));
}
