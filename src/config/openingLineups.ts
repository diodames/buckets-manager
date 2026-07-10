import type { Position } from '../core/model/types';
import { POSITIONS } from '../core/model/types';

/** Preferred starter identity for one position (matched after name fixes). */
export interface PreferredStarter {
    lastName: string;
    /** Disambiguate common surnames (e.g. Svoboda). */
    firstName?: string;
}

/**
 * End-of-season / late-playoff starting fives for Maxa NBL 2025/26.
 * Matched by name against the opening roster; missing names fall back to OVR.
 *
 * Sources: nbl.basketball season minutes + finals/semifinal box scores
 * (Nymburk–Pardubice finals; Brno/Opava playoff rotations).
 */
export const nblOpeningLineups: Readonly<Record<string, Readonly<Record<Position, PreferredStarter>>>> =
    Object.freeze({
        // Finals rotation: Sehnal / Perkins / Bohačík with Shumate + Santos-Silva.
        NYM: Object.freeze({
            PG: Object.freeze({ lastName: 'Sehnal' }),
            SG: Object.freeze({ lastName: 'Perkins' }),
            SF: Object.freeze({ lastName: 'Bohačík' }),
            PF: Object.freeze({ lastName: 'Shumate' }),
            C: Object.freeze({ lastName: 'Santos-Silva' }),
        }),
        PCE: Object.freeze({
            PG: Object.freeze({ lastName: 'Tůma' }),
            SG: Object.freeze({ lastName: 'Evans' }),
            SF: Object.freeze({ lastName: 'Moffatt' }),
            PF: Object.freeze({ lastName: 'Kovář' }),
            C: Object.freeze({ lastName: 'Švrdlík' }),
        }),
        // Williams left for Hamburg (Dec 2025); Groves also departed mid-season.
        // Playoff-era five from late NBL minutes / Brno–Pardubice series.
        BRN: Object.freeze({
            PG: Object.freeze({ lastName: 'Půlpán' }),
            SG: Object.freeze({ lastName: 'Farský' }),
            SF: Object.freeze({ lastName: 'Jelínek' }),
            PF: Object.freeze({ lastName: 'Olison' }),
            C: Object.freeze({ lastName: 'Kejval' }),
        }),
        UST: Object.freeze({
            PG: Object.freeze({ lastName: 'Vyoral' }),
            SG: Object.freeze({ lastName: 'Young' }),
            SF: Object.freeze({ lastName: 'Johnson' }),
            PF: Object.freeze({ lastName: 'Pecka' }),
            C: Object.freeze({ lastName: 'Pecháček' }),
        }),
        OPA: Object.freeze({
            PG: Object.freeze({ lastName: 'Šiřina' }),
            SG: Object.freeze({ lastName: 'Kavan' }),
            SF: Object.freeze({ lastName: 'Gray' }),
            PF: Object.freeze({ lastName: 'Brown' }),
            C: Object.freeze({ lastName: 'Puršl' }),
        }),
        PIS: Object.freeze({
            PG: Object.freeze({ lastName: 'Sýkora' }),
            SG: Object.freeze({ lastName: 'Svoboda', firstName: 'Josef' }),
            SF: Object.freeze({ lastName: 'Týml' }),
            PF: Object.freeze({ lastName: 'Svoboda', firstName: 'Martin' }),
            C: Object.freeze({ lastName: 'Karlovský' }),
        }),
        DEC: Object.freeze({
            PG: Object.freeze({ lastName: 'Slowiak' }),
            SG: Object.freeze({ lastName: 'Kroutil' }),
            SF: Object.freeze({ lastName: 'Dawes' }),
            PF: Object.freeze({ lastName: 'Davis' }),
            C: Object.freeze({ lastName: 'Šturanović' }),
        }),
        OST: Object.freeze({
            PG: Object.freeze({ lastName: 'Číž' }),
            SG: Object.freeze({ lastName: 'Snopek' }),
            SF: Object.freeze({ lastName: 'Svoboda', firstName: 'Michal' }),
            PF: Object.freeze({ lastName: 'Greer' }),
            C: Object.freeze({ lastName: 'Heinzl' }),
        }),
        OLO: Object.freeze({
            PG: Object.freeze({ lastName: 'Autrey' }),
            SG: Object.freeze({ lastName: 'Elvis' }),
            SF: Object.freeze({ lastName: 'Holmes' }),
            PF: Object.freeze({ lastName: 'Žák' }),
            C: Object.freeze({ lastName: 'Filewich' }),
        }),
        USK: Object.freeze({
            PG: Object.freeze({ lastName: 'Švec' }),
            SG: Object.freeze({ lastName: 'Šafařík' }),
            SF: Object.freeze({ lastName: 'Henderson' }),
            PF: Object.freeze({ lastName: 'Montgomery' }),
            C: Object.freeze({ lastName: 'Fuxa' }),
        }),
        SLA: Object.freeze({
            PG: Object.freeze({ lastName: 'Mrázek' }),
            SG: Object.freeze({ lastName: 'Dáňa' }),
            SF: Object.freeze({ lastName: 'Jones' }),
            PF: Object.freeze({ lastName: 'Böhm' }),
            C: Object.freeze({ lastName: 'Macháč' }),
        }),
        HKR: Object.freeze({
            PG: Object.freeze({ lastName: 'Dvořák' }),
            SG: Object.freeze({ lastName: 'Nikkarinen' }),
            SF: Object.freeze({ lastName: 'John' }),
            PF: Object.freeze({ lastName: 'Chatman' }),
            C: Object.freeze({ lastName: 'Roub' }),
        }),
    });

export function preferredLineupForTeam(
    teamId: string,
): Readonly<Record<Position, PreferredStarter>> | undefined {
    return nblOpeningLineups[teamId];
}

export function allPreferredPositions(): readonly Position[] {
    return POSITIONS;
}
