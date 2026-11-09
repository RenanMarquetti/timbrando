import { HARMONIC_COUNT, type SynthParams } from './synth';

export type WaveName = 'sine' | 'triangle' | 'square' | 'sawtooth';

export type SynthPreset = {
  id: string;
  label: string;
  params: SynthParams;
};

const range = (build: (harmonic: number) => number): number[] => Array.from({ length: HARMONIC_COUNT }, (_, index) => build(index + 1));

const isOdd = (harmonic: number): boolean => harmonic % 2 === 1;

const ALL_POSITIVE = range(() => 1);

export const WAVES: Record<WaveName, { label: string; harmonics: number[]; signs: number[] }> = {
  sine: { label: 'Senoidal', harmonics: range((n) => (n === 1 ? 1 : 0)), signs: ALL_POSITIVE },
  triangle: {
    label: 'Triangular',
    harmonics: range((n) => (isOdd(n) ? 1 / (n * n) : 0)),
    signs: range((n) => (((n - 1) / 2) % 2 === 0 ? 1 : -1)),
  },
  square: { label: 'Quadrada', harmonics: range((n) => (isOdd(n) ? 1 / n : 0)), signs: ALL_POSITIVE },
  sawtooth: { label: 'Dente de serra', harmonics: range((n) => 1 / n), signs: ALL_POSITIVE },
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
  vibratoRate: 5,
  vibratoDepth: 0,
};

export const DEFAULT_PARAMS: SynthParams = { ...BASE, harmonics: WAVES.sawtooth.harmonics, signs: ALL_POSITIVE };

const fromList = (values: number[]): number[] => range((n) => values[n - 1] ?? 0);

export const PRESETS: SynthPreset[] = [
  {
    id: 'flute',
    label: 'Flauta',
    params: { ...BASE, harmonics: fromList([1, 0.3, 0.12, 0.05, 0.03, 0.01]), signs: ALL_POSITIVE, attack: 0.09, decay: 0.2, sustain: 0.9, noise: 0.45, cutoff: 5000, vibratoRate: 5, vibratoDepth: 14 },
  },
  {
    id: 'clarinet',
    label: 'Clarinete',
    params: { ...BASE, harmonics: fromList([1, 0.04, 0.75, 0.04, 0.5, 0.03, 0.35, 0.02, 0.22, 0.02, 0.12, 0.01, 0.07]), signs: ALL_POSITIVE, attack: 0.05, sustain: 0.85, noise: 0.1, cutoff: 4000 },
  },
  {
    id: 'oboe',
    label: 'Oboé',
    params: { ...BASE, harmonics: fromList([0.45, 1, 0.9, 0.55, 0.5, 0.42, 0.3, 0.22, 0.18, 0.12, 0.08, 0.05]), signs: ALL_POSITIVE, attack: 0.04, noise: 0.15, cutoff: 6000, vibratoRate: 5.5, vibratoDepth: 10 },
  },
  {
    id: 'violin',
    label: 'Violino',
    params: { ...BASE, harmonics: range((n) => (1 / n) * (n >= 3 && n <= 6 ? 1.6 : 1)), signs: ALL_POSITIVE, attack: 0.14, sustain: 0.9, release: 0.3, noise: 0.3, cutoff: 7000, vibratoRate: 6, vibratoDepth: 22 },
  },
  {
    id: 'trumpet',
    label: 'Trompete',
    params: { ...BASE, harmonics: range((n) => Math.max(0.08, 1 - (n - 1) * 0.07)), signs: ALL_POSITIVE, attack: 0.06, decay: 0.25, sustain: 0.85, cutoff: 3200, resonance: 2, filterOpening: 0.85, noise: 0.08, vibratoDepth: 6 },
  },
  {
    id: 'organ',
    label: 'Órgão',
    params: { ...BASE, harmonics: fromList([1, 0.9, 0, 0.6, 0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 0.2]), signs: ALL_POSITIVE, attack: 0.01, decay: 0.1, sustain: 1, release: 0.06, cutoff: 15000 },
  },
  {
    id: 'plucked',
    label: 'Corda dedilhada',
    params: { ...BASE, harmonics: range((n) => (1 / n) * Math.abs(Math.sin((n * Math.PI) / 5)) + 0.02), signs: ALL_POSITIVE, attack: 0.003, decay: 0.9, sustain: 0, release: 0.4, noise: 0.25, cutoff: 5000, filterOpening: 0.3 },
  },
];
