import type { FecConfig } from '../../config/fec';
import type { FecUserFinish, GameState } from '../model/types';

export function fecPrizeAmount(finish: FecUserFinish | null, fec: FecConfig): number {
    if (!finish) {
        return 0;
    }
    const p = fec.prizes;
    switch (finish) {
        case 'champion':
            return p.entry + p.groupStage + p.secondRound + p.quarterFinals + p.semiFinals + p.championBonus;
        case 'finalist':
            return p.entry + p.groupStage + p.secondRound + p.quarterFinals + p.semiFinals;
        case 'semifinal':
            return p.entry + p.groupStage + p.secondRound + p.quarterFinals;
        case 'quarterfinal':
            return p.entry + p.groupStage + p.secondRound + p.quarterFinals;
        case 'secondRound':
            return p.entry + p.groupStage + p.secondRound;
        case 'groupStage':
            return p.entry + p.groupStage;
        case 'qualifying':
            return 0;
        default:
            return 0;
    }
}

export function fecSettlementAmount(finish: FecUserFinish | null, fec: FecConfig, alreadyPaid: number): number {
    return Math.max(0, fecPrizeAmount(finish, fec) - alreadyPaid);
}

export function payFecPrize(state: GameState, fec: FecConfig, economy: { ledgerCapacity: number }): number {
    const comp = state.competitions.fec;
    if (!comp || comp.prizePaid || !state.fecQualified) {
        return 0;
    }
    const finish = comp.userFinish as FecUserFinish | null;
    const amount = fecSettlementAmount(finish, fec, comp.weeklyPrizePaidTotal ?? 0);
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
