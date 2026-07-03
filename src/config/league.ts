import type { Rgb } from './palette';

// Fictional Czech basketball league. Team ids are stable; display names have
// cs/en variants resolved by the UI at render time.
export interface TeamDef {
    id: string;
    abbr: string;
    cityCs: string;
    cityEn: string;
    nameCs: string;
    nameEn: string;
    primary: Rgb;
    secondary: Rgb;
}

export const leagueConfig = Object.freeze({
    playersPerTeam: 12,
    // Double round-robin: every pair meets twice (home and away).
    roundRobinLegs: 2,
    startingSeasonYear: 2026,
    teams: Object.freeze<TeamDef[]>([
        { id: 'PRG', abbr: 'PRG', cityCs: 'Praha', cityEn: 'Prague', nameCs: 'Sokoli', nameEn: 'Falcons', primary: { r: 200, g: 40, b: 40 }, secondary: { r: 255, g: 216, b: 80 } },
        { id: 'BRN', abbr: 'BRN', cityCs: 'Brno', cityEn: 'Brno', nameCs: 'Draci', nameEn: 'Dragons', primary: { r: 40, g: 96, b: 200 }, secondary: { r: 255, g: 255, b: 255 } },
        { id: 'OVA', abbr: 'OVA', cityCs: 'Ostrava', cityEn: 'Ostrava', nameCs: 'Haviri', nameEn: 'Miners', primary: { r: 32, g: 32, b: 40 }, secondary: { r: 255, g: 176, b: 32 } },
        { id: 'PLZ', abbr: 'PLZ', cityCs: 'Plzen', cityEn: 'Pilsen', nameCs: 'Vlci', nameEn: 'Wolves', primary: { r: 96, g: 96, b: 112 }, secondary: { r: 64, g: 192, b: 255 } },
        { id: 'LIB', abbr: 'LIB', cityCs: 'Liberec', cityEn: 'Liberec', nameCs: 'Jestedi', nameEn: 'Lynx', primary: { r: 48, g: 128, b: 88 }, secondary: { r: 255, g: 255, b: 255 } },
        { id: 'OLO', abbr: 'OLO', cityCs: 'Olomouc', cityEn: 'Olomouc', nameCs: 'Orli', nameEn: 'Eagles', primary: { r: 120, g: 64, b: 168 }, secondary: { r: 255, g: 216, b: 80 } },
        { id: 'HKR', abbr: 'HKR', cityCs: 'Hradec Kralove', cityEn: 'Hradec Kralove', nameCs: 'Lvi', nameEn: 'Lions', primary: { r: 224, g: 128, b: 32 }, secondary: { r: 32, g: 32, b: 40 } },
        { id: 'CBU', abbr: 'CBU', cityCs: 'Ceske Budejovice', cityEn: 'Budweis', nameCs: 'Sumci', nameEn: 'Catfish', primary: { r: 32, g: 120, b: 136 }, secondary: { r: 200, g: 208, b: 224 } },
        { id: 'ZLN', abbr: 'ZLN', cityCs: 'Zlin', cityEn: 'Zlin', nameCs: 'Rysi', nameEn: 'Bobcats', primary: { r: 168, g: 144, b: 48 }, secondary: { r: 32, g: 32, b: 40 } },
        { id: 'PCE', abbr: 'PCE', cityCs: 'Pardubice', cityEn: 'Pardubice', nameCs: 'Hrebci', nameEn: 'Stallions', primary: { r: 152, g: 32, b: 64 }, secondary: { r: 255, g: 255, b: 255 } },
        { id: 'UST', abbr: 'UST', cityCs: 'Usti nad Labem', cityEn: 'Usti', nameCs: 'Pirati', nameEn: 'Pirates', primary: { r: 24, g: 40, b: 96 }, secondary: { r: 224, g: 72, b: 72 } },
        { id: 'KVA', abbr: 'KVA', cityCs: 'Karlovy Vary', cityEn: 'Karlsbad', nameCs: 'Vridla', nameEn: 'Geysers', primary: { r: 40, g: 160, b: 168 }, secondary: { r: 255, g: 200, b: 64 } },
    ]),
});

export type LeagueConfig = typeof leagueConfig;
