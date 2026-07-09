/**
 * Fetches real 2025-26 NBL rosters from nbl.basketball (scoutbasketball fallback)
 * and writes src/data/nblRosters.data.ts.
 * Run: npm run rosters:scrape:nbl
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leagueConfig } from '../src/config/league.ts';
import type { RealPlayerDef } from '../src/config/league.ts';
import { manualNblRosters } from '../src/data/nblRosters.manual.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src', 'data', 'nblRosters.data.ts');

const SEASON_YEAR = '2025';
const SCOUT_SEASON = '2025-2026';
const PLAYERS_PER_TEAM = 12;
const MIN_ROSTER_PLAYERS = 8;

type Position = RealPlayerDef['position'];

interface ScrapedPlayer {
    firstName: string;
    lastName: string;
    position: Position;
    heightCm: number | null;
    born: number | null;
    nationality: string | null;
    gamesPlayed: number;
}

const FLAG_NAT: Record<string, string> = {
    CZ: 'CZE',
    US: 'USA',
    DE: 'GER',
    ES: 'ESP',
    FR: 'FRA',
    IT: 'ITA',
    GR: 'GRE',
    TR: 'TUR',
    LT: 'LTU',
    LV: 'LVA',
    EE: 'EST',
    PL: 'POL',
    HR: 'CRO',
    RS: 'SRB',
    IL: 'ISR',
    PT: 'POR',
    BE: 'BEL',
    NL: 'NLD',
    DK: 'DEN',
    HU: 'HUN',
    BG: 'BGR',
    RO: 'ROU',
    GE: 'GEO',
    IS: 'ISL',
    ME: 'MNE',
    BA: 'BIH',
    SK: 'SVK',
    SI: 'SVN',
    AT: 'AUT',
    CH: 'CHE',
    UA: 'UKR',
    AZ: 'AZE',
    MK: 'MKD',
    XK: 'KOS',
    FI: 'FIN',
    SE: 'SWE',
    AR: 'ARG',
    BR: 'BRA',
    AU: 'AUS',
    DO: 'DOM',
    GM: 'GAM',
    CI: 'CIV',
    CU: 'CUB',
    SN: 'SEN',
    GB: 'GBR',
    CA: 'CAN',
    NZ: 'NZL',
    NG: 'NGA',
    CM: 'CMR',
};

/** Official NBL site team slugs (nbl.basketball/tym/{slug}). */
const NBL_SITE_SLUGS: Record<string, string> = {
    NYM: 'era-basketball-nymburk',
    PCE: 'bk-kvis-pardubice',
    BRN: 'pumpa-basket-brno',
    UST: 'sluneta-usti-nad-labem',
    OPA: 'bk-opava',
    PIS: 'srsni-photomate-pisek',
    DEC: 'bk-armex-energy-decin',
    OST: 'nh-ostrava',
    OLO: 'bk-olomoucko',
    USK: 'usk-praha',
    SLA: 'sk-slavia-praha-era-nbk',
    HKR: 'bk-gapa-hradec-kralove',
};

/** Scoutbasketball slugs for Czech NBL fallback. */
const SCOUT_SLUGS: Record<string, string> = {
    NYM: 'basketball-nymburk',
    PCE: 'bk-kvis-pardubice',
    BRN: 'basket-brno',
    UST: 'sluneta-usti-nad-labem',
    OPA: 'bk-opava',
    PIS: 'srsni-photomate-pisek',
    DEC: 'bk-armex-energy-decin',
    OST: 'nh-ostrava',
    OLO: 'bk-olomoucko',
    USK: 'usk-praha',
    SLA: 'sk-slavia-praha',
    HKR: 'bk-gapa-hradec-kralove',
};

function decodeHtml(text: string): string {
    return text
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function stripTags(html: string): string {
    return decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0] ?? 'Player', lastName: 'Unknown' };
    }
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? 'Unknown' };
}

function normPos(raw: string): Position {
    const token = raw.trim().split('/')[0]?.trim() ?? '';
    if (token === '1') {
        return 'PG';
    }
    if (token === '2') {
        return 'SG';
    }
    if (token === '3') {
        return 'SF';
    }
    if (token === '4') {
        return 'PF';
    }
    if (token === '5') {
        return 'C';
    }
    const upper = token.toUpperCase();
    if (upper === 'G') {
        return 'PG';
    }
    if (upper === 'F') {
        return 'SF';
    }
    if (upper === 'PG' || upper === 'SG' || upper === 'SF' || upper === 'PF' || upper === 'C') {
        return upper as Position;
    }
    return 'SF';
}

