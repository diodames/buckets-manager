import { BT, Color32, type Palette } from 'blit386';
import { courtConfig } from '../config/court';
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
    const slots = courtConfig.slots;
    palette.set(slots.floor, color(courtConfig.colors.floor as Rgb));
    palette.set(slots.floorDark, color(courtConfig.colors.floorDark as Rgb));
    palette.set(slots.keyFill, color(courtConfig.colors.keyFill as Rgb));
    palette.set(slots.skin, color(courtConfig.colors.skin as Rgb));
    palette.set(slots.lines, color(courtConfig.colors.lines as Rgb));
    palette.set(slots.ball, color(courtConfig.colors.ball as Rgb));
    palette.set(slots.rim, color(courtConfig.colors.rim as Rgb));
    palette.set(slots.crowdBase, color(courtConfig.colors.crowd1 as Rgb));
    palette.set(slots.crowdBase + 1, color(courtConfig.colors.crowd2 as Rgb));
    palette.set(slots.crowdBase + 2, color(courtConfig.colors.crowd3 as Rgb));
    palette.set(slots.crowdBase + 3, color(courtConfig.colors.crowd4 as Rgb));
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
