import { HARMONIC_COUNT, type SynthParams } from './synth';

export type WaveName = 'sine' | 'triangle' | 'square' | 'sawtooth';

export type Wave = {
  label: string;
  harmonics: number[];
  signs: number[];
  what: string;
  like: string;
};

export type SynthPreset = {
  id: string;
  label: string;
  family: string;
  params: SynthParams;
};

const range = (build: (harmonic: number) => number): number[] => Array.from({ length: HARMONIC_COUNT }, (_, index) => build(index + 1));

const isOdd = (harmonic: number): boolean => harmonic % 2 === 1;

const ALL_POSITIVE = range(() => 1);

export const WAVES: Record<WaveName, Wave> = {
  sine: {
    label: 'Senoidal',
    harmonics: range((n) => (n === 1 ? 1 : 0)),
    signs: ALL_POSITIVE,
    what: 'Só a nota fundamental, sem nenhum harmônico. É o som mais puro e liso que existe.',
    like: 'Parece um assobio, um diapasão ou uma flauta tocada bem suave.',
  },
  triangle: {
    label: 'Triangular',
    harmonics: range((n) => (isOdd(n) ? 1 / (n * n) : 0)),
    signs: range((n) => (((n - 1) / 2) % 2 === 0 ? 1 : -1)),
    what: 'A fundamental mais os harmônicos ímpares (3, 5, 7…), bem fracos. Suave e redondo, só um pouco mais cheio que a senoidal.',
    like: 'Parece a flauta e a ocarina.',
  },
  square: {
    label: 'Quadrada',
    harmonics: range((n) => (isOdd(n) ? 1 / n : 0)),
    signs: ALL_POSITIVE,
    what: 'Também só os harmônicos ímpares, mas bem mais fortes. Som oco, "de madeira".',
    like: 'É a mais próxima do clarinete, que naturalmente quase não tem os harmônicos pares.',
  },
  sawtooth: {
    label: 'Dente de serra',
    harmonics: range((n) => 1 / n),
    signs: ALL_POSITIVE,
    what: 'Todos os harmônicos, pares e ímpares, ficando mais fracos aos poucos. O som mais rico e brilhante.',
    like: 'É a base das cordas tocadas com arco (violino, viola, violoncelo) e dos metais (trompete, trombone).',
  },
};

const BASE: Omit<SynthParams, 'harmonics' | 'signs'> = {
  attack: 0.02,
  decay: 0.3,
  sustain: 0.8,
  release: 0.25,
  noise: 0,
  cutoff: 12000,
  resonance: 0.7,
  filterOpening: 0,
  vibratoRate: 5.5,
  vibratoDepth: 18,
};

export const DEFAULT_PARAMS: SynthParams = { ...BASE, harmonics: WAVES.sawtooth.harmonics, signs: ALL_POSITIVE };

const fromList = (values: number[]): number[] => range((n) => values[n - 1] ?? 0);

const bowed = (bump: [number, number]): number[] => range((n) => (1 / n) * (n >= bump[0] && n <= bump[1] ? 1.6 : 1));

const brass = (slope: number): number[] => range((n) => Math.max(0.04, 1 - (n - 1) * slope));

const preset = (id: string, label: string, family: string, params: Partial<SynthParams> & Pick<SynthParams, 'harmonics'>): SynthPreset => ({
  id,
  label,
  family,
  params: { ...BASE, signs: ALL_POSITIVE, ...params },
});

