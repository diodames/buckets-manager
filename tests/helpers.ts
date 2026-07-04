import { balanceConfig } from '../src/config/balance';
import { economyConfig } from '../src/config/economy';
import { leagueConfig } from '../src/config/league';
import { momentsConfig } from '../src/config/moments';
import { namePools } from '../src/config/names';
import { pressConfig } from '../src/config/press';
import { trainingConfig } from '../src/config/training';
import type { GameConfig } from '../src/core/game';

export const testConfig: GameConfig = {
    league: leagueConfig,
    balance: balanceConfig,
    names: namePools,
    moments: momentsConfig,
    economy: economyConfig,
    training: trainingConfig,
    press: pressConfig,
};
