import type { RealPlayerDef, TeamDef } from './league';

// Basketball Champions League config: teams, format, and prize money.
// Modelled on 2025-26 BCL (Season 10) and Season 11 lineup.
// Prize amounts in CZK (EUR x 25).

export const bclConfig = Object.freeze({
    czechQualifiers: 2,
    regularSeasonTeams: 32,
    groupCount: 8,
    teamsPerGroup: 4,
    groupGamesPerTeam: 6,
    // BCL fixture weeks interleaved with NBL (midweek slots).
    groupWeeks: Object.freeze([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]),
    qualifyingTeams: 21,
    prizes: Object.freeze({
        entry: 600_000,
        groupStage: 750_000,
        roundOf16: 1_050_000,
        roundOf16Win: 190_000,
        quarterFinals: 1_500_000,
        playoffWin: 250_000,
        finalFour: 4_500_000,
        championBonus: 9_000_000,
        thirdPlace: 1_500_000,
    }),
    // Playoff wins needed per BCL knockout stage (QF, SF, Final).
    knockoutWinsNeeded: Object.freeze([2, 2, 1]),
    // Best-of-N for Czech 3rd-place entrant in BCL qualifying.
    qualifyingWinsNeeded: 2,
    teams: Object.freeze<BclTeamDef[]>([
        // Tier 5 elite clubs
        bclTeam('BCL-RYT', 'RYT', 'BC Rytas Vilnius', 'Rytas', 'Vilnius', 'LTU', 5, 5000, [
            p('Jerrick', 'Harding', 'SG', 5, 193, 1996, 'USA'),
            p('Simonas', 'Lukosius', 'PG', 5, 188, 2001, 'LTU'),
            p('Arturas', 'Gudaitis', 'C', 5, 208, 1988, 'LTU'),
            p('Derrick', 'Walton Jr', 'PG', 4, 183, 1995, 'USA'),
            p('Evaldas', 'Uoga', 'SF', 4, 198, 1991, 'LTU'),
            p('Arnas', 'Butkevicius', 'PF', 4, 200, 1992, 'LTU'),
        ]),
        bclTeam('BCL-AEK', 'AEK', 'AEK Athens', 'AEK', 'Athens', 'GRE', 5, 4500, [
            p('Frank', 'Bartley', 'SG', 5, 196, 1992, 'USA'),
            p('Matt', 'Thomas', 'SG', 4, 193, 1994, 'CAN'),
            p('Ioannis', 'Dimakopoulos', 'C', 4, 208, 1992, 'GRE'),
            p('Nikos', 'Pappas', 'SG', 4, 195, 1990, 'GRE'),
            p('Vassilis', 'Charalampopoulos', 'PF', 4, 203, 1997, 'GRE'),
        ]),
        bclTeam('BCL-UNI', 'UNI', 'Unicaja Malaga', 'Unicaja', 'Malaga', 'ESP', 5, 6000, [
            p('Kendrick', 'Perry', 'PG', 5, 183, 1991, 'MNE'),
            p('David', 'Muse', 'SG', 4, 193, 1998, 'USA'),
            p('Augusto', 'Cushing', 'SF', 4, 201, 1997, 'ARG'),
            p('Rodrigo', 'San Miguel', 'PF', 4, 203, 1998, 'ESP'),
            p('Carlos', 'Suarez', 'PF', 4, 203, 1986, 'ESP'),
        ]),
        bclTeam('BCL-LLTF', 'LLTF', 'La Laguna Tenerife', 'Tenerife', 'Tenerife', 'ESP', 4, 4000, [
            p('Marek', 'Blazevic', 'PF', 4, 206, 1995, 'CRO'),
            p('Aaron', 'White', 'PF', 4, 203, 1992, 'USA'),
            p('Giorgi', 'Shermadini', 'C', 4, 210, 1989, 'GEO'),
            p('Marcelo', 'Huertas', 'PG', 4, 191, 1983, 'BRA'),
        ]),
        bclTeam('BCL-ALB', 'ALB', 'Alba Berlin', 'Alba', 'Berlin', 'GER', 4, 6000, [
            p('Martin', 'Hermannsson', 'PG', 4, 188, 1994, 'ISL'),
            p('Johannes', 'Thiemann', 'PF', 4, 203, 1994, 'GER'),
            p('Malte', 'Delow', 'SF', 4, 200, 2001, 'GER'),
            p('Luke', 'Selvidge', 'C', 4, 208, 1998, 'USA'),
        ]),
        bclTeam('BCL-NYM', 'NYM', 'ERA Basketball Nymburk', 'Nymburk', 'Nymburk', 'CZE', 4, 1500, [], 'NYM', 'Sportovní centrum Nymburk'),
        // Tier 4 strong clubs
        bclTeam('BCL-WUE', 'WUE', 'Wurzburg Baskets', 'Wurzburg', 'Wurzburg', 'GER', 4, 3000, [
            p('Marcus', 'Carr', 'PG', 4, 188, 1998, 'CAN'),
            p('Brendan', 'Paul', 'C', 4, 208, 2000, 'USA'),
            p('Eugene', 'German', 'SG', 4, 193, 1997, 'USA'),
        ]),
        bclTeam('BCL-GSM', 'GSM', 'Gran Canaria', 'Gran Canaria', 'Las Palmas', 'ESP', 4, 5000, [
            p('Frederick', 'Gillespie', 'C', 4, 208, 1995, 'USA'),
            p('Kyle', 'Alexander', 'C', 4, 208, 1996, 'CAN'),
            p('Nicolas', 'Brussino', 'SF', 4, 200, 1993, 'ARG'),
        ]),
        bclTeam('BCL-TOF', 'TOF', 'Tofas Bursa', 'Tofas', 'Bursa', 'TUR', 4, 3500, [
            p('Marek', 'Blazevic', 'PF', 4, 206, 1995, 'CRO'),
            p('Kenny', 'Chery', 'PG', 4, 183, 1991, 'CAN'),
        ]),
        bclTeam('BCL-MSB', 'MSB', 'Metropolitans 92', 'MSB', 'Paris', 'FRA', 4, 3000, [
            p('Lucas', 'Dufeal', 'C', 4, 208, 1998, 'FRA'),
            p('Wilfried', 'Yeguete', 'PF', 4, 203, 1992, 'CIV'),
        ]),
        bclTeam('BCL-HOL', 'HOL', 'Hapoel Holon', 'Holon', 'Holon', 'ISR', 4, 2800, [
            p('Derrick', 'Walton Jr', 'PG', 4, 183, 1995, 'USA'),
            p('Chris', 'Johnson', 'C', 4, 208, 1990, 'USA'),
        ]),
        bclTeam('BCL-ELAN', 'ELAN', 'Elan Chalon', 'Chalon', 'Chalon', 'FRA', 4, 2500, [
            p('Matheo', 'Leray', 'PG', 4, 188, 2000, 'FRA'),
            p('William', 'McDowell-White', 'PG', 4, 193, 1998, 'AUS'),
        ]),
        bclTeam('BCL-KARD', 'KARD', 'Karditsa', 'Karditsa', 'Karditsa', 'GRE', 3, 2000, [
            p('Vangelis', 'Mantzaris', 'SG', 3, 196, 1991, 'GRE'),
        ]),
        bclTeam('BCL-CHO', 'CHO', 'Cholet Basket', 'Cholet', 'Cholet', 'FRA', 3, 3500, [
            p('William', 'Buford', 'SG', 3, 193, 1990, 'USA'),
        ]),
        bclTeam('BCL-HEI', 'HEI', 'MLP Academics Heidelberg', 'Heidelberg', 'Heidelberg', 'GER', 3, 2500, [
            p('Jaleen', 'Smith', 'PG', 3, 188, 1995, 'USA'),
        ]),
        bclTeam('BCL-GAL', 'GAL', 'Galatasaray', 'Galatasaray', 'Istanbul', 'TUR', 3, 4000, [
            p('Derrick', 'Phelps', 'PG', 3, 188, 1992, 'USA'),
        ]),
        bclTeam('BCL-OOS', 'OOS', 'Filou Oostende', 'Oostende', 'Oostende', 'BEL', 3, 2500, [
            p('Tyler', 'Ennis', 'PG', 3, 191, 1994, 'CAN'),
        ]),
        bclTeam('BCL-LEG', 'LEG', 'Legia Warszawa', 'Legia', 'Warsaw', 'POL', 3, 3000, [
            p('A.J.', 'Slaughter', 'SG', 3, 193, 1988, 'USA'),
        ]),
        bclTeam('BCL-SAB', 'SAB', 'Sabah BC', 'Sabah', 'Baku', 'AZE', 3, 2000, []),
        bclTeam('BCL-BEN', 'BEN', 'Benfica', 'Benfica', 'Lisbon', 'POR', 3, 2500, []),
        bclTeam('BCL-IGO', 'IGO', 'Igokea', 'Igokea', 'Banja Luka', 'BIH', 3, 2000, []),
        bclTeam('BCL-OLAJ', 'OLAJ', 'Szolnoki Olaj', 'Szolnok', 'Szolnok', 'HUN', 3, 2000, [
            p('Brady', 'Skeens', 'C', 4, 208, 1998, 'USA'),
        ]),
        bclTeam('BCL-VEF', 'VEF', 'VEF Riga', 'VEF', 'Riga', 'LVA', 3, 2000, []),
        bclTeam('BCL-HER', 'HER', 'Bnei Herzliya', 'Herzliya', 'Herzliya', 'ISR', 3, 1500, []),
        bclTeam('BCL-TRI', 'TRI', 'Pallacanestro Trieste', 'Trieste', 'Trieste', 'ITA', 3, 2000, []),
        bclTeam('BCL-JOV', 'JOV', 'Joventut Badalona', 'Joventut', 'Badalona', 'ESP', 3, 3500, []),
        bclTeam('BCL-MER', 'MER', 'Mersin', 'Mersin', 'Mersin', 'TUR', 3, 2000, []),
        bclTeam('BCL-PRO', 'PRO', 'Promitheas', 'Promitheas', 'Patras', 'GRE', 3, 2000, []),
        bclTeam('BCL-TRP', 'TRP', 'Trapani Shark', 'Trapani', 'Trapani', 'ITA', 3, 2000, []),
        bclTeam('BCL-LMS', 'LMS', 'Le Mans', 'Le Mans', 'Le Mans', 'FRA', 3, 2500, []),
        bclTeam('BCL-SPA', 'SPA', 'Spartak Office Shoes', 'Spartak', 'Subotica', 'SRB', 3, 2000, []),
        // Qualifying-round clubs (tier 1-2)
        bclTeam('BCL-BAK', 'BAK', 'Bakken Bears', 'Bakken', 'Aarhus', 'DEN', 2, 1500, []),
        bclTeam('BCL-LEV', 'LEV', 'Levski Sofia', 'Levski', 'Sofia', 'BGR', 2, 1500, []),
        bclTeam('BCL-MSK', 'MSK', 'MKS Dabrowa', 'MKS', 'Dabrowa', 'POL', 2, 1200, []),
        bclTeam('BCL-PAOK', 'PAOK', 'PAOK Thessaloniki', 'PAOK', 'Thessaloniki', 'GRE', 2, 3000, []),
        bclTeam('BCL-REG', 'REG', 'Reggiana', 'Reggiana', 'Reggio', 'ITA', 2, 2000, []),
        bclTeam('BCL-FAL', 'FAL', 'Falco Szombathely', 'Falco', 'Szombathely', 'HUN', 2, 2000, []),
        bclTeam('BCL-KAL', 'KAL', 'Kalev/Cramo', 'Kalev', 'Tallinn', 'EST', 2, 1500, []),
        bclTeam('BCL-ANT', 'ANT', 'Windrose Giants Antwerp', 'Antwerp', 'Antwerp', 'BEL', 2, 1500, []),
        bclTeam('BCL-ORAD', 'ORAD', 'CSM Oradea', 'Oradea', 'Oradea', 'ROU', 2, 1500, []),
        bclTeam('BCL-PORT', 'PORT', 'FC Porto', 'Porto', 'Porto', 'POR', 2, 2000, []),
        bclTeam('BCL-DEN', 'DEN', 'Heroes Den Bosch', 'Den Bosch', 'Den Bosch', 'NLD', 2, 2000, []),
        bclTeam('BCL-MUR', 'MUR', 'UCAM Murcia', 'Murcia', 'Murcia', 'ESP', 2, 3000, []),
        bclTeam('BCL-LUB', 'LUB', 'Start Lublin', 'Lublin', 'Lublin', 'POL', 2, 1500, []),
        bclTeam('BCL-FRI', 'FRI', 'Fribourg Olympic', 'Fribourg', 'Fribourg', 'CHE', 2, 1500, []),
        bclTeam('BCL-BRA', 'BRA', 'Löwen Braunschweig', 'Braunschweig', 'Braunschweig', 'GER', 2, 2000, []),
        bclTeam('BCL-DER', 'DER', 'SC Derby', 'Derby', 'Podgorica', 'MNE', 2, 1500, []),
        bclTeam('BCL-LAR', 'LAR', 'Petrolina AEK Larnaca', 'Larnaca', 'Larnaca', 'CYP', 2, 1500, []),
        bclTeam('BCL-RIL', 'RIL', 'Rilski Sportist', 'Rilski', 'Samokov', 'BGR', 2, 1200, []),
        bclTeam('BCL-KUT', 'KUT', 'Kutaisi 2010', 'Kutaisi', 'Kutaisi', 'GEO', 2, 1200, []),
        bclTeam('BCL-TRE', 'TRE', 'Trepça', 'Trepça', 'Peja', 'XKX', 2, 1200, []),
        bclTeam('BCL-JUV', 'JUV', 'Juventus Utena', 'Juventus', 'Utena', 'LTU', 2, 1200, []),
    ]),
});

