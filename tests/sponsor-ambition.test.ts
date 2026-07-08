import { describe, expect, it } from 'vitest';
import { economyConfig } from '../src/config/economy';
import {
    acceptSponsorOffer,
    generateAmbitionSponsorOffers,
    scaledSponsorSigningBonus,
    settleSponsorSeasonEnd,
    sponsorAmbitionTargetMet,
} from '../src/core/economy';
import { createNewGame } from '../src/core/game';
import { createRng } from '../src/core/rng';
import { testConfig as config } from './helpers';

describe('generateAmbitionSponsorOffers', () => {
    it('creates three distinct ambition offers with correct pay and clauses', () => {
        const state = createNewGame(config, 500, 'NYM');
        generateAmbitionSponsorOffers(state, economyConfig, createRng(500).fork('sponsors'));

        expect(state.club.sponsorOffers).toHaveLength(3);
        const profiles = economyConfig.sponsors.ambitionProfiles;
        for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            const offer = state.club.sponsorOffers[i];
            expect(offer?.ambitionId).toBe(profile?.id);
            expect(offer?.promisedMaxRank).toBe(profile?.promisedMaxRank);
            expect(offer?.bonusAmount).toBe(profile?.bonusAmount);
            expect(offer?.signingBonus).toBe(scaledSponsorSigningBonus(profile?.signingBonus ?? 0, 5, economyConfig));
            expect(offer?.perRound).toBe(economyConfig.sponsors.perRoundByTier[(profile?.tier ?? 1) - 1]);
        }
        const brands = state.club.sponsorOffers.map((o) => o.brandKey);
        expect(new Set(brands).size).toBe(3);
    });

    it('offers only downgraded profiles after a missed target', () => {
        const state = createNewGame(config, 505, 'NYM');
        state.club.sponsorRenewalDowngrade = true;
        generateAmbitionSponsorOffers(state, economyConfig, createRng(505).fork('sponsors'));

        expect(state.club.sponsorOffers).toHaveLength(2);
        expect(state.club.sponsorOffers.some((o) => o.ambitionId === 'bold')).toBe(false);
        expect(state.club.sponsorOffers.every((o) => o.tier <= 2)).toBe(true);
    });

    it('scales signing fees down for lower-tier clubs', () => {
        const state = createNewGame(config, 506, 'HKR');
        generateAmbitionSponsorOffers(state, economyConfig, createRng(506).fork('sponsors'));
        const safe = state.club.sponsorOffers.find((o) => o.ambitionId === 'safe');
        expect(safe?.signingBonus).toBe(scaledSponsorSigningBonus(450_000, 1, economyConfig));
        expect(safe?.signingBonus).toBeLessThan(450_000);
    });
});

describe('settleSponsorSeasonEnd', () => {
    it('pays a success bonus when the target rank is met', () => {
        const state = createNewGame(config, 501, 'NYM');
        state.lastSeasonStandings[state.userTeamId] = 6;
        state.club.sponsors = [{
            id: 'd1',
            brandKey: 'banka',
            tier: 2,
            perRound: 60_000,
            seasonsRemaining: 1,
            relationship: 55,
            promisedMaxRank: 8,
            bonusAmount: 1_000_000,
            signingBonus: 0,
        }];
        const before = state.club.budget;
        const result = settleSponsorSeasonEnd(state, economyConfig);
        expect(result.bonusPaid).toBe(1_000_000);
        expect(result.targetMet).toBe(true);
        expect(state.club.budget).toBe(before + 1_000_000);
        expect(state.club.sponsorRenewalDowngrade).toBe(false);
        expect(state.club.ledger.some((e) => e.kind === 'sponsorBonus')).toBe(true);
    });

    it('pays no bonus and flags renewal downgrade when the bold target is missed', () => {
        const state = createNewGame(config, 502, 'NYM');
        state.lastSeasonStandings[state.userTeamId] = 5;
        state.playoffs = { stage: 2, seeds: {}, series: [], championTeamId: 'PCE', thirdPlaceSeries: null, thirdPlaceTeamId: 'NYM' };
        state.club.sponsors = [{
            id: 'd1',
            brandKey: 'banka',
            tier: 3,
            perRound: 90_000,
            seasonsRemaining: 1,
            relationship: 55,
            promisedMaxRank: 1,
            bonusAmount: 2_500_000,
            signingBonus: 0,
        }];
        const before = state.club.budget;
        const result = settleSponsorSeasonEnd(state, economyConfig);
        expect(result.bonusPaid).toBe(0);
        expect(result.targetMet).toBe(false);
        expect(result.promisedMaxRank).toBe(1);
        expect(result.actualRank).toBe(5);
        expect(state.club.budget).toBe(before);
        expect(state.club.sponsorRenewalDowngrade).toBe(true);
        expect(state.club.ledger.some((e) => e.kind === 'sponsorBonus')).toBe(false);
    });

    it('pays bold bonus when user wins the playoffs despite a mid-table regular season finish', () => {
        const state = createNewGame(config, 507, 'DEC');
        state.lastSeasonStandings[state.userTeamId] = 6;
        state.playoffs = { stage: 2, seeds: {}, series: [], championTeamId: 'DEC', thirdPlaceSeries: null, thirdPlaceTeamId: 'NYM' };
        state.club.sponsors = [{
            id: 'd1',
            brandKey: 'banka',
            tier: 3,
            perRound: 90_000,
            seasonsRemaining: 1,
            relationship: 55,
            promisedMaxRank: 1,
            bonusAmount: 2_500_000,
            signingBonus: 0,
        }];
        expect(sponsorAmbitionTargetMet(state, 1)).toBe(true);
        const result = settleSponsorSeasonEnd(state, economyConfig);
        expect(result.bonusPaid).toBe(2_500_000);
        expect(result.targetMet).toBe(true);
        expect(state.club.sponsorRenewalDowngrade).toBe(false);
    });
});

describe('acceptSponsorOffer', () => {
    it('clears remaining ambition offers once sponsor slots are full', () => {
        const state = createNewGame(config, 504, 'NYM');
        generateAmbitionSponsorOffers(state, economyConfig, createRng(504).fork('sponsors'));
        expect(state.club.sponsorOffers).toHaveLength(3);

        const acceptedId = state.club.sponsorOffers[1]?.id ?? '';
        expect(acceptSponsorOffer(state, acceptedId, economyConfig)).toBe(true);
        expect(state.club.sponsors).toHaveLength(1);
        expect(state.club.sponsorOffers).toHaveLength(0);
    });

    it('copies ambition clause fields onto the active deal', () => {
        const state = createNewGame(config, 503, 'NYM');
        state.club.sponsorOffers = [{
            id: 'o1',
            brandKey: 'pivovar',
            tier: 2,
            perRound: 60_000,
            seasons: 1,
            expiresRound: 99,
            promisedMaxRank: 8,
            bonusAmount: 1_000_000,
            signingBonus: 425_000,
            ambitionId: 'standard',
        }];
        const before = state.club.budget;
        expect(acceptSponsorOffer(state, 'o1', economyConfig)).toBe(true);
        const deal = state.club.sponsors[0];
        expect(deal?.promisedMaxRank).toBe(8);
        expect(deal?.bonusAmount).toBe(1_000_000);
        expect(deal?.signingBonus).toBe(425_000);
        expect(state.club.budget).toBe(before + 425_000);
        expect(state.club.ledger.some((e) => e.kind === 'sponsorSigning' && e.amount === 425_000)).toBe(true);
    });
});
