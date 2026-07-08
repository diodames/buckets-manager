import type { BclConfig } from '../../config/bcl';
import type { BclUserFinish, GameState } from '../model/types';

export function bclPrizeAmount(finish: BclUserFinish | null, bcl: BclConfig): number {
    if (!finish) {
        return 0;
    }
    const p = bcl.prizes;
    switch (finish) {
        case 'champion':
            return p.entry + p.groupStage + p.roundOf16 + p.quarterFinals + p.finalFour + p.championBonus;
        case 'finalist':
            return p.entry + p.groupStage + p.roundOf16 + p.quarterFinals + p.finalFour;
        case 'semifinal':
            return p.entry + p.groupStage + p.roundOf16 + p.quarterFinals;
        case 'quarterfinal':
            return p.entry + p.groupStage + p.roundOf16 + p.quarterFinals;
        case 'roundOf16':
            return p.entry + p.groupStage + p.roundOf16;
        case 'groupStage':
            return p.entry + p.groupStage;
        case 'playIn':
            return p.entry;
        case 'qualifying':
            return 0;
        default:
            return 0;
    }
}

export function bclSettlementAmount(finish: BclUserFinish | null, bcl: BclConfig, alreadyPaid: number): number {
    return Math.max(0, bclPrizeAmount(finish, bcl) - alreadyPaid);
}

export function payBclPrize(state: GameState, bcl: BclConfig, economy: { ledgerCapacity: number }): number {
    const comp = state.competitions.bcl;
    if (!comp || comp.prizePaid || !state.bclQualified) {
        return 0;
    }
    const finish = comp.userFinish as BclUserFinish | null;
    const amount = bclSettlementAmount(finish, bcl, comp.weeklyPrizePaidTotal ?? 0);
    if (amount > 0) {
        state.club.ledger.push({ round: state.currentRound, kind: 'bonus', amount });
        if (state.club.ledger.length > economy.ledgerCapacity) {
            state.club.ledger.splice(0, state.club.ledger.length - economy.ledgerCapacity);
        }
        state.club.budget += amount;
    }
    comp.prizePaid = true;
    return amount;
}
