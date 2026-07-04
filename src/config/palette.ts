// Palette layout: slot 0 is always transparent (engine rule). Slots 1..15 are
// UI roles, slots 16..39 hold team colors (two per team, assigned in league
// order). Values are plain RGB so this file stays engine-free.
export interface Rgb {
    r: number;
    g: number;
    b: number;
}

export const paletteConfig = Object.freeze({
    size: 64,
    teamColorBase: 16,
    // Slots 40..47 belong to the match viewer (see config/court.ts).
    courtSlotBase: 40,
    roles: Object.freeze({
        bg: 1,
        panel: 2,
        border: 3,
        text: 4,
        textDim: 5,
        textBright: 6,
        accent: 7,
        header: 8,
        highlight: 9,
        highlightText: 10,
        success: 11,
        warning: 12,
        danger: 13,
        gold: 14,
        shadow: 15,
    }),
    roleColors: Object.freeze({
        bg: { r: 16, g: 20, b: 40 },
        panel: { r: 24, g: 32, b: 64 },
        border: { r: 56, g: 80, b: 160 },
        text: { r: 200, g: 208, b: 224 },
        textDim: { r: 112, g: 120, b: 144 },
        textBright: { r: 255, g: 255, b: 255 },
        accent: { r: 64, g: 192, b: 255 },
        header: { r: 255, g: 216, b: 80 },
        highlight: { r: 40, g: 80, b: 160 },
        highlightText: { r: 255, g: 255, b: 255 },
        success: { r: 80, g: 200, b: 120 },
        warning: { r: 255, g: 176, b: 32 },
        danger: { r: 224, g: 72, b: 72 },
        gold: { r: 255, g: 200, b: 64 },
        shadow: { r: 8, g: 10, b: 20 },
    }) satisfies Readonly<Record<string, Rgb>>,
});

export type PaletteRole = keyof typeof paletteConfig.roles;
