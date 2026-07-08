import type { Attributes, Position } from '../core/model/types';
import { ATTRIBUTE_KEYS } from '../core/model/types';

/** Real club-academy talent seeded into the user's youth program at game start. */
export interface YouthAcademyProspectDef {
    teamId: string;
    id: string;
    firstName: string;
    lastName: string;
    position: Position;
    born: number;
    heightCm: number;
    attributes: Attributes;
    /** Hidden development ceiling, 1..99. */
    potential: number;
    quoteIndex?: number;
    /** Optional scout-report override for marquee talents. */
    starMin?: number;
    starMax?: number;
}

type YouthProfile = 'playmaker' | 'scorer' | 'wing' | 'big' | 'stretchBig';

const PROFILE_DELTAS: Record<YouthProfile, Partial<Record<keyof Attributes, number>>> = {
    playmaker: {
        passing: 12,
        iq: 8,
        dribbling: 6,
        stealing: 4,
        speed: 2,
        shooting3: -4,
        freeThrows: -2,
        defense: -2,
        rebounding: -6,
        blocking: -10,
        stamina: -4,
        shooting2: -4,
    },
    scorer: {
        shooting2: 8,
        shooting3: 6,
        freeThrows: 4,
        speed: 4,
        dribbling: 2,
        passing: -4,
        defense: -4,
        rebounding: -4,
        blocking: -6,
        stealing: 0,
        stamina: -2,
        iq: 0,
    },
    wing: {
        shooting2: 4,
        shooting3: 4,
        defense: 4,
        stealing: 3,
        speed: 3,
        rebounding: 2,
        passing: 0,
        dribbling: 0,
        freeThrows: 0,
        blocking: -4,
        stamina: -2,
        iq: -2,
    },
    big: {
        rebounding: 10,
        blocking: 8,
        shooting2: 6,
        defense: 4,
        stamina: 2,
        passing: -6,
        dribbling: -8,
        stealing: -4,
        speed: -6,
        shooting3: -8,
        freeThrows: -2,
        iq: -2,
    },
    stretchBig: {
        rebounding: 8,
        shooting2: 4,
        shooting3: 2,
        defense: 4,
        blocking: 4,
        passing: -2,
        dribbling: -6,
        stealing: -2,
        speed: -4,
        freeThrows: 0,
        stamina: 0,
        iq: 0,
    },
};

function clampAttr(value: number): number {
    return Math.max(1, Math.min(99, Math.round(value)));
}

/** Builds attributes whose rounded average matches targetOverall. */
function buildAttributes(targetOverall: number, profile: YouthProfile): Attributes {
    const deltas = PROFILE_DELTAS[profile];
    const attrs = {} as Attributes;
    for (const key of ATTRIBUTE_KEYS) {
        attrs[key] = clampAttr(targetOverall + (deltas[key] ?? 0));
    }
    let avg = Math.round(ATTRIBUTE_KEYS.reduce((s, k) => s + attrs[k], 0) / ATTRIBUTE_KEYS.length);
    let guard = 0;
    while (avg !== targetOverall && guard < 240) {
        const diff = targetOverall - avg;
        const key = ATTRIBUTE_KEYS[guard % ATTRIBUTE_KEYS.length] as keyof Attributes;
        attrs[key] = clampAttr(attrs[key] + Math.sign(diff));
        avg = Math.round(ATTRIBUTE_KEYS.reduce((s, k) => s + attrs[k], 0) / ATTRIBUTE_KEYS.length);
        guard++;
    }
    return attrs;
}

function prospect(
    teamId: string,
    id: string,
    firstName: string,
    lastName: string,
    position: Position,
    born: number,
    heightCm: number,
    targetOverall: number,
    potential: number,
    profile: YouthProfile,
    extras?: Pick<YouthAcademyProspectDef, 'quoteIndex' | 'starMin' | 'starMax'>,
): YouthAcademyProspectDef {
    const def: YouthAcademyProspectDef = {
        teamId,
        id,
        firstName,
        lastName,
        position,
        born,
        heightCm,
        attributes: buildAttributes(targetOverall, profile),
        potential,
    };
    if (extras?.quoteIndex !== undefined) {
        def.quoteIndex = extras.quoteIndex;
    }
    if (extras?.starMin !== undefined) {
        def.starMin = extras.starMin;
    }
    if (extras?.starMax !== undefined) {
        def.starMax = extras.starMax;
    }
    return def;
}

