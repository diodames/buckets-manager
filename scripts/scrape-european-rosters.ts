/**
 * Fetches real 2025-26 rosters from scoutbasketball.com and writes BCL/FEC roster data.
 * Run: npm run rosters:scrape
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bclConfig } from '../src/config/bcl.ts';
import { fecConfig } from '../src/config/fec.ts';
import type { RealPlayerDef } from '../src/config/league.ts';
import { tierMean } from '../src/core/league/playerRating.ts';
import { manualEuropeanRosters } from '../src/data/europeanRosters.manual.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BCL_OUT = join(ROOT, 'src', 'data', 'bclRosters.data.ts');
const FEC_OUT = join(ROOT, 'src', 'data', 'fecRosters.data.ts');

const SEASON = '2025-2026';
const PLAYERS_PER_TEAM = 12;
const MIN_ROSTER_PLAYERS = 8;

type Position = RealPlayerDef['position'];

interface SourceRef {
    competition: string;
    slug: string;
}

interface ScrapedPlayer {
    firstName: string;
    lastName: string;
    position: Position;
    heightCm: number | null;
    born: number | null;
    nationality: string | null;
    leader: boolean;
}

const NAT3: Record<string, string> = {
    'United States': 'USA',
    Canada: 'CAN',
    Germany: 'GER',
    Spain: 'ESP',
    France: 'FRA',
    Italy: 'ITA',
    Greece: 'GRE',
    Turkey: 'TUR',
    Lithuania: 'LTU',
    Latvia: 'LVA',
    Estonia: 'EST',
    Poland: 'POL',
    'Czech Republic': 'CZE',
    Croatia: 'CRO',
    Serbia: 'SRB',
    Israel: 'ISR',
    Portugal: 'POR',
    Belgium: 'BEL',
    Netherlands: 'NLD',
    Denmark: 'DEN',
    Hungary: 'HUN',
    Bulgaria: 'BGR',
    Romania: 'ROU',
    Cyprus: 'CYP',
    Georgia: 'GEO',
    Iceland: 'ISL',
    Montenegro: 'MNE',
    'Bosnia and Herzegovina': 'BIH',
    Slovakia: 'SVK',
    Slovenia: 'SVN',
    Austria: 'AUT',
    Switzerland: 'CHE',
    Ukraine: 'UKR',
    Azerbaijan: 'AZE',
    'North Macedonia': 'MKD',
    Kosovo: 'KOS',
    Finland: 'FIN',
    Sweden: 'SWE',
    Argentina: 'ARG',
    Brazil: 'BRA',
    Australia: 'AUS',
    'Dominican Republic': 'DOM',
    Gambia: 'GAM',
    'Ivory Coast': 'CIV',
    Cuba: 'CUB',
    Senegal: 'SEN',
    'United Kingdom': 'GBR',
    'Great Britain': 'GBR',
};

const BCL_SLUGS: Record<string, string> = {
    'BCL-RYT': 'bc-lietuvos-rytas',
    'BCL-AEK': 'aek',
    'BCL-UNI': 'unicaja-cb',
    'BCL-LLTF': 'cb-canarias',
    'BCL-ALB': 'alba-berlin',
    'BCL-WUE': 'wurzburg-baskets',
    'BCL-GSM': 'cb-gran-canaria',
    'BCL-TOF': 'tofas-bursa',
    'BCL-HOL': 'hapoel-holon',
    'BCL-ELAN': 'elan-chalon',
    'BCL-KARD': 'as-karditsas',
    'BCL-CHO': 'cholet-basket',
    'BCL-HEI': 'mlp-academics-heidelberg',
    'BCL-GAL': 'galatasaray',
    'BCL-OOS': 'bc-telenet-oostende',
    'BCL-LEG': 'legia-warszawa',
    'BCL-SAB': 'sabah-bc',
    'BCL-BEN': 'benfica',
    'BCL-IGO': 'kk-igokea',
    'BCL-OLAJ': 'szolnoki-olaj-kk',
    'BCL-VEF': 'vef-riga',
    'BCL-HER': 'bnei-herzliya',
    'BCL-TRI': 'pallacanestro-trieste',
    'BCL-JOV': 'club-joventut-badalona',
    'BCL-MER': 'mersin-bsb',
    'BCL-PRO': 'promitheas-patras',
    'BCL-TRP': 'pallacanestro-trapani',
    'BCL-LMS': 'le-mans',
    'BCL-SPA': 'kk-spartak-subotica',
    'BCL-BAK': 'bakken-bears',
    'BCL-LEV': 'bk-levicki',
    'BCL-MSK': 'mks-dabrowa-gornicza',
    'BCL-PAOK': 'paok-bc',
    'BCL-REG': 'pallacanestro-reggiana',
    'BCL-FAL': 'falco-kc',
    'BCL-KAL': 'bc-kalev-cramo-tallinn',
    'BCL-ANT': 'antwerp-giants',
    'BCL-ORAD': 'csm-oradea',
    'BCL-PORT': 'fc-porto',
    'BCL-DEN': 'heroes-den-bosch',
    'BCL-MUR': 'ucam-murcia-cb',
    'BCL-LUB': 'start-lublin',
    'BCL-FRI': 'fribourg-olympic',
    'BCL-BRA': 'braunschweig-basketball',
    'BCL-LAR': 'aek-larnaca',
    'BCL-RIL': 'bc-rilski-sportist',
    'BCL-KUT': 'kutaisi',
    'BCL-TRE': 'kb-trepca-mitrovice',
    'BCL-JUV': 'bc-juventus',
};

const FEC_SLUGS: Record<string, string> = {
    'FEC-SBB': 'bilbao-basket',
    'FEC-PBC': 'paok-bc',
    'FEC-SZOM': 'falco-kc',
    'FEC-UCAM': 'ucam-murcia-cb',
    'FEC-REG': 'pallacanestro-reggiana',
    'FEC-BOSN': 'kk-bosna-sarajevo',
    'FEC-PTKM': 'petkimspor',
    'FEC-PERI': 'peristeri-gs',
    'FEC-ROST': 'rostock-seawolves',
    'FEC-TREFL': 'trefl-sopot',
    'FEC-CDJ': 'club-joventut-badalona',
    'FEC-BCPD': 'fc-porto',
    'FEC-SCP': 'sporting-clube-de-portugal',
    'FEC-DSS': 'dinamo-sassari',
    'FEC-CZGZ': 'kk-cedevita-zagreb',
    'FEC-LUBL': 'start-lublin',
    'FEC-KUT': 'kutaisi',
    'FEC-BRN': 'basket-brno',
    'FEC-ANO': 'anorthosis-ammohostou',
    'FEC-KALEV': 'bc-kalev-cramo-tallinn',
    'FEC-NFT': 'neftchi-ik',
    'FEC-ABSBK': 'absheron-lions',
    'FEC-CIBO': 'kk-cibona',
    'FEC-JDA': 'jda-dijon-basket',
    'FEC-BASHK': 'kb-bashkimi',
    'FEC-PELI': 'kk-pelister',
    'FEC-KER': 'keravnos-strovolou',
    'FEC-AEK': 'aek-larnaca',
    'FEC-CSMBV': 'csu-cuadripol-scm-brasov',
    'FEC-ANTW': 'antwerp-giants',
    'FEC-FCP': 'fc-porto',
    'FEC-TARTU': 'tartu-ulikool',
    'FEC-RIL': 'bc-rilski-sportist',
    'FEC-ANWIL': 'anwil-wloclawek',
    'FEC-TREP': 'trefl-sopot',
    'FEC-RASTA': 'sc-rasta-vechta',
    'FEC-BLBB': 'alba-berlin',
};

/** Extra source attempts when the primary league page has no roster. */
const SOURCE_OVERRIDES: Record<string, SourceRef[]> = {
    'BCL-BAK': [{ competition: 'fiba-champions-league-qual', slug: 'bakken-bears' }],
    'BCL-PAOK': [{ competition: 'fiba-champions-league-qual', slug: 'paok-bc' }],
    'BCL-REG': [{ competition: 'fiba-champions-league-qual', slug: 'pallacanestro-reggiana' }],
    'BCL-FAL': [{ competition: 'fiba-champions-league-qual', slug: 'falco-kc' }],
    'BCL-KAL': [{ competition: 'fiba-champions-league-qual', slug: 'bc-kalev-cramo-tallinn' }],
    'BCL-ANT': [{ competition: 'fiba-champions-league-qual', slug: 'antwerp-giants' }],
    'BCL-ORAD': [{ competition: 'fiba-champions-league-qual', slug: 'csm-oradea' }],
    'BCL-PORT': [{ competition: 'fiba-champions-league-qual', slug: 'fc-porto' }],
    'BCL-FRI': [{ competition: 'fiba-champions-league-qual', slug: 'fribourg-olympic' }],
    'BCL-BRA': [{ competition: 'fiba-champions-league-qual', slug: 'braunschweig-basketball' }],
    'BCL-LAR': [{ competition: 'fiba-champions-league-qual', slug: 'aek-larnaca' }],
    'BCL-RIL': [{ competition: 'fiba-champions-league-qual', slug: 'bc-rilski-sportist' }],
    'BCL-KUT': [{ competition: 'fiba-champions-league-qual', slug: 'kutaisi' }],
    'BCL-TRE': [{ competition: 'fiba-champions-league-qual', slug: 'kb-trepca-mitrovice' }],
    'BCL-DEN': [{ competition: 'fiba-champions-league-qual', slug: 'heroes-den-bosch' }],
    'BCL-MSK': [{ competition: 'poland-plk', slug: 'mks-dabrowa-gornicza' }],
    'BCL-MUR': [{ competition: 'fiba-champions-league-qual', slug: 'ucam-murcia-cb' }],
    'BCL-JUV': [{ competition: 'fiba-champions-league-qual', slug: 'bc-juventus' }],
    'BCL-LUB': [{ competition: 'fiba-europe-cup', slug: 'start-lublin' }],
    'FEC-CDJ': [{ competition: 'fiba-champions-league-europe', slug: 'club-joventut-badalona' }],
    'FEC-BLBB': [{ competition: 'fiba-champions-league-europe', slug: 'alba-berlin' }],
};

