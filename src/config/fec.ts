import type { RealPlayerDef } from './league';

// FIBA Europe Cup config: teams, format, and prize money.
// Modelled on the 2025-26 FIBA Europe Cup season.
// Prize amounts in CZK (EUR x 25).

export interface FecTeamDef {
    id: string;
    abbr: string;
    name: string;
    shortName: string;
    city: string;
    country: string;
    primary: { r: number; g: number; b: number };
    secondary: { r: number; g: number; b: number };
    arenaName: string;
    arenaCapacity: number;
    tier: number;
    roster: RealPlayerDef[];
    nblTeamId?: string;
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

function fecTeam(
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
): FecTeamDef {
    const def: FecTeamDef = {
        id, abbr, name, shortName, city, country,
        primary: { r: 40, g: 40, b: 40 },
        secondary: { r: 200, g: 200, b: 200 },
        arenaName: `${shortName} Arena`,
        arenaCapacity,
        tier,
        roster,
    };
    if (nblTeamId) {
        def.nblTeamId = nblTeamId;
    }
    return def;
}

export const fecConfig = Object.freeze({
    czechQualifiers: 1,
    regularSeasonTeams: 40,
    regularSeasonGroups: 10,
    teamsPerGroup: 4,
    groupGamesPerTeam: 6,
    secondRoundGroups: 4,
    secondRoundTeams: 16,
    // FEC weeks on alternate midweek slots (offset from BCL).
    groupWeeks: Object.freeze([3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25]),
    prizes: Object.freeze({
        entry: 300_000,
        groupStage: 450_000,
        secondRound: 600_000,
        quarterFinals: 900_000,
        semiFinals: 1_500_000,
        playoffWin: 150_000,
        championBonus: 3_000_000,
    }),
    knockoutWinsNeeded: Object.freeze([2, 2, 2]),
    teams: Object.freeze<FecTeamDef[]>([
        fecTeam('FEC-SBB', 'SBB', 'Surne Bilbao Basket', 'Bilbao', 'Bilbao', 'ESP', 5, 10000, [
            p('Tomas', 'Hlinason', 'PG', 4, 188, 1998, 'ISL'),
            p('Luca', 'Vildoza', 'SG', 4, 191, 1995, 'ARG'),
            p('Matt', 'Hilliard', 'SF', 5, 198, 1993, 'USA'),
        ]),
        fecTeam('FEC-PBC', 'PBC', 'PAOK BC', 'PAOK', 'Thessaloniki', 'GRE', 5, 8000, [
            p('Breein', 'Tyree', 'PG', 5, 185, 1997, 'USA'),
            p('Patrick', 'Beverley', 'SG', 5, 191, 1988, 'USA'),
            p('Georgios', 'Bogris', 'C', 4, 208, 1989, 'GRE'),
        ]),
        fecTeam('FEC-SZOM', 'SZOM', 'Falco-Vulcano Energia KC', 'Szombathely', 'Szombathely', 'HUN', 4, 3500, [
            p('Zoltan', 'Perl', 'SG', 5, 193, 1992, 'HUN'),
            p('Mikael', 'Hopkins', 'C', 4, 208, 1994, 'USA'),
        ]),
        fecTeam('FEC-UCAM', 'UCAM', 'UCAM Murcia', 'Murcia', 'Murcia', 'ESP', 4, 7000, [
            p('Alex', 'Renfroe', 'PG', 4, 188, 1987, 'USA'),
            p('Sadiel', 'Roca', 'SF', 4, 201, 2000, 'CUB'),
        ]),
        fecTeam('FEC-REG', 'REG', 'Reggiana', 'Reggiana', 'Reggio Emilia', 'ITA', 4, 4500, [
            p('Tyler', 'Ennis', 'PG', 4, 191, 1994, 'CAN'),
            p('Gabriele', 'Procida', 'SF', 4, 200, 2002, 'ITA'),
        ]),
        fecTeam('FEC-BOSN', 'BOSN', 'Basketball Lowen Braunschweig', 'Braunschweig', 'Braunschweig', 'GER', 3, 6000, [
            p('Edin', 'Atic', 'SG', 4, 196, 1996, 'BIH'),
            p('Kameron', 'Taylor', 'SF', 4, 201, 1994, 'USA'),
        ]),
        fecTeam('FEC-PTKM', 'PTKM', 'Prometey', 'Prometey', 'Samsun', 'UKR', 4, 3000, [
            p('Yannick', 'Franke', 'SG', 5, 196, 1994, 'NED'),
            p('Ousman', 'Krubally', 'PF', 4, 203, 1988, 'GAM'),
        ]),
        fecTeam('FEC-PERI', 'PERI', 'Peristeri BC', 'Peristeri', 'Athens', 'GRE', 3, 4000, [
            p('Jake', 'Van Tubbergen', 'SF', 4, 201, 1997, 'CAN'),
            p('Ty', 'Nichols', 'SG', 4, 193, 1998, 'USA'),
        ]),
        fecTeam('FEC-ROST', 'ROST', 'Rostock Seawolves', 'Seawolves', 'Rostock', 'GER', 3, 3500, [
            p('Owen', 'Klassen', 'C', 4, 213, 1994, 'CAN'),
            p('Will', 'Clyburn', 'SF', 4, 201, 1989, 'USA'),
        ]),
        fecTeam('FEC-TREFL', 'TREFL', 'Trefl Sopot', 'Trefl', 'Sopot', 'POL', 3, 4000, [
            p('Jakub', 'Schenk', 'PG', 4, 188, 1997, 'POL'),
            p('A.J.', 'Slaughter', 'SG', 4, 191, 1988, 'USA'),
        ]),
        fecTeam('FEC-CDJ', 'CDJ', 'Club Joventut Badalona', 'Joventut', 'Badalona', 'ESP', 3, 5000, [
            p('Nicolas', 'Laprovittola', 'PG', 4, 180, 1990, 'ARG'),
        ]),
        fecTeam('FEC-ORA', 'ORA', 'Ora Basket Verona', 'Verona', 'Verona', 'ITA', 3, 3500, [
            p('Stefano', 'Gentile', 'PG', 4, 188, 1998, 'ITA'),
        ]),
        fecTeam('FEC-BCPD', 'BCPD', 'Basketball Club Porto', 'Porto', 'Porto', 'POR', 3, 3000, [
            p('Naje', 'Smith', 'C', 4, 208, 1998, 'USA'),
        ]),
        fecTeam('FEC-SCP', 'SCP', 'Sporting CP', 'Sporting', 'Lisbon', 'POR', 3, 4000, [
            p('Brandon', 'Johns', 'PF', 4, 203, 1998, 'USA'),
        ]),
        fecTeam('FEC-DSS', 'DSS', 'Dinamo Sassari', 'Sassari', 'Sassari', 'ITA', 3, 3500, [
            p('Marco', 'Belinelli', 'SG', 4, 196, 1986, 'ITA'),
        ]),
        fecTeam('FEC-CZGZ', 'CZGZ', 'CZ.Academia Zagreb', 'Zagreb', 'Zagreb', 'CRO', 3, 3000, [
            p('Marco', 'Spissu', 'PG', 4, 185, 1995, 'ITA'),
        ]),
        fecTeam('FEC-LUBL', 'LUBL', 'LUB Baskets', 'Lublin', 'Lublin', 'POL', 3, 3000, [
            p('A.J.', 'Hampton', 'PG', 4, 191, 2000, 'USA'),
        ]),
        fecTeam('FEC-VAL', 'VAL', 'Valencia Basket', 'Valencia', 'Valencia', 'ESP', 4, 9000, [
            p('Chris', 'Jones', 'PG', 4, 185, 1993, 'USA'),
        ]),
        fecTeam('FEC-KUT', 'KUT', 'Kutaisi', 'Kutaisi', 'Kutaisi', 'GEO', 2, 2500, [
            p('Tornike', 'Shengelia', 'SF', 4, 203, 1991, 'GEO'),
        ]),
        fecTeam('FEC-BRN', 'BRN', 'BK Decin', 'Decin', 'Decin', 'CZE', 3, 2000, [], 'BRN'),
        fecTeam('FEC-ANO', 'ANO', 'Anorthosis Famagusta', 'Anorthosis', 'Nicosia', 'CYP', 2, 2000, [
            p('Anthony', 'Lee', 'PF', 3, 203, 1990, 'USA'),
        ]),
        fecTeam('FEC-BEARS', 'BEARS', 'Bears Academy', 'Bears', 'Tartu', 'EST', 2, 2000, [
            p('Kristjan', 'Kullamae', 'SG', 3, 196, 1999, 'EST'),
        ]),
        fecTeam('FEC-KALEV', 'KALEV', 'Kalev/Cramo', 'Kalev', 'Tallinn', 'EST', 2, 2500, [
            p('Martin', 'Paasoja', 'SG', 3, 193, 1993, 'EST'),
        ]),
        fecTeam('FEC-NFT', 'NFT', 'Neftchi IK', 'Neftchi', 'Baku', 'AZE', 2, 2000, [
            p('Rashad', 'Wright', 'PG', 3, 188, 1987, 'USA'),
        ]),
        fecTeam('FEC-ABSBK', 'ABSBK', 'Absheron', 'Absheron', 'Baku', 'AZE', 2, 2000, [
            p('Adrian', 'Banks', 'SG', 3, 191, 1984, 'USA'),
        ]),
        fecTeam('FEC-CIBO', 'CIBO', 'Cibona', 'Cibona', 'Zagreb', 'CRO', 2, 3500, [
            p('Filip', 'Kraljevic', 'C', 3, 213, 1999, 'CRO'),
        ]),
        fecTeam('FEC-JDA', 'JDA', 'JDA Dijon', 'Dijon', 'Dijon', 'FRA', 2, 3000, [
            p('David', 'Holston', 'PG', 3, 175, 1986, 'USA'),
        ]),
        fecTeam('FEC-BASHK', 'BASHK', 'Bashkimi', 'Bashkimi', 'Prizren', 'KOS', 2, 2000, [
            p('Malik', 'Newman', 'SG', 3, 191, 1997, 'USA'),
        ]),
        fecTeam('FEC-PELI', 'PELI', 'Pelister', 'Pelister', 'Bitola', 'MKD', 2, 2000, [
            p('Damjan', 'Stojanovski', 'SF', 3, 200, 1986, 'MKD'),
        ]),
        fecTeam('FEC-KER', 'KER', 'Keravnos', 'Keravnos', 'Strovolos', 'CYP', 2, 2000, [
            p('Anthony', 'King', 'PF', 3, 203, 1985, 'USA'),
        ]),
        fecTeam('FEC-AEK', 'AEK', 'AEK Larnaca', 'AEK', 'Larnaca', 'CYP', 2, 2500, [
            p('Josh', 'Owens', 'PF', 3, 201, 1990, 'USA'),
        ]),
        fecTeam('FEC-CSMBV', 'CSMBV', 'CSM Targoviste', 'Targoviste', 'Targoviste', 'ROU', 2, 2000, [
            p('Brandon', 'Jefferson', 'PG', 3, 185, 1993, 'USA'),
        ]),
        fecTeam('FEC-ANTW', 'ANTW', 'Antwerp Giants', 'Antwerp', 'Antwerp', 'BEL', 2, 2500, [
            p('Jean-Marc', 'Mwika', 'PF', 3, 203, 1998, 'BEL'),
        ]),
        fecTeam('FEC-FCP', 'FCP', 'FCP Porto', 'FCP', 'Porto', 'POR', 2, 2500, [
            p('Mario', 'Galeta', 'SG', 3, 193, 1995, 'CRO'),
        ]),
        fecTeam('FEC-TARTU', 'TARTU', 'Tartu Ulikool', 'Tartu', 'Tartu', 'EST', 2, 2000, [
            p('Janari', 'Joesaar', 'PF', 3, 203, 1993, 'EST'),
        ]),
        fecTeam('FEC-RIL', 'RIL', 'Rilski Sportist', 'Rilski', 'Samokov', 'BUL', 2, 2000, [
            p('Brandon', 'Duverge', 'SG', 3, 193, 1996, 'DOM'),
        ]),
        fecTeam('FEC-ANWIL', 'ANWIL', 'Anwil Wloclawek', 'Anwil', 'Wloclawek', 'POL', 3, 4000, [
            p('Kamil', 'Luczak', 'PG', 3, 188, 1998, 'POL'),
        ]),
        fecTeam('FEC-BLBB', 'BLBB', 'Basketball Lowen Berlin', 'Berlin', 'Berlin', 'GER', 3, 5000, [
            p('Jaleen', 'Smith', 'PG', 3, 188, 1995, 'USA'),
        ]),
        fecTeam('FEC-TREP', 'TREP', 'Trefl Sopot II', 'Trefl B', 'Sopot', 'POL', 2, 2000, [
            p('Kamil', 'Luczak', 'PG', 3, 188, 1998, 'POL'),
        ]),
        fecTeam('FEC-RASTA', 'RASTA', 'Rasta Vechta', 'Vechta', 'Vechta', 'GER', 3, 3500, [
            p('Tyler', 'Larson', 'PG', 3, 188, 1992, 'USA'),
        ]),
        fecTeam('FEC-BAL', 'BAL', 'Balkan Botevgrad', 'Botevgrad', 'Botevgrad', 'BUL', 2, 2000, [
            p('Brandon', 'Duverge', 'SG', 3, 193, 1996, 'DOM'),
        ]),
        fecTeam('FEC-PARNU', 'PARNU', 'Parnu Sadam', 'Parnu', 'Parnu', 'EST', 2, 1500, [
            p('Janari', 'Joesaar', 'PF', 3, 203, 1993, 'EST'),
        ]),
        fecTeam('FEC-DNI', 'DNI', 'Dnipro', 'Dnipro', 'Dnipro', 'UKR', 2, 2000, [
            p('Ousman', 'Krubally', 'PF', 3, 203, 1988, 'GAM'),
        ]),
        fecTeam('FEC-KANG', 'KANG', 'Kangoeroes', 'Kangoeroes', 'Mechelen', 'BEL', 2, 2000, [
            p('Jean-Marc', 'Mwika', 'PF', 3, 203, 1998, 'BEL'),
        ]),
    ]),
});

export type FecConfig = typeof fecConfig;
