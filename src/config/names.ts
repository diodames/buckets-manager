// Fictional player name pools. Stored with Czech diacritics; the UI folds
// them to ASCII until the custom bitmap font with diacritics lands (M2).
export const namePools = Object.freeze({
    firstNames: Object.freeze([
        'Adam', 'Aleš', 'Antonín', 'Bohumil', 'Cyril', 'Dan', 'David', 'Dominik', 'Dušan', 'Emil',
        'Filip', 'František', 'Hynek', 'Ivan', 'Jakub', 'Jan', 'Jaroslav', 'Jiří', 'Josef', 'Kamil',
        'Karel', 'Kryštof', 'Ladislav', 'Libor', 'Lukáš', 'Marek', 'Martin', 'Matěj', 'Matyáš', 'Michal',
        'Milan', 'Miroslav', 'Ondřej', 'Patrik', 'Pavel', 'Petr', 'Radek', 'Richard', 'Roman', 'Šimon',
        'Stanislav', 'Štěpán', 'Tadeáš', 'Tomáš', 'Václav', 'Viktor', 'Vít', 'Vladimír', 'Vojtěch', 'Zdeněk',
    ]),
    lastNames: Object.freeze([
        'Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec',
        'Marek', 'Pokorný', 'Pospíšil', 'Hájek', 'Král', 'Jelínek', 'Růžička', 'Beneš', 'Fiala', 'Sedláček',
        'Doležal', 'Zeman', 'Kolář', 'Navrátil', 'Čermák', 'Urban', 'Vaněk', 'Blažek', 'Kříž', 'Kovář',
        'Kratochvíl', 'Bartoš', 'Vlček', 'Polák', 'Musil', 'Kopecký', 'Šimek', 'Konečný', 'Malý', 'Holub',
        'Staněk', 'Kadlec', 'Štěpánek', 'Dostál', 'Soukup', 'Šťastný', 'Mareš', 'Moravec', 'Sýkora', 'Tichý',
        'Vávra', 'Matoušek', 'Říha', 'Bláha', 'Šulc', 'Machala', 'Hruška', 'Toman', 'Vacek', 'Klíma',
    ]),
});

export type NamePools = typeof namePools;