export type BclConfig = typeof bclConfig;

export interface BclTeamDef extends TeamDef {
    /** ISO 3166-1 alpha-3 federation country (e.g. ESP, GRE). */
    country: string;
    nblTeamId?: string | undefined;
}

function p(
    firstName: string,
    lastName: string,
    position: RealPlayerDef['position'],
    tier: number,
    heightCm: number | null = null,
    born: number | null = null,
    nationality: string | null = null,
): RealPlayerDef {
    return { firstName, lastName, position, tier, heightCm, born, nationality };
}

function bclTeam(
    id: string,
    abbr: string,
    name: string,
    shortName: string,
    city: string,
    country: string,
    tier: number,
    arenaCapacity: number,
    roster: RealPlayerDef[],
    nblTeamId?: string,
    arenaName?: string,
): BclTeamDef {
    const def: BclTeamDef = {
        id,
        abbr,
        name,
        shortName,
        city,
        country,
        primary: { r: 40, g: 40, b: 40 },
        secondary: { r: 200, g: 200, b: 200 },
        arenaName: arenaName ?? `${shortName} Arena`,
        arenaCapacity,
        tier,
        roster,
    };
    if (nblTeamId) {
        def.nblTeamId = nblTeamId;
    }
    return def;
}

/** Direct-entry teams for the regular season (21 fixed + 11 from qualifying). */
export function bclDirectEntryIds(): string[] {
    return bclConfig.teams
        .filter((t) => !t.id.startsWith('BCL-BAK') && t.tier >= 3)
        .slice(0, 21)
        .map((t) => t.nblTeamId ?? t.id);
}

/** Teams that start in qualifying rounds. */
export function bclQualifyingIds(): string[] {
    return bclConfig.teams.filter((t) => t.tier <= 2).map((t) => t.id);
}