export const youthAcademyProspects = Object.freeze<readonly YouthAcademyProspectDef[]>([
    // DEC: Marek Houška — U19 star, U16 Euro captain, NBA upside; NBL minutes still limited.
    Object.freeze({
        teamId: 'DEC',
        id: 'YTH-DEC-HOUSKA',
        firstName: 'Marek',
        lastName: 'Houška',
        position: 'PG',
        born: 2009,
        heightCm: 194,
        attributes: Object.freeze({
            shooting2: 56,
            shooting3: 44,
            freeThrows: 46,
            passing: 72,
            dribbling: 62,
            defense: 50,
            rebounding: 48,
            blocking: 32,
            stealing: 58,
            speed: 59,
            stamina: 52,
            iq: 64,
        }),
        potential: 92,
        quoteIndex: 4,
        starMin: 4,
        starMax: 5,
    }),
    // DEC: Daniel Sertic — U19 Válečníci scoring leader (~21 ppg).
    Object.freeze(
        prospect('DEC', 'YTH-DEC-SERTIC', 'Daniel', 'Sertic', 'PF', 2007, 201, 55, 79, 'big', {
            starMin: 3,
            starMax: 4,
        }),
    ),
    // PIS: Lukáš Smazák — U18 NT core guard (~17 ppg at EuroBasket).
    Object.freeze(
        prospect('PIS', 'YTH-PIS-SMAZAK', 'Lukáš', 'Smazák', 'PG', 2007, 188, 58, 86, 'playmaker', {
            quoteIndex: 1,
            starMin: 3.5,
            starMax: 4.5,
        }),
    ),
    // PIS: Matyáš Zita — U19 Sršni wing contributor.
    Object.freeze(
        prospect('PIS', 'YTH-PIS-ZITA', 'Matyáš', 'Zita', 'SF', 2007, 196, 54, 79, 'wing', {
            starMin: 3,
            starMax: 4,
        }),
    ),
    // NYM: Tomáš Stanko — U19 Nymburk leader (~12.8 ppg).
    Object.freeze(
        prospect('NYM', 'YTH-NYM-STANKO', 'Tomáš', 'Stanko', 'PF', 2007, 203, 56, 84, 'big', {
            starMin: 3.5,
            starMax: 4.5,
        }),
    ),
    // PCE: Michael Škoda — U19 Pardubice efficiency leader, U18 NT.
    Object.freeze(
        prospect('PCE', 'YTH-PCE-SKODA', 'Michael', 'Škoda', 'C', 2008, 205, 54, 83, 'big', {
            starMin: 3.5,
            starMax: 4.5,
        }),
    ),
    // BRN: Michal Růžička — U18 NT forward from Brno.
    Object.freeze(
        prospect('BRN', 'YTH-BRN-RUZICKA', 'Michal', 'Růžička', 'PF', 2007, 203, 55, 83, 'stretchBig', {
            starMin: 3.5,
            starMax: 4.5,
        }),
    ),
    // UST: Jakub Zalud — U18 NT; Ústí U19 (Benjamin Adler already on the A-team).
    Object.freeze(
        prospect('UST', 'YTH-UST-ZALUD', 'Jakub', 'Zalud', 'PG', 2008, 190, 52, 80, 'playmaker', {
            starMin: 3,
            starMax: 4,
        }),
    ),
    // OPA: Václav Warisch — U19 Opava stat leader.
    Object.freeze(
        prospect('OPA', 'YTH-OPA-WARISCH', 'Václav', 'Warisch', 'SG', 2007, 193, 53, 79, 'scorer', {
            starMin: 3,
            starMax: 4,
        }),
    ),
    // OST: Viktor Ivánek — NH Ostrava youth representative.
    Object.freeze(
        prospect('OST', 'YTH-OST-IVANEK', 'Viktor', 'Ivánek', 'SG', 2007, 200, 54, 81, 'wing', {
            starMin: 3.5,
            starMax: 4,
        }),
    ),
    // OLO: Šimon Čermák — Olomoucko graduate breaking into real NBL, not on game roster.
    Object.freeze(
        prospect('OLO', 'YTH-OLO-CERMAK', 'Šimon', 'Čermák', 'SF', 2006, 192, 56, 82, 'wing', {
            starMin: 3.5,
            starMax: 4,
        }),
    ),
    // USK: Michal Blabolil — Tygři Praha / USK U19 pipeline, elite U19 FG%.
    Object.freeze(
        prospect('USK', 'YTH-USK-BLABOLIL', 'Michal', 'Blabolil', 'SF', 2009, 198, 52, 82, 'wing', {
            starMin: 3.5,
            starMax: 4,
        }),
    ),
    // SLA: Ondřej Pospíšil — U18 NT forward from Slavia.
    Object.freeze(
        prospect('SLA', 'YTH-SLA-POSPICHAL', 'Ondřej', 'Pospíšil', 'PF', 2008, 203, 53, 84, 'stretchBig', {
            starMin: 3.5,
            starMax: 4.5,
        }),
    ),
    // HKR: Aleš Jancur — top U19 qualifier scorer for GAPA Hradec Králové.
    Object.freeze(
        prospect('HKR', 'YTH-HKR-JANCUR', 'Aleš', 'Jancur', 'SG', 2008, 193, 51, 74, 'scorer', {
            starMin: 2.5,
            starMax: 3.5,
        }),
    ),
]);

export function youthAcademyProspectsForTeam(teamId: string): YouthAcademyProspectDef[] {
    return youthAcademyProspects.filter((p) => p.teamId === teamId);
}

export function youthAcademyProspectById(playerId: string): YouthAcademyProspectDef | undefined {
    return youthAcademyProspects.find((p) => p.id === playerId);
}
