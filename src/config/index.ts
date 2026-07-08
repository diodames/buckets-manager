import { balanceConfig } from './balance';
import { displayConfig } from './display';
import { economyConfig } from './economy';
import { leagueConfig } from './league';
import { namePools } from './names';
import { paletteConfig } from './palette';
import { youthAcademyProspects } from './youthAcademy';

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
    assertConfig(teamSlotsEnd <= paletteConfig.courtSlotBase, 'team colors overlap match-viewer palette slots');
    assertConfig(paletteConfig.courtSlotBase + 8 <= paletteConfig.size, 'palette too small for match-viewer slots');

    // Economy
    assertConfig(economyConfig.startingBudgetByTier.length === 5, 'startingBudgetByTier must have 5 entries (tiers 1..5)');
    for (const budget of economyConfig.startingBudgetByTier) {
        assertConfig(budget > 0, 'startingBudgetByTier entries must be positive');
    }
    assertConfig(
        economyConfig.financial.wageBudgetPct > 0 && economyConfig.financial.wageBudgetPct <= 1,
        'financial.wageBudgetPct must be in (0, 1]',
    );
    assertConfig(economyConfig.financial.lowCashRunwayWeeks >= 1, 'financial.lowCashRunwayWeeks must be >= 1');
    assertConfig(economyConfig.sponsors.signingBonusRoundStep > 0, 'sponsors.signingBonusRoundStep must be positive');
    for (const profile of economyConfig.sponsors.ambitionProfiles) {
        assertConfig(profile.signingBonus >= 0, `sponsor ambition '${profile.id}' signingBonus must be >= 0`);
        assertConfig(profile.bonusAmount >= 0, `sponsor ambition '${profile.id}' bonusAmount must be >= 0`);
    }
    assertConfig(economyConfig.leaguePrizesByRank.length >= 1, 'leaguePrizesByRank must not be empty');
    let lastLeaguePrizeRank = 0;
    for (const row of economyConfig.leaguePrizesByRank) {
        assertConfig(row.maxRank > lastLeaguePrizeRank, 'leaguePrizesByRank maxRank must be strictly increasing');
        assertConfig(row.prize >= 0, 'leaguePrizesByRank prize must be >= 0');
        lastLeaguePrizeRank = row.maxRank;
    }
    assertConfig(
        lastLeaguePrizeRank >= leagueConfig.teams.length,
        'leaguePrizesByRank must cover all league teams',
    );

    // League
    const teamCount = leagueConfig.teams.length;
    assertConfig(teamCount >= 2 && teamCount % 2 === 0, 'team count must be even and >= 2');
    const ids = leagueConfig.teams.map((t) => t.id);
    assertConfig(new Set(ids).size === ids.length, 'team ids must be unique');
    assertConfig(economyConfig.derbies.incomeMult >= 1, 'derbies.incomeMult must be >= 1');
    const derbyPairKeys = new Set<string>();
    for (const pair of economyConfig.derbies.pairs) {
        assertConfig(pair.length === 2, 'derby pair must have exactly 2 teams');
        assertConfig(pair[0] !== pair[1], 'derby pair must list two distinct teams');
        assertConfig(pair[0]! < pair[1]!, 'derby pairs must be sorted alphabetically by team id');
        for (const teamId of pair) {
            assertConfig(ids.includes(teamId), `derby references unknown team '${teamId}'`);
        }
        const key = `${pair[0]}-${pair[1]}`;
        assertConfig(!derbyPairKeys.has(key), `duplicate derby pair '${key}'`);
        derbyPairKeys.add(key);
    }
    assertConfig(leagueConfig.playersPerTeam >= 10, 'playersPerTeam must be >= 10 (two full five-man units)');
    assertConfig(leagueConfig.roundRobinLegs >= 1, 'roundRobinLegs must be >= 1');
    for (const team of leagueConfig.teams) {
        assertConfig(team.arenaName.length > 0, `team ${team.id} arenaName must not be empty`);
        assertConfig(team.roster.length >= 8, `team ${team.id} roster must have at least 8 real players`);
        assertConfig(
            team.tier >= 1 && team.tier <= 5 && team.roster.every((r) => r.tier >= 1 && r.tier <= 5),
            `team ${team.id} has a tier outside 1..5`,
        );
    }

    // Youth academy: fixed prospects must reference real league teams.
    const prospectIds = new Set<string>();
    const rosterNamesByTeam = new Map(
        leagueConfig.teams.map((team) => [
            team.id,
            new Set(team.roster.map((r) => `${r.firstName} ${r.lastName}`)),
        ]),
    );
    for (const prospect of youthAcademyProspects) {
        assertConfig(ids.includes(prospect.teamId), `youth prospect ${prospect.id} references unknown team '${prospect.teamId}'`);
        assertConfig(!prospectIds.has(prospect.id), `duplicate youth prospect id '${prospect.id}'`);
        prospectIds.add(prospect.id);
        assertConfig(prospect.potential >= 1 && prospect.potential <= 99, `youth prospect ${prospect.id} potential out of range`);
        const rosterNames = rosterNamesByTeam.get(prospect.teamId);
        const fullName = `${prospect.firstName} ${prospect.lastName}`;
        assertConfig(
            !rosterNames?.has(fullName),
            `youth prospect ${prospect.id} collides with A-team roster name '${fullName}' on ${prospect.teamId}`,
        );
        for (const value of Object.values(prospect.attributes)) {
            assertConfig(value >= 1 && value <= 99, `youth prospect ${prospect.id} has attribute out of range`);
        }
    }

    // Names: enough unique combinations for youth fill-ins.
    const combinations = namePools.firstNames.length * namePools.lastNames.length;
    assertConfig(combinations >= teamCount * leagueConfig.playersPerTeam, 'name pools too small for youth generation');

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
export { bclConfig } from './bcl';