function parseBorn(raw: string): number | null {
    const trimmed = raw.trim();
    const full = trimmed.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (full) {
        return Number.parseInt(full[3]!, 10);
    }
    const yearOnly = trimmed.match(/^(\d{4})$/);
    return yearOnly ? Number.parseInt(yearOnly[1]!, 10) : null;
}

function parseHeightCm(raw: string): number | null {
    const m = raw.match(/(\d{2,3})\s*cm/);
    return m ? Number.parseInt(m[1]!, 10) : null;
}

function parseFlagNationality(nameCell: string): string | null {
    const flag = nameCell.match(/flags\/([A-Z]{2})\.svg/);
    if (!flag) {
        return null;
    }
    return FLAG_NAT[flag[1]!] ?? flag[1]!;
}

function parseNblSiteRoster(html: string): ScrapedPlayer[] {
    const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbody) {
        return [];
    }
    const players: ScrapedPlayer[] = [];
    for (const row of tbody[1]!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]!);
        if (cells.length < 7) {
            continue;
        }
        const nameCell = cells[1] ?? '';
        const name = stripTags(nameCell.replace(/<img[\s\S]*?>/g, ''));
        if (!name || name.length < 2) {
            continue;
        }
        const posRaw = stripTags(cells[2] ?? '');
        const bornRaw = stripTags(cells[3] ?? '');
        const heightRaw = stripTags(cells[5] ?? '');
        const gamesRaw = stripTags(cells[6] ?? '0');
        const nationality = parseFlagNationality(nameCell);
        const { firstName, lastName } = splitName(name);
        players.push({
            firstName,
            lastName,
            position: normPos(posRaw),
            heightCm: parseHeightCm(heightRaw),
            born: parseBorn(bornRaw),
            nationality,
            gamesPlayed: Number.parseInt(gamesRaw, 10) || 0,
        });
    }
    players.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    return players;
}

