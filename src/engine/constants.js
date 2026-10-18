// Základní konstanty hry Lodě – rozměry plochy, lodě, stavby a tabulky kostek.

export const WIDTH = 24;
export const HEIGHT = 19;
export const CELLS = WIDTH * HEIGHT;

// Řádky odspodu nahoru (A je dole, R nahoře) – česká abeceda včetně CH.
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'CH', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];

export const LAND_CELLS = 60;
export const MAX_ISLANDS = 5;
export const MAX_ISLAND_GROUP = 3;
export const MAX_LIGHTHOUSES = 2;
export const LIGHTHOUSE_RANGE = 3;
export const MINE_RANGE = 10;
export const AIR_DEFENSE_RANGE = 2;
export const NINES_PER_GAME = 2;
export const SONARS_PER_GAME = 4;

// Tvary lodí jako [dx, dy] (dy roste nahoru). První buňka je příď („přední část“).
export const SHIP_TYPES = {
  letadlova: {
    name: 'Letadlová loď', short: 'Let.', count: 1, big: true,
    shape: [[0, 1], [1, 1], [2, 1], [3, 1], [1, 0], [2, 0], [3, 0]],
  },
  bitevni: {
    name: 'Bitevní loď', short: 'Loď', count: 2, big: true,
    shape: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  },
  ponorka: {
    name: 'Ponorka', short: 'Pon.', count: 3, big: false,
    shape: [[0, 0], [1, 0], [2, 0]],
  },
  lodka: {
    name: 'Bitevní loďka', short: 'Loďka', count: 4, big: false,
    shape: [[0, 0], [1, 0]],
  },
  bombarder: {
    name: 'Bombardér', short: 'Bom.', count: 1, big: false,
    shape: [[1, 0], [0, 1], [1, 1], [2, 1]],
  },
  ulo: {
    name: 'ULO', short: 'ULO', count: 1, big: true,
    shape: null, // tvar si kreslí hráč (5 políček)
    size: 5,
  },
};

export const SHIP_ORDER = ['letadlova', 'bitevni', 'ulo', 'ponorka', 'bombarder', 'lodka'];

export const ULO_SHOT_SIZE = 4;

// Stavby na pevnině.
export const STRUCTURE_TYPES = {
  DI: { name: 'Dělo 1', short: 'DI', size: 1, rect: [1, 1], count: 1 },
  DII: { name: 'Dělo 2 (naváděné střely)', short: 'DII', size: 1, rect: [1, 1], count: 1 },
  Z: { name: 'Základna', short: 'Z', size: 4, rect: [2, 2], count: 1 },
  P: { name: 'Přístav', short: 'P', size: 2, rect: [2, 1], count: 1 },
  V: { name: 'Vzdušná obrana', short: 'V', size: 2, rect: [2, 1], count: 2 },
  H: { name: 'Hledač', short: 'H', size: 3, rect: null, count: 1 }, // 3 libovolně spojená políčka
};

export const STRUCTURE_ORDER = ['Z', 'P', 'DI', 'DII', 'V', 'H'];

// Výběr lodi hodem dvou kostek (součet) a jedné kostky (bonus základny č. 3).
export const SHIP_BY_TWO_DICE = {
  2: 'ulo', 3: 'lodka', 4: 'letadlova', 5: 'lodka', 6: 'ponorka', 7: 'bitevni',
  8: 'ponorka', 9: 'lodka', 10: 'bombarder', 11: 'lodka', 12: 'lodka',
};
export const SHIP_BY_ONE_DIE = {
  1: 'letadlova', 2: 'bombarder', 3: 'bitevni', 4: 'ponorka', 5: 'lodka', 6: 'ulo',
};

export const BASE_BONUSES = {
  1: 'V příštím tahu vystřelíš 300 % střel (ponorka 2× mini-sonar zdarma, bombardér 3× střelu 1×3, ULO 2×).',
  2: 'V příštím tahu vystřelí padlá loď (mimo loďky) navíc devítku zdarma, děla +1 střelu.',
  3: 'V příštím tahu házíš na výběr lodě/děla jen jednou kostkou.',
  4: 'Na začátku příštího tahu hodíš dvěma kostkami – liché = hraješ dvakrát.',
  5: 'Na 5 kol na tebe nemá účinek maják ani mina a naváděné střely dopadají až 2 pole od lodě.',
  6: 'Soupeř 2 kola nesmí použít radar, mini-radar ani devítku.',
};

export const BUNKER_BONUSES = {
  ...BASE_BONUSES,
  5: 'Soupeř ti na 1 sekundu ukáže celou svou hrací plochu.',
  6: 'V příštím tahu zasáhne každá střela pole 3×1 (bombardér do plusu, ULO beze změny).',
};

export const SPECIAL_BONUSES = {
  1: 'Příští kolo hraješ dvakrát.',
  2: 'Vybereš loď/dělo/stavbu, kterou soupeř 5 kol nesmí použít.',
  3: 'Soupeř odhalí všechny neodhalené ostrovy a 2 pole pevniny do 5 polí od základny.',
  4: 'Soupeř ti odhalí 1 dílek lodě, který ještě nebyl odhalen.',
  5: 'Dobiješ si 1 devítku nebo 1 sonar (pokud nemáš plně nabito).',
  6: 'Určíš 4 políčka, která ti soupeř musí odhalit.',
};