function decodeHtml(text: string): string {
    return text
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function normPos(raw: string): Position {
    const token = raw.trim().split(/\s+/)[0]?.toUpperCase() ?? 'SF';
    if (token === 'G') {
        return 'PG';
    }
    if (token === 'F') {
        return 'SF';
    }
    if (token === 'PG' || token === 'SG' || token === 'SF' || token === 'PF' || token === 'C') {
        return token;
    }
    return 'SF';
}

function splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0] ?? 'Player', lastName: 'Unknown' };
    }
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? 'Unknown' };
}

function parseHeightCm(meta: string): number | null {
    const m = meta.match(/-\s*([\d.]+)m/);
    return m ? Math.round(Number.parseFloat(m[1]!) * 100) : null;
}

function parseBorn(meta: string): number | null {
    const m = meta.match(/\((\d{4})\)/);
    return m ? Number.parseInt(m[1]!, 10) : null;
}

function parseNationality(block: string): string | null {
    const m = block.match(/player-id-flag" title="([^"]+)"/);
    if (!m) {
        return null;
    }
    return NAT3[m[1]!] ?? m[1]!.slice(0, 3).toUpperCase();
}

function parseLeaders(html: string): Set<string> {
    const leaders = new Set<string>();
    const meta = html.match(/led by([\s\S]{0,800}?)\./i)?.[1] ?? html.match(/Featuring([\s\S]{0,400}?)\./i)?.[1] ?? '';
    for (const m of meta.matchAll(/>([^<]+)</g)) {
        const name = decodeHtml(m[1]!.trim());
        if (name.length > 2) {
            leaders.add(name.toLowerCase());
        }
    }
    return leaders;
}

function parseRosterHtml(html: string): ScrapedPlayer[] {
    const leaders = parseLeaders(html);
    const players: ScrapedPlayer[] = [];
    for (const block of html.matchAll(/class="player-id"[^>]*>([\s\S]*?)<\/a>/g)) {
        const chunk = block[1]!;
        const fullName = decodeHtml(chunk.match(/player-id-name">([^<]+)/)?.[1] ?? '').trim();
        if (!fullName) {
            continue;
        }
        const posRaw = chunk.match(/player-id-pos">([^<]+)/)?.[1] ?? 'SF';
        const meta = chunk.match(/player-id-meta">([\s\S]*?)<\/span>\s*<\/span>/)?.[1] ?? chunk;
        const { firstName, lastName } = splitName(fullName);
        players.push({
            firstName,
            lastName,
            position: normPos(posRaw),
            heightCm: parseHeightCm(meta),
            born: parseBorn(meta),
            nationality: parseNationality(chunk),
            leader: leaders.has(fullName.toLowerCase()),
        });
    }
    players.sort((a, b) => Number(b.leader) - Number(a.leader));
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
    return players.slice(0, PLAYERS_PER_TEAM).map((pl, index) => {
        const tier = assignTier(teamTier, index, pl.leader);
        return {
            firstName: pl.firstName,
            lastName: pl.lastName,
            position: pl.position,
            tier,
            targetOverall: tierMean(tier),
            heightCm: pl.heightCm,
            born: pl.born,
            nationality: pl.nationality,
        };
    });
}

function sourcesFor(teamId: string, defaultCompetition: string, slugMap: Record<string, string>): SourceRef[] {
    const slug = slugMap[teamId];
    if (!slug) {
        return [];
    }
    const out: SourceRef[] = [{ competition: defaultCompetition, slug }];
    for (const extra of SOURCE_OVERRIDES[teamId] ?? []) {
        out.push(extra);
    }
    if (defaultCompetition === 'fiba-champions-league-europe') {
        out.push({ competition: 'fiba-champions-league-qual', slug });
        out.push({ competition: 'fiba-europe-cup', slug });
    }
    if (defaultCompetition === 'fiba-europe-cup') {
        out.push({ competition: 'fiba-champions-league-europe', slug });
        out.push({ competition: 'fiba-champions-league-qual', slug });
    }
    const seen = new Set<string>();
    return out.filter((source) => {
        const key = `${source.competition}/${source.slug}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

async function fetchRoster(source: SourceRef): Promise<ScrapedPlayer[]> {
    const url = `https://scoutbasketball.com/competition/${source.competition}/${SEASON}/${source.slug}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'buckets-manager-roster-scraper/1.0' } });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const html = await res.text();
    const players = parseRosterHtml(html);
    if (players.length === 0) {
        throw new Error(`no players parsed from ${url}`);
    }
    return players;
}

function toModule(competitionLabel: 'BCL' | 'FEC', rosters: Record<string, RealPlayerDef[]>): string {
    const exportName = competitionLabel === 'BCL' ? 'bclRostersByTeamId' : 'fecRostersByTeamId';
    return `// Generated by scripts/scrape-european-rosters.ts — do not edit by hand.
import type { RealPlayerDef } from '../config/league';

/** Real ${competitionLabel} rosters (2025-26), sourced from scoutbasketball.com. */
export const ${exportName}: Record<string, readonly RealPlayerDef[]> = ${JSON.stringify(rosters, null, 4)} as const;
`;
}

async function scrapeCompetition(
    label: 'BCL' | 'FEC',
    teams: ReadonlyArray<{ id: string; tier: number; nblTeamId?: string }>,
    defaultCompetition: string,
    slugMap: Record<string, string>,
): Promise<Record<string, RealPlayerDef[]>> {
    const rosters: Record<string, RealPlayerDef[]> = {};
    const failures: string[] = [];

    for (const team of teams) {
        if (team.nblTeamId) {
            continue;
        }

        const manual = manualEuropeanRosters[team.id];
        if (manual) {
            rosters[team.id] = [...manual];
            console.log(`MAN ${team.id}: ${manual.length} players (manual fallback)`);
            continue;
        }

        const candidates = sourcesFor(team.id, defaultCompetition, slugMap);
        if (candidates.length === 0) {
            failures.push(`${team.id}: no slug mapping`);
            continue;
        }

        let picked = false;
        for (const source of candidates) {
            try {
                const scraped = await fetchRoster(source);
                if (scraped.length < MIN_ROSTER_PLAYERS) {
                    continue;
                }
                rosters[team.id] = pickRoster(scraped, team.tier);
                console.log(`OK ${team.id}: ${rosters[team.id]!.length} players (${source.competition}/${source.slug})`);
                picked = true;
                break;
            } catch {
                // try next source
            }
        }
        if (!picked) {
            failures.push(`${team.id}: no roster found (${candidates.map((s) => `${s.competition}/${s.slug}`).join(', ')})`);
        }
        await new Promise((r) => setTimeout(r, 100));
    }

    if (failures.length > 0) {
        console.warn(`\n${label} scrape warnings (${failures.length}):`);
        for (const f of failures) {
            console.warn(`  - ${f}`);
        }
    }
    return rosters;
}

async function main(): Promise<void> {
    mkdirSync(join(ROOT, 'src', 'data'), { recursive: true });

    const bclRosters = await scrapeCompetition('BCL', bclConfig.teams, 'fiba-champions-league-europe', BCL_SLUGS);
    writeFileSync(BCL_OUT, toModule('BCL', bclRosters));

    const fecRosters = await scrapeCompetition('FEC', fecConfig.teams, 'fiba-europe-cup', FEC_SLUGS);
    writeFileSync(FEC_OUT, toModule('FEC', fecRosters));

    const bclCount = Object.values(bclRosters).reduce((n, r) => n + r.length, 0);
    const fecCount = Object.values(fecRosters).reduce((n, r) => n + r.length, 0);
    console.log(`\nWrote ${Object.keys(bclRosters).length} BCL teams (${bclCount} players) -> ${BCL_OUT}`);
    console.log(`Wrote ${Object.keys(fecRosters).length} FEC teams (${fecCount} players) -> ${FEC_OUT}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
