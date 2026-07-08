export interface BclValuationRow {
    teamId: string;
    club: string;
    tier: number;
    playerId: string;
    name: string;
    position: string;
    age: number;
    ovr: number;
    potential: number;
    source: 'real' | 'generated';
    estSalary: number;
    estDemand: number;
    estValue: number;
}

export { bclValuationSeed, bclValuationSeasonYear, bclValuationsData } from './bclValuations.data';
