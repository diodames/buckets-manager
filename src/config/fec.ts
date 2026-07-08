import { fecRostersByTeamId } from '../data/fecRosters.data';
import type { RealPlayerDef } from './league';

// FIBA Europe Cup config: teams, format, and prize money.
// Modelled on the 2025-26 FIBA Europe Cup season.
// Real rosters live in src/data/fecRosters.data.ts (npm run rosters:scrape).
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

function fecTeam(
    id: string,
    abbr: string,
    name: string,
    shortName: string,
    city: string,
    country: string,
    tier: number,
    arenaCapacity: number,
    nblTeamId?: string,
): FecTeamDef {
    const roster: RealPlayerDef[] = nblTeamId ? [] : [...(fecRostersByTeamId[id] ?? [])];
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
        entry: 210_000,
        groupStage: 315_000,
        secondRound: 420_000,
        quarterFinals: 630_000,
        semiFinals: 1_050_000,
        playoffWin: 105_000,
        championBonus: 2_100_000,
    }),
    knockoutWinsNeeded: Object.freeze([2, 2, 2]),
    teams: Object.freeze<FecTeamDef[]>([
        fecTeam('FEC-SBB', 'SBB', 'Surne Bilbao Basket', 'Bilbao', 'Bilbao', 'ESP', 5, 10000),
        fecTeam('FEC-PBC', 'PBC', 'PAOK BC', 'PAOK', 'Thessaloniki', 'GRE', 5, 8000),
        fecTeam('FEC-SZOM', 'SZOM', 'Falco-Vulcano Energia KC', 'Szombathely', 'Szombathely', 'HUN', 4, 3500),
        fecTeam('FEC-UCAM', 'UCAM', 'UCAM Murcia', 'Murcia', 'Murcia', 'ESP', 4, 7000),
        fecTeam('FEC-REG', 'REG', 'Reggiana', 'Reggiana', 'Reggio Emilia', 'ITA', 4, 4500),
        fecTeam('FEC-BOSN', 'BOSN', 'Basketball Lowen Braunschweig', 'Braunschweig', 'Braunschweig', 'GER', 3, 6000),
        fecTeam('FEC-PTKM', 'PTKM', 'Prometey', 'Prometey', 'Samsun', 'UKR', 4, 3000),
        fecTeam('FEC-PERI', 'PERI', 'Peristeri BC', 'Peristeri', 'Athens', 'GRE', 3, 4000),
        fecTeam('FEC-ROST', 'ROST', 'Rostock Seawolves', 'Seawolves', 'Rostock', 'GER', 3, 3500),
        fecTeam('FEC-TREFL', 'TREFL', 'Trefl Sopot', 'Trefl', 'Sopot', 'POL', 3, 4000),
        fecTeam('FEC-CDJ', 'CDJ', 'Club Joventut Badalona', 'Joventut', 'Badalona', 'ESP', 3, 5000),
        fecTeam('FEC-ORA', 'ORA', 'Ora Basket Verona', 'Verona', 'Verona', 'ITA', 3, 3500),
        fecTeam('FEC-BCPD', 'BCPD', 'Basketball Club Porto', 'Porto', 'Porto', 'POR', 3, 3000),
        fecTeam('FEC-SCP', 'SCP', 'Sporting CP', 'Sporting', 'Lisbon', 'POR', 3, 4000),
        fecTeam('FEC-DSS', 'DSS', 'Dinamo Sassari', 'Sassari', 'Sassari', 'ITA', 3, 3500),
        fecTeam('FEC-CZGZ', 'CZGZ', 'CZ.Academia Zagreb', 'Zagreb', 'Zagreb', 'CRO', 3, 3000),
        fecTeam('FEC-LUBL', 'LUBL', 'LUB Baskets', 'Lublin', 'Lublin', 'POL', 3, 3000),
        fecTeam('FEC-VAL', 'VAL', 'Valencia Basket', 'Valencia', 'Valencia', 'ESP', 4, 9000),
        fecTeam('FEC-KUT', 'KUT', 'Kutaisi', 'Kutaisi', 'Kutaisi', 'GEO', 2, 2500),
        fecTeam('FEC-BRN', 'BRN', 'BK Decin', 'Decin', 'Decin', 'CZE', 3, 2000, 'BRN'),
        fecTeam('FEC-ANO', 'ANO', 'Anorthosis Famagusta', 'Anorthosis', 'Nicosia', 'CYP', 2, 2000),
        fecTeam('FEC-BEARS', 'BEARS', 'Bears Academy', 'Bears', 'Tartu', 'EST', 2, 2000),
        fecTeam('FEC-KALEV', 'KALEV', 'Kalev/Cramo', 'Kalev', 'Tallinn', 'EST', 2, 2500),
        fecTeam('FEC-NFT', 'NFT', 'Neftchi IK', 'Neftchi', 'Baku', 'AZE', 2, 2000),
        fecTeam('FEC-ABSBK', 'ABSBK', 'Absheron', 'Absheron', 'Baku', 'AZE', 2, 2000),
        fecTeam('FEC-CIBO', 'CIBO', 'Cibona', 'Cibona', 'Zagreb', 'CRO', 2, 3500),
        fecTeam('FEC-JDA', 'JDA', 'JDA Dijon', 'Dijon', 'Dijon', 'FRA', 2, 3000),
        fecTeam('FEC-BASHK', 'BASHK', 'Bashkimi', 'Bashkimi', 'Prizren', 'KOS', 2, 2000),
        fecTeam('FEC-PELI', 'PELI', 'Pelister', 'Pelister', 'Bitola', 'MKD', 2, 2000),
        fecTeam('FEC-KER', 'KER', 'Keravnos', 'Keravnos', 'Strovolos', 'CYP', 2, 2000),
        fecTeam('FEC-AEK', 'AEK', 'AEK Larnaca', 'AEK', 'Larnaca', 'CYP', 2, 2500),
        fecTeam('FEC-CSMBV', 'CSMBV', 'CSM Targoviste', 'Targoviste', 'Targoviste', 'ROU', 2, 2000),
        fecTeam('FEC-ANTW', 'ANTW', 'Antwerp Giants', 'Antwerp', 'Antwerp', 'BEL', 2, 2500),
        fecTeam('FEC-FCP', 'FCP', 'FCP Porto', 'FCP', 'Porto', 'POR', 2, 2500),
        fecTeam('FEC-TARTU', 'TARTU', 'Tartu Ulikool', 'Tartu', 'Tartu', 'EST', 2, 2000),
        fecTeam('FEC-RIL', 'RIL', 'Rilski Sportist', 'Rilski', 'Samokov', 'BUL', 2, 2000),
        fecTeam('FEC-ANWIL', 'ANWIL', 'Anwil Wloclawek', 'Anwil', 'Wloclawek', 'POL', 3, 4000),
        fecTeam('FEC-BLBB', 'BLBB', 'Basketball Lowen Berlin', 'Berlin', 'Berlin', 'GER', 3, 5000),
        fecTeam('FEC-TREP', 'TREP', 'Trefl Sopot II', 'Trefl B', 'Sopot', 'POL', 2, 2000),
        fecTeam('FEC-RASTA', 'RASTA', 'Rasta Vechta', 'Vechta', 'Vechta', 'GER', 3, 3500),
        fecTeam('FEC-BAL', 'BAL', 'Balkan Botevgrad', 'Botevgrad', 'Botevgrad', 'BUL', 2, 2000),
        fecTeam('FEC-PARNU', 'PARNU', 'Parnu Sadam', 'Parnu', 'Parnu', 'EST', 2, 1500),
        fecTeam('FEC-DNI', 'DNI', 'Dnipro', 'Dnipro', 'Dnipro', 'UKR', 2, 2000),
        fecTeam('FEC-KANG', 'KANG', 'Kangoeroes', 'Kangoeroes', 'Mechelen', 'BEL', 2, 2000),
    ]),
});

export type FecConfig = typeof fecConfig;
