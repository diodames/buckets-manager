import { balanceConfig } from './balance';
import { displayConfig } from './display';
import { leagueConfig } from './league';
import { namePools } from './names';
import { paletteConfig } from './palette';

// Fail-fast config validation, called once at game init. A broken config
// should stop the game with a clear message, never silently misbehave.
function assertConfig(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Config validation failed: ${message}`);
    }
}

export function validateAllConfigs(): void {
    // Display
    assertConfig(displayConfig.width > 0 && displayConfig.height > 0, 'display size must be positive');
    assertConfig(displayConfig.targetFPS > 0, 'targetFPS must be positive');
    assertConfig(displayConfig.keyRepeatTicks >= 1, 'keyRepeatTicks must be >= 1');

    // Palette
    const slots = Object.values(paletteConfig.roles);
    assertConfig(new Set(slots).size === slots.length, 'palette role slots must be unique');
    for (const slot of slots) {
        assertConfig(slot >= 1 && slot < paletteConfig.teamColorBase, `palette role slot ${slot} must be in [1, teamColorBase)`);
    }
    for (const role of Object.keys(paletteConfig.roles)) {
        assertConfig(role in paletteConfig.roleColors, `palette role '${role}' is missing a color`);
    }
    const teamSlotsEnd = paletteConfig.teamColorBase + leagueConfig.teams.length * 2;
    assertConfig(teamSlotsEnd <= paletteConfig.size, 'palette too small for team colors');

    // League
    const teamCount = leagueConfig.teams.length;
    assertConfig(teamCount >= 2 && teamCount % 2 === 0, 'team count must be even and >= 2');
    const ids = leagueConfig.teams.map((t) => t.id);
    assertConfig(new Set(ids).size === ids.length, 'team ids must be unique');
    assertConfig(leagueConfig.playersPerTeam >= 10, 'playersPerTeam must be >= 10 (two full five-man units)');
    assertConfig(leagueConfig.roundRobinLegs >= 1, 'roundRobinLegs must be >= 1');

    // Names: enough unique combinations for the whole league.
    const combinations = namePools.firstNames.length * namePools.lastNames.length;
    assertConfig(
        combinations >= teamCount * leagueConfig.playersPerTeam * 4,
        'name pools too small for the league size',
    );

    // Balance
    const match = balanceConfig.match;
    assertConfig(match.quarters >= 1 && match.quarterSeconds > 0, 'match quarters/quarterSeconds invalid');
    assertConfig(match.overtimeSeconds > 0, 'overtimeSeconds must be positive');
    assertConfig(
        match.possessionMinSeconds > 0 && match.possessionMaxSeconds >= match.possessionMinSeconds,
        'possession seconds range invalid',
    );
    for (const mix of Object.values(balanceConfig.shots.mix)) {
        const sum = mix.inside + mix.mid + mix.three;
        assertConfig(Math.abs(sum - 1) < 1e-9, `shot mix weights must sum to 1, got ${sum}`);
    }
    for (const p of [
        balanceConfig.shots.base.inside,
        balanceConfig.shots.base.mid,
        balanceConfig.shots.base.three,
        balanceConfig.shots.assistChance,
        balanceConfig.turnovers.base,
        balanceConfig.turnovers.stealShare,
        balanceConfig.rebounds.offensiveChance,
    ]) {
        assertConfig(p >= 0 && p <= 1, `probability ${p} out of [0, 1]`);
    }
    assertConfig(
        balanceConfig.shots.makeProbMin >= 0 && balanceConfig.shots.makeProbMax <= 1 && balanceConfig.shots.makeProbMin < balanceConfig.shots.makeProbMax,
        'makeProb clamp range invalid',
    );
    const gen = balanceConfig.playerGen;
    assertConfig(gen.attributeMin >= 1 && gen.attributeMax <= 99 && gen.attributeMin < gen.attributeMax, 'attribute range invalid');
    assertConfig(gen.ageMin < gen.ageMax, 'age range invalid');
}

export { balanceConfig, displayConfig, leagueConfig, namePools, paletteConfig };
