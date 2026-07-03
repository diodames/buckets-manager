import { BT, Color32, type Palette } from 'blit386';
import { leagueConfig } from '../config/league';
import { paletteConfig, type Rgb } from '../config/palette';

// Palette role slots, re-exported for terse draw calls: ROLE.text, ROLE.bg...
export const ROLE = paletteConfig.roles;

function color(rgb: Rgb): Color32 {
    return new Color32(rgb.r, rgb.g, rgb.b);
}

/**
 * Builds the game palette: UI role slots from config plus two color slots per
 * league team (primary/secondary), in league order starting at teamColorBase.
 */
export function buildPalette(): Palette {
    const palette = BT.paletteCreate(paletteConfig.size);
    for (const [role, slot] of Object.entries(paletteConfig.roles)) {
        const rgb = paletteConfig.roleColors[role as keyof typeof paletteConfig.roleColors];
        palette.set(slot, color(rgb));
        palette.setNamed(role, slot);
    }
    leagueConfig.teams.forEach((team, index) => {
        palette.set(paletteConfig.teamColorBase + index * 2, color(team.primary));
        palette.set(paletteConfig.teamColorBase + index * 2 + 1, color(team.secondary));
    });
    return palette;
}

/** Primary color slot for a team by its position in the league config. */
export function teamColorSlot(teamId: string): number {
    const index = leagueConfig.teams.findIndex((t) => t.id === teamId);
    if (index === -1) {
        throw new Error(`teamColorSlot: unknown team '${teamId}'`);
    }
    return paletteConfig.teamColorBase + index * 2;
}
