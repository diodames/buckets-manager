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
import {
    blendWithTeamTier,
    clampOverall,
    clubPrestigeBonus,
    compositeBoxScore,
    enforceTopClubOverallGap,
    NBL_RATING_BAND,
    overallsFromScores,
    tierFromOverall,
    tierMean,
} from '../src/core/league/playerRating.ts';
import { manualNblRosters } from '../src/data/nblRosters.manual.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src', 'data', 'nblRosters.data.ts');

const SEASON_YEAR = '2025';
const SCOUT_SEASON = '2025-2026';
const PLAYERS_PER_TEAM = 12;
const MIN_ROSTER_PLAYERS = 8;
/** Ignore tiny samples when ranking for targetOverall. */
const MIN_GAMES_FOR_RATING = 5;

type Position = RealPlayerDef['position'];

interface ScrapedStats {
    games: number;
    mpg: number;
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    val: number;
}

interface ScrapedPlayer {
    firstName: string;
    lastName: string;
    position: Position;
    heightCm: number | null;
    born: number | null;
    nationality: string | null;
    gamesPlayed: number;
    stats: ScrapedStats | null;
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

function nameKey(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[''`\-.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseNum(raw: string): number {
    const cleaned = raw.replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}

/** Identity roster table (first tbody on the team page). */
function parseNblIdentityRoster(html: string): ScrapedPlayer[] {
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
            stats: null,
        });
    }
    return players;
}

/**
 * Season averages table in #tab-pane-two.
 * Columns: #, Player, Pos, Age, G, Min, Pts, 2B, 2B%, 3B, 3B%, FT, FT%, OR, DR, TR, AS, ST, TO, ..., VAL, +/-
 */
function parseNblStatsByName(html: string): Map<string, ScrapedStats> {
    const pane = html.match(/id="tab-pane-two"([\s\S]*?)id="tab-pane-three"/)
        ?? html.match(/id="tab-pane-two"([\s\S]*?)$/);
    const out = new Map<string, ScrapedStats>();
    if (!pane) {
        return out;
    }
    const tbody = pane[1]!.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (!tbody) {
        return out;
    }
    for (const row of tbody[1]!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]!));
        if (cells.length < 18) {
            continue;
        }
        const name = cells[1] ?? '';
        if (!name || name.length < 2) {
            continue;
        }
        const { firstName, lastName } = splitName(name);
        const games = Math.round(parseNum(cells[4] ?? '0'));
        const mpg = parseNum(cells[5] ?? '0');
        const ppg = parseNum(cells[6] ?? '0');
        const rpg = parseNum(cells[15] ?? '0');
        const apg = parseNum(cells[16] ?? '0');
        const spg = parseNum(cells[17] ?? '0');
        const val = parseNum(cells[cells.length - 2] ?? '0');
        out.set(nameKey(firstName, lastName), { games, mpg, ppg, rpg, apg, spg, val });
    }
    return out;
}

function parseNblSiteRoster(html: string): ScrapedPlayer[] {
    const players = parseNblIdentityRoster(html);
    const statsByName = parseNblStatsByName(html);
    for (const player of players) {
        const stats = statsByName.get(nameKey(player.firstName, player.lastName));
        if (!stats) {
            continue;
        }
        player.stats = stats;
        player.gamesPlayed = Math.max(player.gamesPlayed, stats.games);
    }
    players.sort((a, b) => {
        const aMin = a.stats?.mpg ?? 0;
        const bMin = b.stats?.mpg ?? 0;
        if (bMin !== aMin) {
            return bMin - aMin;
        }
        return b.gamesPlayed - a.gamesPlayed;
    });
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
            stats: null,
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

function scoreForPlayer(pl: ScrapedPlayer): number | null {
    if (!pl.stats || pl.stats.games < MIN_GAMES_FOR_RATING) {
        return null;
    }
    return compositeBoxScore(pl.stats);
}

function pickRosterShell(players: ScrapedPlayer[], teamTier: number): Array<RealPlayerDef & { _score: number | null }> {
    return players.slice(0, PLAYERS_PER_TEAM).map((pl, index) => {
        const tier = assignTier(teamTier, index, index === 0 && pl.gamesPlayed >= 20);
        const score = scoreForPlayer(pl);
        return {
            firstName: pl.firstName,
            lastName: pl.lastName,
            position: pl.position,
            tier,
            heightCm: pl.heightCm,
            born: pl.born,
            nationality: pl.nationality ?? (pl.firstName.match(/[ěščřžýáíéúůďťň]/i) ? 'CZE' : null),
            mpg: pl.stats?.mpg ?? null,
            _score: score,
        };
    });
}

function applyLeagueRatings(
    shells: Record<string, Array<RealPlayerDef & { _score: number | null }>>,
    teamTierById: Record<string, number>,
): Record<string, RealPlayerDef[]> {
    const flat: Array<{ teamId: string; index: number; score: number | null }> = [];
    for (const [teamId, roster] of Object.entries(shells)) {
        roster.forEach((pl, index) => flat.push({ teamId, index, score: pl._score }));
    }
    const mapped = overallsFromScores(
        flat.map((row) => row.score),
        NBL_RATING_BAND,
    );
    const overallByKey = new Map<string, number | null>();
    flat.forEach((row, i) => {
        overallByKey.set(`${row.teamId}:${row.index}`, mapped[i] ?? null);
    });

    const out: Record<string, RealPlayerDef[]> = {};
    for (const [teamId, roster] of Object.entries(shells)) {
        out[teamId] = roster.map((pl, index) => {
            const statsOverall = overallByKey.get(`${teamId}:${index}`) ?? null;
            const clubTier = teamTierById[teamId] ?? 3;
            const targetOverall = clampOverall(
                (statsOverall != null
                    ? blendWithTeamTier(statsOverall, clubTier)
                    : tierMean(pl.tier)) + clubPrestigeBonus(clubTier),
                NBL_RATING_BAND,
            );
            const { _score: _ignored, ...rest } = pl;
            return {
                ...rest,
                targetOverall,
                tier: tierFromOverall(targetOverall),
                mpg: pl.mpg ?? null,
            };
        });
    }

    // Keep the tier-5 flagship (Nymburk) clearly above the field on roster mean.
    const teamAvgs: Record<string, number> = {};
    for (const [teamId, roster] of Object.entries(out)) {
        teamAvgs[teamId] = roster.reduce((s, p) => s + (p.targetOverall ?? 0), 0) / Math.max(1, roster.length);
    }
    const topClubs = Object.entries(teamTierById)
        .filter(([, tier]) => tier >= 5)
        .map(([id]) => id);
    const bumps = enforceTopClubOverallGap(teamAvgs, topClubs, 2);
    for (const [teamId, bump] of Object.entries(bumps)) {
        out[teamId] = out[teamId]!.map((p) => {
            const targetOverall = clampOverall((p.targetOverall ?? tierMean(p.tier)) + bump, NBL_RATING_BAND);
            return { ...p, targetOverall, tier: tierFromOverall(targetOverall) };
        });
    }

    return out;
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

async function scrapeTeamShell(
    teamId: string,
    teamTier: number,
): Promise<Array<RealPlayerDef & { _score: number | null }> | null> {
    const manual = manualNblRosters[teamId];
    if (manual) {
        console.log(`MAN ${teamId}: ${manual.length} players (manual fallback)`);
        return manual.map((pl) => ({
            ...pl,
            mpg: pl.mpg ?? null,
            _score: null,
        }));
    }

    const siteSlug = NBL_SITE_SLUGS[teamId];
    const scoutSlug = SCOUT_SLUGS[teamId];

    if (siteSlug) {
        try {
            const scraped = await fetchNblSiteRoster(siteSlug);
            if (scraped.length >= MIN_ROSTER_PLAYERS) {
                const roster = pickRosterShell(scraped, teamTier);
                const withStats = scraped.filter((p) => p.stats && p.stats.games >= MIN_GAMES_FOR_RATING).length;
                console.log(`OK ${teamId}: ${roster.length} players, ${withStats} with stats (nbl.basketball/${siteSlug})`);
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
                const roster = pickRosterShell(scraped, teamTier);
                console.log(`OK ${teamId}: ${roster.length} players (scoutbasketball/${scoutSlug}, tier fallback)`);
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
    const shells: Record<string, Array<RealPlayerDef & { _score: number | null }>> = {};
    const teamTierById: Record<string, number> = {};
    const failures: string[] = [];

    for (const team of leagueConfig.teams) {
        teamTierById[team.id] = team.tier;
        const roster = await scrapeTeamShell(team.id, team.tier);
        if (roster) {
            shells[team.id] = roster;
        } else {
            failures.push(team.id);
        }
        await new Promise((r) => setTimeout(r, 100));
    }

    if (failures.length > 0) {
        console.error(`\nNBL scrape failures (${failures.length}): ${failures.join(', ')}`);
        process.exit(1);
    }

    const rosters = applyLeagueRatings(shells, teamTierById);
    writeFileSync(OUT, toModule(rosters));
    const count = Object.values(rosters).reduce((n, r) => n + r.length, 0);
    const rated = Object.values(rosters).reduce(
        (n, r) => n + r.filter((p) => p.targetOverall != null).length,
        0,
    );
    console.log(`\nWrote ${Object.keys(rosters).length} NBL teams (${count} players, ${rated} with targetOverall) -> ${OUT}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
