# DESIGN BRIEF: Player Management, Transfers & Youth (Czech NBL Manager)

Distilled from Football Manager (contracts as relationships, youth intake), NBA 2K MyGM
(legible team needs, single trade-value number), OOTP (surplus value: young cheap talent >
equal-rated veterans; prospects as ranges), Hattrick (public market + deadlines, academy
lottery), Czech Soccer Manager (one-screen cash negotiations — simplicity is the feature).

Core consequence: **cash transfers + free agents, no US-style trades; 2-3 click
negotiations; ONE shared valuation formula used everywhere.**

## 1. CONTRACTS

- **M1. Contract model (MUST).** Player: `salary` (CZK/season) + `yearsLeft` (1-3). Season
  end: `yearsLeft -= 1`; at 0 → free agent unless renewed. Squad screen shows expiry status
  (green >=2y, yellow 1y, red expiring).
- **M2. Market salary & demand (MUST).** Canonical function reused by renewals, FA, AI:
  `marketSalary = baseSalary(overall)`;
  `demand = marketSalary * ageF * formF * happinessF`;
  ageF: <=23 0.9 | 24-29 1.0 | 30-32 1.05 | 33+ 0.9; formF 1.0 +/- 0.1; happinessF 0.9
  (morale>=80) .. 1.25 (morale<=30).
- **M3. Renewal negotiation, max 3 rounds (MUST).** Offer salary+years; acceptance score:
  `A = 50 + 40*clamp((offer-demand)/demand, -1, +0.5) + 10*(minutesShare-0.5)*2 +
  (morale-50)/5 + 8 if top4 | -8 if bottom4 + 5 if years>=2 and age<=27 | -5 if years>=2
  and age>=32`. Accept if A >= 60. Round 1 rejection → hint ("wants ~1.4M"); round 2 →
  firm minimum (demand*0.97); round 3 final — rejection locks talks 5 rounds, -10 morale.
  Renewals open from round 12 for expiring contracts.
- **M4. Agent fee (NICE).** 8% of first-year salary on signing/renewal; 10% for 85+ rated.
- **M5. Free agency (MUST).** Public FA pool; no transfer fee, salary prorated by remaining
  rounds, mid-season demand *1.15. AI clubs poll pool every 2 rounds.

## 2. TRANSFERS (cash, European style)

- **M6. Transfer value — one formula (MUST).**
  `TV = salary * 2.2 * ageV * potV * contractV`;
  ageV: <=22 1.5 | 23-26 1.2 | 27-29 1.0 | 30-32 0.6 | 33+ 0.35;
  potV: 1 + (potential-overall)/50, cap 1.6;
  contractV: yearsLeft>=2 1.0 | final year 0.55 | expiring <6 rounds 0.35.
- **M7. Transfer listing (MUST).** List any player (optional asking price); listing = -5
  morale. AI offers within 1-3 rounds at `TV * uniform(0.7,1.0) * needF` (needF up to 1.15).
  Accept / reject / counter ONCE; AI ceiling = `TV * 1.1 * needF` (budget permitting).
- **M8. Bidding on AI players (MUST).** Bid on anyone; AI accepts if `bid >= TV * sellF`;
  sellF 0.85 surplus | 1.1 normal | 1.5+ core starters of contenders. One counter round
  each side. Then personal terms via M3 dialog (1 round, demand*1.05).
- **M9. Transfer window (MUST).** Pre-season rounds 1-7 and mid-season rounds 8-12
  for club-to-club deals; hard deadline after round 12 (of 22). Outside windows:
  free agents only until playoffs. Deadline day: 2-3 last-minute AI offers at round 12.
- **M10. Unsolicited AI bids (NICE).** Unlisted stars attract 1-2 bids/season at TV*1.2-1.4;
  rejecting a huge bid: player morale -8.

## 3. YOUTH ACADEMY

- **M11. Intake event (MUST).** Once per season after round 14. `1 + floor(academyLevel/2)`
  prospects, age 16-18. `potential = 45 + academyLevel*6 + rand(0,20)`;
  `overall = potential * uniform(0.45, 0.65)`.
- **M12. Scout-report presentation (MUST).** Never exact potential: overall ~(+/-3), potential
  as star RANGE whose width shrinks with academy level; coach flavor quote.
- **M13. Sign or release (MUST).** 3-round decision window. Youth contract 200k * 2y, no
  agent fee. Roster cap: max 14, min 10, max 6 foreigners (real NBL rule).

## 4. TEAM-NEEDS AI

- **M14. Need & surplus scoring (MUST).** Every 2 rounds per position:
  `depth = count(overall >= leagueMedian-5)`; `need = 2 - depth` (>0 buy);
  `surplus = depth - 3` (>0 list weakest); ageAlarm if avg age top-2 >= 31 → seek <=25y.
- **M15. Budget discipline (MUST).** AI wage bill <= 65% budget; transfer spend <= 60% free
  cash. Deficit clubs become forced sellers (sellF 0.7).
- **M16. Personality (NICE).** Per-club trait: developer / win-now / hoarder.

## 5. UX

- **M17. Negotiation dialog (MUST).** One modal: salary stepper + years toggle, budget
  impact, agent mood (pleased/hesitant/insulted), remaining-rounds dots. Reused for
  renewals, FA, post-transfer terms.
- **M18. Transfer market screen (MUST).** Tabs: Listed players / Free agents / My listings
  & incoming offers (inbox accept/counter/reject) / Watchlist (NICE). Filters: position,
  age, price.
- **M19. Youth intake screen (MUST).** Card per prospect: position, age, rough overall,
  star-range potential, coach quote, Sign/Release, roster-cap warning.
- **M20. Press hooks (NICE).** Transfer events feed press conferences ("Why did you sell
  the captain?") — fan support +/-2, squad morale +/-3.