function parseScoutRosterHtml(html: string): ScrapedPlayer[] {
    const leaders = new Set<string>();
    const meta = html.match(/led by([\s\S]{0,800}?)\./i)?.[1] ?? '';
    for (const m of meta.matchAll(/>([^<]+)</g)) {
        const name = decodeHtml(m[1]!.trim());
        if (name.length > 2) {
            leaders.add(name.toLowerCase());
        }
    }

    const players: ScrapedPlayer[] = [];
    for (const block of html.matchAll(/class="player-id"[^>]*>([\s\S]*?)<\/a>/g)) {
        const chunk = block[1]!;
        const fullName = decodeHtml(chunk.match(/player-id-name">([^<]+)/)?.[1] ?? '').trim();
        if (!fullName) {
            continue;
        }
        const posRaw = chunk.match(/player-id-pos">([^<]+)/)?.[1] ?? 'SF';
        const metaBlock = chunk.match(/player-id-meta">([\s\S]*?)<\/span>\s*<\/span>/)?.[1] ?? chunk;
        const heightMatch = metaBlock.match(/-\s*([\d.]+)m/);
        const bornMatch = metaBlock.match(/\((\d{4})\)/);
        const natMatch = chunk.match(/player-id-flag" title="([^"]+)"/);
        const { firstName, lastName } = splitName(fullName);
        players.push({
            firstName,
            lastName,
            position: normPos(posRaw),
            heightCm: heightMatch ? Math.round(Number.parseFloat(heightMatch[1]!) * 100) : null,
            born: bornMatch ? Number.parseInt(bornMatch[1]!, 10) : null,
            nationality: natMatch ? (FLAG_NAT[natMatch[1]!.slice(0, 2).toUpperCase()] ?? null) : null,
            gamesPlayed: leaders.has(fullName.toLowerCase()) ? 30 : 10,
        });
    }
    players.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    return players;
}

function assignTier(teamTier: number, index: number, isLeader: boolean): number {
    if (isLeader) {
        return Math.min(5, teamTier + 1);
    }
    if (index < 2) {
        return Math.min(5, teamTier);
    }
    if (index < 5) {
        return Math.max(1, teamTier - 1);
    }
    return Math.max(1, teamTier - 2);
}

function pickRoster(players: ScrapedPlayer[], teamTier: number): RealPlayerDef[] {
    return players.slice(0, PLAYERS_PER_TEAM).map((pl, index) => ({
        firstName: pl.firstName,
        lastName: pl.lastName,
        position: pl.position,
        tier: assignTier(teamTier, index, index === 0 && pl.gamesPlayed >= 20),
        heightCm: pl.heightCm,
        born: pl.born,
        nationality: pl.nationality ?? (pl.firstName.match(/[ěščřžýáíéúůďťň]/i) ? 'CZE' : null),
    }));
}

async function fetchNblSiteRoster(slug: string): Promise<ScrapedPlayer[]> {
    const url = `https://nbl.basketball/tym/${slug}?y=${SEASON_YEAR}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'buckets-manager-roster-scraper/1.0' } });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const html = await res.text();
    const players = parseNblSiteRoster(html);
    if (players.length === 0) {
        throw new Error(`no players parsed from ${url}`);
    }
    return players;
}

async function fetchScoutRoster(slug: string): Promise<ScrapedPlayer[]> {
    const url = `https://scoutbasketball.com/competition/czech-republic-nbl/${SCOUT_SEASON}/${slug}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'buckets-manager-roster-scraper/1.0' } });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const html = await res.text();
    const players = parseScoutRosterHtml(html);
    if (players.length === 0) {
        throw new Error(`no players parsed from ${url}`);
    }
    return players;
}

function toModule(rosters: Record<string, RealPlayerDef[]>): string {
    return `// Generated by scripts/scrape-nbl-rosters.ts — do not edit by hand.
import type { RealPlayerDef } from '../config/league';

/** Real Czech NBL rosters (2025-26), sourced from nbl.basketball / scoutbasketball.com. */
export const nblRostersByTeamId: Record<string, readonly RealPlayerDef[]> = ${JSON.stringify(rosters, null, 4)} as const;
`;
}

async function scrapeTeam(teamId: string, teamTier: number): Promise<RealPlayerDef[] | null> {
    const manual = manualNblRosters[teamId];
    if (manual) {
        console.log(`MAN ${teamId}: ${manual.length} players (manual fallback)`);
        return [...manual];
    }

    const siteSlug = NBL_SITE_SLUGS[teamId];
    const scoutSlug = SCOUT_SLUGS[teamId];

    if (siteSlug) {
        try {
            const scraped = await fetchNblSiteRoster(siteSlug);
            if (scraped.length >= MIN_ROSTER_PLAYERS) {
                const roster = pickRoster(scraped, teamTier);
                console.log(`OK ${teamId}: ${roster.length} players (nbl.basketball/${siteSlug})`);
                return roster;
            }
        } catch (err) {
            console.warn(`WARN ${teamId}: nbl.basketball failed (${err instanceof Error ? err.message : err})`);
        }
    }

    if (scoutSlug) {
        try {
            const scraped = await fetchScoutRoster(scoutSlug);
            if (scraped.length >= MIN_ROSTER_PLAYERS) {
                const roster = pickRoster(scraped, teamTier);
                console.log(`OK ${teamId}: ${roster.length} players (scoutbasketball/${scoutSlug})`);
                return roster;
            }
        } catch (err) {
            console.warn(`WARN ${teamId}: scoutbasketball failed (${err instanceof Error ? err.message : err})`);
        }
    }

    return null;
}

async function main(): Promise<void> {
    mkdirSync(join(ROOT, 'src', 'data'), { recursive: true });
    const rosters: Record<string, RealPlayerDef[]> = {};
    const failures: string[] = [];

    for (const team of leagueConfig.teams) {
        const roster = await scrapeTeam(team.id, team.tier);
        if (roster) {
            rosters[team.id] = roster;
        } else {
            failures.push(team.id);
        }
        await new Promise((r) => setTimeout(r, 100));
    }

    if (failures.length > 0) {
        console.error(`\nNBL scrape failures (${failures.length}): ${failures.join(', ')}`);
        process.exit(1);
    }

    writeFileSync(OUT, toModule(rosters));
    const count = Object.values(rosters).reduce((n, r) => n + r.length, 0);
    console.log(`\nWrote ${Object.keys(rosters).length} NBL teams (${count} players) -> ${OUT}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
