import { spectrumFor } from './instrumentSpectrum';
import { HARMONIC_COUNT, type SynthParams } from './synth';

export type WaveName = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'octaves' | 'fifths';

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
  origin: string;
  params: SynthParams;
};

const range = (build: (harmonic: number) => number): number[] => Array.from({ length: HARMONIC_COUNT }, (_, index) => build(index + 1));

const isOdd = (harmonic: number): boolean => harmonic % 2 === 1;

const ALL_POSITIVE = range(() => 1);

const OCTAVE_HARMONICS = [1, 2, 4, 8, 16];

const FIFTH_AND_OCTAVE_HARMONICS = [1, 2, 3, 4, 6, 8, 12, 16];

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
  octaves: {
    label: 'Oitavas',
    harmonics: range((n) => (OCTAVE_HARMONICS.includes(n) ? 1 / Math.log2(2 * n) : 0)),
    signs: ALL_POSITIVE,
    what: 'Só a fundamental e as oitavas dela: harmônicos 1, 2, 4, 8 e 16 (a série de base 2). Cada parte nova é a mesma nota, mais aguda, então o som enche sem mudar de cor.',
    like: 'Lembra um órgão com os registros de 8, 4, 2 e 1 pé puxados juntos.',
  },
  fifths: {
    label: 'Quintas e oitavas',
    harmonics: range((n) => (FIFTH_AND_OCTAVE_HARMONICS.includes(n) ? 1 / Math.sqrt(n) : 0)),
    signs: ALL_POSITIVE,
    what: 'As oitavas mais as quintas: harmônicos 1, 2, 3, 4, 6, 8, 12 e 16 (as séries de base 2 e 3). Mais cheio e mais brilhante que só as oitavas.',
    like: 'É o pleno do órgão: tubos de 8, 4, 2⅔ e 2 pés, mais a mistura.',
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

const MEASURED_FROM_NOTE = 60;

const SOURCE_TEXT = {
  sharc: 'Harmônicos medidos: SHARC, de Gregory Sandell, em gravações da Universidade McGill.',
  timbrando: 'Harmônicos e tempos medidos pelo Timbrando nas gravações do próprio app, com o mesmo método do SHARC.',
} as const;

type NoteParamsArgs = {
  instrumentId: string;
  midi: number;
};

/** The measured part of a recipe at one note: harmonics always, attack and decay when they were measured. */
export const measuredParams = (args: NoteParamsArgs): Partial<SynthParams> => {
  const recipe = spectrumFor(args);
  if (!recipe) {
    return {};
  }
  return { harmonics: [...recipe.harmonics], ...(recipe.attack === undefined ? {} : { attack: recipe.attack }), ...(recipe.decay === undefined ? {} : { decay: recipe.decay }) };
};

type PresetArgs = {
  id: string;
  label: string;
  family: string;
  origin: string;
  params: Partial<SynthParams>;
};

const preset = ({ id, label, family, origin, params }: PresetArgs): SynthPreset => {
  const source = spectrumFor({ instrumentId: id, midi: MEASURED_FROM_NOTE })?.source;
  return {
    id,
    label,
    family,
    origin: source ? `${origin} ${SOURCE_TEXT[source]}` : origin,
    params: { ...BASE, signs: ALL_POSITIVE, harmonics: DEFAULT_PARAMS.harmonics, ...measuredParams({ instrumentId: id, midi: MEASURED_FROM_NOTE }), ...params },
  };
};

/** Recipes for the MSA instruments plus the three extras. Harmonics come from measurements and change with the note; the ids match the real samples. */
export const PRESETS: SynthPreset[] = [
  preset({ id: 'organ', label: 'Órgão', family: 'Teclados', origin: 'Cada tubo soa quase como uma senoidal, e o organista soma tubos: 8 pés (harmônico 1), 4 pés (2), 2⅔ pés (3), 2 pés (4) e a mistura. Compare com as ondas "Oitavas" e "Quintas e oitavas".', params: { decay: 0.1, sustain: 1, release: 0.15 } }),
  preset({ id: 'violin', label: 'Violino', family: 'Cordas', origin: 'Perto do dente de serra (a corda puxada pelo arco). Os picos mudam de nota para nota, porque o corpo do violino ressoa sempre nas mesmas frequências.', params: { attack: 0.06, sustain: 0.9, release: 0.3, noise: 0.25 } }),
  preset({ id: 'viola', label: 'Viola', family: 'Cordas', origin: 'Perto do dente de serra, com o corpo maior e mais grave que o do violino. Os picos também mudam de nota para nota.', params: { attack: 0.07, sustain: 0.9, release: 0.3, noise: 0.2 } }),
  preset({ id: 'cello', label: 'Violoncelo', family: 'Cordas', origin: 'Perto do dente de serra. No grave a fundamental domina; subindo, os harmônicos do meio ganham força.', params: { attack: 0.08, sustain: 0.9, release: 0.35, noise: 0.2 } }),
  preset({ id: 'flute', label: 'Flauta', family: 'Madeiras', origin: 'Na região grave, o 2º harmônico é tão forte quanto a fundamental. Uma oitava acima, a flauta vira quase uma senoidal: troque de oitava e compare.', params: { attack: 0.12, decay: 0.2, sustain: 0.9, noise: 0.4 } }),
  preset({ id: 'oboe', label: 'Oboé', family: 'Madeiras', origin: 'A fundamental é mais fraca que os harmônicos do meio: é o som anasalado da palheta dupla.', params: { attack: 0.02, noise: 0.12 } }),
  preset({ id: 'bassoon', label: 'Fagote', family: 'Madeiras', origin: 'Fundamental fraca e agudos que caem rápido. Soa melhor uma oitava abaixo, onde fica o registro dele.', params: { attack: 0.03, noise: 0.1 } }),
  preset({ id: 'clarinet', label: 'Clarinete', family: 'Madeiras', origin: 'No grave (o chalumeau) os harmônicos pares quase somem, como na onda quadrada. Subindo, eles voltam: desça uma oitava e compare.', params: { attack: 0.035, sustain: 0.85, noise: 0.1 } }),
  preset({ id: 'saxophone', label: 'Saxofone', family: 'Madeiras', origin: 'Todos os harmônicos, caindo devagar, por causa do tubo cônico.', params: { attack: 0.05, noise: 0.12 } }),
  preset({ id: 'trumpet', label: 'Trompete', family: 'Metais', origin: 'Os harmônicos mais fortes são o 3º e o 4º, não a fundamental: é o brilho do metal. O filtro se abre no começo da nota.', params: { attack: 0.03, decay: 0.25, sustain: 0.85, resonance: 1.5, filterOpening: 0.7, noise: 0.06 } }),
  preset({ id: 'french-horn', label: 'Trompa', family: 'Metais', origin: 'Os agudos quase somem: a campana virada para trás abafa o som.', params: { attack: 0.05, filterOpening: 0.4 } }),
  preset({ id: 'trombone', label: 'Trombone', family: 'Metais', origin: 'No grave, o pico fica nos harmônicos 3 a 6; no agudo, o som escurece.', params: { attack: 0.04, resonance: 1.2, filterOpening: 0.6 } }),
  preset({ id: 'tuba', label: 'Tuba', family: 'Metais', origin: 'Fundamental forte e poucos harmônicos. Soa melhor uma ou duas oitavas abaixo.', params: { attack: 0.08, filterOpening: 0.3 } }),
  preset({ id: 'piano', label: 'Piano', family: 'Extras', origin: 'Fundamental e 2º harmônico fortes. O que mais marca o piano é o tempo: o martelo bate e o som some, mais depressa nas notas agudas.', params: { sustain: 0, release: 0.3, noise: 0.1 } }),
  preset({ id: 'guitar-nylon', label: 'Violão', family: 'Extras', origin: 'Alguns harmônicos somem, conforme o ponto da corda onde se toca. O som some mais rápido no agudo.', params: { sustain: 0, release: 0.4, noise: 0.15 } }),
  preset({ id: 'harp', label: 'Harpa', family: 'Extras', origin: 'Os harmônicos pares quase somem: a harpa costuma ser tocada perto do meio da corda. Nos graves o som dura mais.', params: { sustain: 0, release: 0.5, noise: 0.08 } }),
];