/** Approximate recipes for the MSA instruments plus the three extras. The ids match the real samples. */
export const PRESETS: SynthPreset[] = [
  preset('organ', 'Órgão', 'Teclados', { harmonics: fromList([1, 0.9, 0, 0.6, 0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 0.2]), attack: 0.01, decay: 0.1, sustain: 1, release: 0.06, cutoff: 15000 }),
  preset('violin', 'Violino', 'Cordas', { harmonics: bowed([3, 6]), attack: 0.14, sustain: 0.9, release: 0.3, noise: 0.3, cutoff: 7000, vibratoRate: 6, vibratoDepth: 22 }),
  preset('viola', 'Viola', 'Cordas', { harmonics: bowed([2, 4]), attack: 0.15, sustain: 0.9, release: 0.3, noise: 0.25, cutoff: 5000, vibratoRate: 5.5, vibratoDepth: 18 }),
  preset('cello', 'Violoncelo', 'Cordas', { harmonics: bowed([2, 3]), attack: 0.16, sustain: 0.9, release: 0.35, noise: 0.25, cutoff: 4000, vibratoRate: 5, vibratoDepth: 18 }),
  preset('flute', 'Flauta', 'Madeiras', { harmonics: fromList([1, 0.3, 0.12, 0.05, 0.03, 0.01]), attack: 0.09, decay: 0.2, sustain: 0.9, noise: 0.45, cutoff: 5000, vibratoRate: 5, vibratoDepth: 14 }),
  preset('oboe', 'Oboé', 'Madeiras', { harmonics: fromList([0.45, 1, 0.9, 0.55, 0.5, 0.42, 0.3, 0.22, 0.18, 0.12, 0.08, 0.05]), attack: 0.04, noise: 0.15, cutoff: 6000, vibratoRate: 5.5, vibratoDepth: 10 }),
  preset('bassoon', 'Fagote', 'Madeiras', { harmonics: fromList([0.35, 1, 0.8, 0.5, 0.35, 0.2, 0.12, 0.08, 0.05]), attack: 0.05, noise: 0.1, cutoff: 2500 }),
  preset('clarinet', 'Clarinete', 'Madeiras', { harmonics: fromList([1, 0.04, 0.75, 0.04, 0.5, 0.03, 0.35, 0.02, 0.22, 0.02, 0.12, 0.01, 0.07]), attack: 0.05, sustain: 0.85, noise: 0.1, cutoff: 4000 }),
  preset('saxophone', 'Saxofone', 'Madeiras', { harmonics: fromList([1, 0.7, 0.6, 0.5, 0.45, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.08]), attack: 0.05, noise: 0.12, cutoff: 5000, vibratoRate: 5, vibratoDepth: 10 }),
  preset('trumpet', 'Trompete', 'Metais', { harmonics: brass(0.07), attack: 0.06, decay: 0.25, sustain: 0.85, cutoff: 3200, resonance: 2, filterOpening: 0.85, noise: 0.08, vibratoDepth: 6 }),
  preset('french-horn', 'Trompa', 'Metais', { harmonics: fromList([1, 0.8, 0.5, 0.3, 0.2, 0.12, 0.08, 0.05]), attack: 0.08, cutoff: 1800, filterOpening: 0.5 }),
  preset('trombone', 'Trombone', 'Metais', { harmonics: brass(0.06), attack: 0.07, cutoff: 2200, resonance: 1.5, filterOpening: 0.7 }),
  preset('tuba', 'Tuba', 'Metais', { harmonics: fromList([1, 0.6, 0.35, 0.2, 0.1, 0.05]), attack: 0.09, cutoff: 900, filterOpening: 0.4 }),
  preset('piano', 'Piano', 'Extras', { harmonics: fromList([1, 0.6, 0.35, 0.25, 0.15, 0.1, 0.08, 0.05, 0.03]), attack: 0.003, decay: 1.2, sustain: 0, release: 0.3, noise: 0.15, cutoff: 6000 }),
  preset('guitar-nylon', 'Violão', 'Extras', { harmonics: range((n) => (1 / n) * Math.abs(Math.sin((n * Math.PI) / 5)) + 0.02), attack: 0.003, decay: 0.9, sustain: 0, release: 0.4, noise: 0.25, cutoff: 5000 }),
  preset('harp', 'Harpa', 'Extras', { harmonics: fromList([1, 0.3, 0.15, 0.08, 0.04]), attack: 0.003, decay: 1.5, sustain: 0, release: 0.5, noise: 0.1, cutoff: 5000 }),
];
