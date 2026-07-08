import type { Rgb } from './palette';

// Real Czech NBL (Maxa NBL) season 2025/26: teams and rosters compiled from
// nbl.basketball, Wikipedia, and eurobasket.com. Player tier 1..5 estimates
// within-league quality; attributes are derived from it at league creation.
export interface RealPlayerDef {
    firstName: string;
    lastName: string;
    position: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
    heightCm: number | null;
    born: number | null;
    nationality: string | null;
    tier: number;
}

export interface TeamDef {
    id: string;
    abbr: string;
    name: string;
    shortName: string;
    city: string;
    primary: Rgb;
    secondary: Rgb;
    arenaName: string;
    arenaCapacity: number | null;
    tier: number;
    roster: RealPlayerDef[];
}

function hex(value: string): Rgb {
    return {
        r: Number.parseInt(value.slice(1, 3), 16),
        g: Number.parseInt(value.slice(3, 5), 16),
        b: Number.parseInt(value.slice(5, 7), 16),
    };
}

const p = (
    firstName: string,
    lastName: string,
    position: RealPlayerDef['position'],
    tier: number,
    heightCm: number | null = null,
    born: number | null = null,
    nationality: string | null = null,
): RealPlayerDef => ({ firstName, lastName, position, tier, heightCm, born, nationality });

