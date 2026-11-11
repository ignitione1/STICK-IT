export type PaperVariant = 'soft' | 'corners' | 'torn' | 'corners-torn';

export function createPaperSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Legacy notes get an individual, stable appearance without losing saved edits.
export function paperSeedFromId(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function isPaperSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function randomFromSeed(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function getPaperAppearance(seed: number) {
  const random = randomFromSeed(seed);
  const variant: PaperVariant = (['soft', 'corners', 'torn', 'corners-torn'] as const)[seed % 4];
  const torn = variant === 'torn' || variant === 'corners-torn';
  const corners = variant === 'corners' || variant === 'corners-torn';
  const cornerSide = random() < .5 ? 'left' : 'right';
  const cornerSize = 18 + random() * 12;
  const topLeft = corners && cornerSide === 'left' ? 2.8 + random() * 2 : .3 + random() * .5;
  const topRight = corners && cornerSide === 'right' ? 2.8 + random() * 2 : .3 + random() * .5;
  const number = (value: number) => Number(value.toFixed(2));
  const points = [
    `${number(topLeft)}% .5%`, '14% .2%', '32% .6%', '51% 0%', '73% .4%',
    `${number(100 - topRight)}% .3%`, `99.6% ${number(topRight)}%`, '100% 28%',
    '99.6% 52%', '100% 75%', '99.4% calc(100% - 4px)',
  ];
  // Pixel depths preserve the tear's scale on short replies and long notes alike.
  for (let x = 98; x > 1; x -= 1.3 + random() * 2.5) {
    const depth = torn ? 1 + random() * 6 + (random() > .86 ? 3 : 0) : .4 + random() * 1.5;
    points.push(`${number(x)}% calc(100% - ${number(depth)}px)`);
  }
  points.push('.4% calc(100% - 3px)', '0% 76%', '.5% 54%', '0% 29%', `.3% ${number(topLeft)}%`);
  return {
    variant, cornerSide,
    edge: `polygon(${points.join(', ')})`,
    cornerSize: `${number(cornerSize)}px`,
    texturePosition: `${number(random() * 100)}% ${number(random() * 100)}%`,
    textureSize: `${number(120 + random() * 28)}% ${number(125 + random() * 30)}%`,
  };
}