export const leagueConfig = Object.freeze({
    // Roster fill target: teams below this get generated youth players.
    playersPerTeam: 12,
    roundRobinLegs: 2,
    startingSeasonYear: 2025,
    // Post-season: top N seeds, wins needed per stage (QF, SF, Finals).
    playoffs: Object.freeze({
        teams: 8,
        winsNeeded: Object.freeze([2, 2, 3]),
    }),
    teams: Object.freeze<TeamDef[]>([
        {
            id: 'NYM', abbr: 'NYM', name: 'ERA Basketball Nymburk', shortName: 'Nymburk', city: 'Nymburk',
            primary: hex('#1D1D1B'), secondary: hex('#E30613'), arenaName: 'Sportovní centrum Nymburk', arenaCapacity: 1500, tier: 5,
            roster: [
                p('Ondřej', 'Sehnal', 'PG', 4, 191, 1997, 'CZE'),
                p("Sir'Jabari", 'Rice', 'SG', 5, 193, 1998, 'USA'),
                p('Jaromír', 'Bohačík', 'SG', 4, 197, 1992, 'CZE'),
                p('Matěj', 'Svoboda', 'SF', 4, 196, 1996, 'CZE'),
                p('Vojtěch', 'Hruban', 'SF', 4, 198, 1989, 'CZE'),
                p('František', 'Rylich', 'SF', 3, 190, 2002, 'CZE'),
                p('David', 'Böhm', 'PF', 4, 202, 2001, 'CZE'),
                p('JT', 'Shumate', 'PF', 4, 201, 1999, 'USA'),
                p('Martin', 'Kříž', 'PF', 3, 200, 1993, 'CZE'),
                p('Marcus', 'Santos-Silva', 'C', 4, 201, 1997, 'USA'),
                p('Goran', 'Filipovic', 'C', 3, null, 1996, 'CRO'),
                p('Jaquan', 'Lawrence', 'C', 3, null, 1999, 'USA'),
            ],
        },
        {
            id: 'PCE', abbr: 'PCE', name: 'BK KVIS Pardubice', shortName: 'Pardubice', city: 'Pardubice',
            primary: hex('#C8102E'), secondary: hex('#FFFFFF'), arenaName: 'Sportovní hala Pardubice', arenaCapacity: 1400, tier: 4,
            roster: [
                p('Robert', 'Bonham', 'PG', 4, null, 2002, 'USA'),
                p('Martin', 'Nábělek', 'PG', 3, 178, 1998, 'CZE'),
                p('Jakub', 'Tůma', 'PG', 3, 192, 1998, 'CZE'),
                p('Jamonda', 'Bryant', 'SG', 5, null, 2000, 'USA'),
                p('Adam', 'Lukeš', 'SG', 2, null, 2004, 'CZE'),
                p('Ryan', 'Moffatt', 'SF', 3, null, 2000, 'USA'),
                p('Michal', 'Svojanovský', 'SF', 3, 195, 2001, 'CZE'),
                p('Vladimír', 'Vondra', 'SF', 2, null, 2002, 'CZE'),
                p('Petr', 'Šťovíček', 'PF', 2, null, 2004, 'CZE'),
                p('Zed', 'Key', 'C', 4, 203, 2002, 'USA'),
                p('Kamil', 'Švrdlík', 'C', 4, 205, 1986, 'CZE'),
                p('Luboš', 'Kovář', 'C', 3, 204, 2000, 'CZE'),
            ],
        },
        {
            id: 'BRN', abbr: 'BRN', name: 'PUMPA Basket Brno', shortName: 'Brno', city: 'Brno',
            primary: hex('#003876'), secondary: hex('#E03A3E'), arenaName: 'STAREZ Aréna Vodova', arenaCapacity: 2900, tier: 4,
            roster: [
                p('Tevin', 'Olison', 'PG', 4, null, 1998, 'USA'),
                p('Viktor', 'Půlpán', 'PG', 4, 191, 1996, 'CZE'),
                p('Tomáš', 'Jansa', 'PG', 3, 186, 2002, 'CZE'),
                p('Petr', 'Křivánek', 'PG', 3, 193, 2003, 'CZE'),
                p('David', 'Jelínek', 'SG', 4, 196, 1990, 'CZE'),
                p('Radek', 'Farský', 'SG', 3, 195, 1999, 'CZE'),
                p('Jonáš', 'Musil', 'SG', 3, 196, 2002, 'CZE'),
                p('Tomáš', 'Houzar', 'SG', 2, null, 2002, 'CZE'),
                p('Matěj', 'Rychtecký', 'SG', 2, null, 2004, 'CZE'),
                p('Šimon', 'Svoboda', 'SF', 2, null, 2004, 'CZE'),
                p('Kevin', 'Kalu', 'SF', 2, null, 2003, 'CZE'),
                p('Ryker', 'Cisarik', 'PF', 4, null, 2002, 'USA'),
                p('Kameron', 'Chatman', 'PF', 4, null, 1996, 'CAN'),
                p('Adam', 'Kejval', 'C', 3, null, 2002, 'CZE'),
            ],
        },
        {
            id: 'UST', abbr: 'UST', name: 'SLUNETA Ústí nad Labem', shortName: 'Ústí n. L.', city: 'Ústí nad Labem',
            primary: hex('#FDB913'), secondary: hex('#005BAA'), arenaName: 'Sportovní hala Sluneta', arenaCapacity: 1600, tier: 3,
            roster: [
                p('Tomáš', 'Vyoral', 'PG', 4, 192, 1992, 'CZE'),
                p('Jayhlon', 'Young', 'PG', 4, null, 2001, 'USA'),
                p('Benjamin', 'Adler', 'PG', 1, null, 2007, null),
                p('Nicholas', 'Johnson', 'SG', 4, null, 2001, 'USA'),
                p('Ondřej', 'Hornický', 'SG', 1, null, 2006, 'CZE'),
                p('Isaac', 'Davidson', 'SF', 3, 198, 1997, 'NZL'),
                p('Josef', 'Potoček', 'SF', 3, 196, 1996, 'CZE'),
                p('Kimani', 'Lawrence', 'PF', 4, 201, 1998, 'USA'),
                p('Ahmad', 'Rand', 'PF', 3, 202, 1998, 'USA'),
                p('Ladislav', 'Pecka', 'PF', 3, 197, 1991, 'CZE'),
                p('David', 'Žikla', 'PF', 3, null, 1998, 'CZE'),
                p('Adam', 'Pecháček', 'C', 3, 207, 1995, 'CZE'),
            ],
        },
        {
            id: 'OPA', abbr: 'OPA', name: 'BK Opava', shortName: 'Opava', city: 'Opava',
            primary: hex('#FFD200'), secondary: hex('#003DA5'), arenaName: 'Víceúčelová hala Opava', arenaCapacity: 2154, tier: 3,
            roster: [
                p('Jakub', 'Šiřina', 'PG', 4, 185, 1987, 'CZE'),
                p('Radovan', 'Kouřil', 'PG', 4, null, 1995, 'CZE'),
                p('Wesley', 'Person Jr', 'SG', 5, null, 1995, 'USA'),
                p('Isaiah', 'Gray', 'SG', 3, null, 2001, 'USA'),
                p('Marek', 'Vyroubal', 'SG', 3, null, 2001, 'CZE'),
                p('Kryštof', 'Kavan', 'SG', 3, 198, 2002, 'CZE'),
                p('Luděk', 'Jurečka', 'SF', 3, 195, 1983, 'CZE'),
                p('Jan', 'Švandrlík', 'SF', 3, 201, 1994, 'CZE'),
                p('Jakub', 'Slavík', 'SF', 2, null, 1999, 'CZE'),
                p('Filip', 'Zbránek', 'PF', 3, 196, 1990, 'CZE'),
                p('Clevon', 'Brown', 'PF', 4, 203, 1998, 'USA'),
                p('Šimon', 'Puršl', 'C', 3, 206, 1997, 'CZE'),
                p('David', 'Motyčka', 'C', 2, null, 2006, 'CZE'),
            ],
        },
        {
            id: 'PIS', abbr: 'PIS', name: 'Sršni Photomate Písek', shortName: 'Písek', city: 'Písek',
            primary: hex('#FFCC00'), secondary: hex('#1A1A1A'), arenaName: 'Sportovní hala Písek', arenaCapacity: null, tier: 3,
            roster: [
                p('Vojtěch', 'Sýkora', 'PG', 4, null, 2001, 'CZE'),
                p('Matěj', 'Burda', 'PG', 2, null, 2001, 'CZE'),
                p('Jakub', 'Šurý', 'PG', 2, null, 2002, 'CZE'),
                p('Josef', 'Svoboda', 'SG', 2, null, 2005, 'CZE'),
                p('Kevin', 'Týml', 'SF', 5, 195, 2001, 'CZE'),
                p('Petr', 'Šlechta', 'SF', 3, null, 1995, 'CZE'),
                p('Dalibor', 'Fait', 'SF', 3, null, 1993, 'CZE'),
                p('Matyáš', 'Ježek', 'SF', 2, null, 2005, 'CZE'),
                p('Martin', 'Svoboda', 'PF', 4, null, 2001, 'CZE'),
                p('Jan', 'Karlovský', 'PF', 4, null, 1999, 'CZE'),
                p('Michal', 'Kozák', 'C', 3, null, 1998, 'CZE'),
                p('Ondřej', 'Klement', 'C', 2, null, 2006, 'CZE'),
            ],
        },
        {
            id: 'DEC', abbr: 'DEC', name: 'BK ARMEX ENERGY Děčín', shortName: 'Děčín', city: 'Děčín',
            primary: hex('#0057B8'), secondary: hex('#FFFFFF'), arenaName: 'Sportovní hala Děčín', arenaCapacity: 1047, tier: 3,
            roster: [
                p('Al-Amir', 'Dawes', 'PG', 4, null, 2000, 'USA'),
                p('Lukáš', 'Feštr', 'PG', 3, null, 1994, 'CZE'),
                p('Tadeáš', 'Slowiak', 'SG', 3, 200, 2004, 'CZE'),
                p('Lloyd', 'Bryan Jr', 'SG', 3, null, 1999, 'USA'),
                p('Jaden', 'Dewar', 'SF', 4, null, 1999, 'CAN'),
                p('Filip', 'Kroutil', 'SF', 3, null, 1996, 'CZE'),
                p('Michal', 'Grill', 'SF', 2, 196, 2006, 'CZE'),
                p('Oleksandr', 'Belikov', 'SF', 3, null, 1992, 'UKR'),
                p('Tomáš', 'Pomikálek', 'PF', 4, 200, 1989, 'CZE'),
                p('Jan', 'Štěrba', 'PF', 3, null, 1995, 'CZE'),
                p('Oliver', 'Žižka', 'C', 3, 202, 2005, 'CZE'),
                p('Maksim', 'Šturanović', 'C', 3, 209, 1988, 'SRB'),
            ],
        },
        {
            id: 'OST', abbr: 'OST', name: 'NH Ostrava', shortName: 'Ostrava', city: 'Ostrava',
            primary: hex('#0072CE'), secondary: hex('#FFFFFF'), arenaName: 'Sportovní hala NH Ostrava', arenaCapacity: 1200, tier: 2,
            roster: [
                p('Adam', 'Číž', 'PG', 3, null, 1991, 'CZE'),
                p('Mikuláš', 'Čank', 'PG', 1, null, 2006, 'CZE'),
                p('Lynn', 'Greer III', 'SG', 4, null, 2002, 'USA'),
                p('Keenon', 'Cole', 'SG', 4, null, 2000, 'USA'),
                p('Matěj', 'Snopek', 'SG', 3, 195, 2000, 'CZE'),
                p('Lukáš', 'Palyza', 'SF', 4, 200, 1989, 'CZE'),
                p('Michal', 'Svoboda', 'SF', 3, 190, 1999, 'CZE'),
                p('Pavel', 'Novák', 'SF', 2, null, 2002, 'CZE'),
                p('Matyáš', 'Janů', 'SF', 2, null, 2002, 'CZE'),
                p('Adam', 'Ivánek', 'PF', 2, null, 2004, 'CZE'),
                p('Julian', 'Roche', 'C', 3, null, 1997, null),
                p('Samuel', 'Godwin', 'C', 3, null, 2001, 'USA'),
                p('Dominik', 'Heinzl', 'C', 3, 203, 1995, 'CZE'),
            ],
        },
        {
            id: 'OLO', abbr: 'OLO', name: 'BK Olomoucko', shortName: 'Olomoucko', city: 'Olomouc',
            primary: hex('#1E5AA8'), secondary: hex('#FFFFFF'), arenaName: 'Sportovní hala Olomouc', arenaCapacity: 2000, tier: 2,
            roster: [
                p('Ondřej', 'Šiška', 'PG', 3, 190, 1993, 'CZE'),
                p('Marek', 'Půlpán', 'PG', 2, 191, 2004, 'CZE'),
                p('Lamb', 'Autrey', 'PG', 3, 193, 1989, 'USA'),
                p('Kobe', 'Elvis', 'SG', 5, null, 2001, 'CAN'),
                p('Jaren', 'Holmes', 'SG', 4, null, 1998, 'USA'),
                p('Adam', 'Goga', 'SG', 3, 197, 1997, 'CZE'),
                p('Marek', 'Nelson', 'SG', 3, 200, 1999, 'USA'),
                p('Jonathan', 'Andre', 'SF', 4, 200, 1997, 'USA'),
                p('Jiří', 'Svojanovský', 'SF', 2, 194, 2002, 'CZE'),
                p('Jordan', 'Oupoh', 'PF', 2, 196, 2005, 'CZE'),
                p('Miroslav', 'Kvapil', 'PF', 3, 202, 1993, 'CZE'),
                p('Dominik', 'Žák', 'PF', 3, 201, 2001, 'CZE'),
                p('Kyler', 'Filewich', 'C', 4, 206, 2001, 'CAN'),
            ],
        },
        {
            id: 'USK', abbr: 'USK', name: 'USK Praha', shortName: 'USK Praha', city: 'Praha',
            primary: hex('#0D4F9E'), secondary: hex('#FFFFFF'), arenaName: 'Sportovní hala USK', arenaCapacity: 1065, tier: 2,
            roster: [
                p('David', 'Látal', 'PG', 2, 181, 2005, 'CZE'),
                p('Matěj', 'Šafařík', 'PG', 3, 188, 2003, 'CZE'),
                p('Ondřej', 'Švec', 'SG', 3, 199, 2003, 'CZE'),
                p('Jalen', 'Montgomery', 'SG', 4, 194, 2001, 'USA'),
                p('Terry', 'Henderson Jr', 'SG', 4, 194, 1994, 'USA'),
                p('Adam', 'Kolář', 'SG', 2, 183, 2005, 'CZE'),
                p('Tomáš', 'Palas', 'SF', 2, 195, 2004, 'CZE'),
                p('Dalibor', 'Vlk', 'SF', 3, 202, 2002, 'CZE'),
                p('Touko', 'Tainamo', 'PF', 3, 204, 2001, 'FIN'),
                p('Hameir', 'Wright', 'PF', 3, null, 1999, 'USA'),
                p('João Eduardo', 'Cortesão', 'PF', 3, 200, 2002, null),
                p('František', 'Fuxa', 'C', 3, 205, 2000, 'CZE'),
                p('Samuel', 'Macht', 'C', 1, 203, 2006, 'CZE'),
            ],
        },
        {
            id: 'SLA', abbr: 'SLA', name: 'SK Slavia Praha ERA NBK', shortName: 'Slavia Praha', city: 'Praha',
            primary: hex('#E4002B'), secondary: hex('#FFFFFF'), arenaName: 'Sportovní hala Slavia', arenaCapacity: 1980, tier: 2,
            roster: [
                p('Radovan', 'Mrázek', 'PG', 2, null, 2004, 'CZE'),
                p('Jakub', 'Mršťák', 'PG', 2, null, 2006, 'CZE'),
                p('Ricky', 'Clemons', 'SG', 4, null, 2000, 'USA'),
                p('Rubin', 'Jones', 'SG', 5, null, 2001, 'USA'),
                p('Matěj', 'Dáňa', 'SG', 2, null, 2003, 'CZE'),
                p('Vojtěch', 'Zeithammer', 'SG', 2, null, 2005, 'CZE'),
                p('Jan', 'Matušík', 'SF', 1, null, 2006, 'CZE'),
                p('Matyáš', 'Kraut', 'SF', 1, null, 2005, 'CZE'),
                p('Petr', 'Macháč', 'PF', 3, null, 1999, 'CZE'),
                p('Meshack', 'Lufile', 'C', 3, null, 1992, 'CAN'),
                p('Nikolaos', 'Noumeros', 'C', 3, null, 2001, 'GRE'),
                p('Filip', 'Petružela', 'C', 3, null, 1997, 'CZE'),
            ],
        },
        {
            id: 'HKR', abbr: 'HKR', name: 'BK GAPA Hradec Králové', shortName: 'Hradec Král.', city: 'Hradec Králové',
            primary: hex('#1A1A1A'), secondary: hex('#F47920'), arenaName: 'Sportovní hala HK', arenaCapacity: 700, tier: 1,
            roster: [
                p('Pedja', 'Stamenković', 'PG', 3, null, 1988, 'SRB'),
                p('Tomáš', 'Dvořák', 'PG', 2, 187, 2002, 'CZE'),
                p('Kareem', 'Brewton', 'SG', 3, null, 1995, 'USA'),
                p('Jan', 'Bubeníček', 'SG', 1, null, 2005, 'CZE'),
                p('Tomáš', 'Merta', 'SF', 2, null, 2001, 'CZE'),
                p('Tomáš', 'Tkadlec', 'SF', 2, 190, 1999, 'CZE'),
                p('Matija', 'Popović', 'SF', 2, null, 1996, 'SRB'),
                p('David', 'Škranc', 'PF', 3, 203, 1996, 'CZE'),
                p('Tomáš', 'Mikyska', 'PF', 2, null, 2000, 'CZE'),
                p('Martin', 'Roub', 'C', 4, null, 1997, 'CZE'),
            ],
        },
    ]),
});

export type LeagueConfig = typeof leagueConfig;
