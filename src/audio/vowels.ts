import { CLIP_SECONDS, fadeOut, normalizeRms, type NoteName } from './samples';

export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';

type Formant = {
  frequency: number;
  bandwidth: number;
};

export const VOWELS: Vowel[] = ['a', 'e', 'i', 'o', 'u'];

export const NOTE_FREQUENCIES: Record<NoteName, number> = { A3: 220, A4: 440 };

const UPPER_FORMANTS: Formant[] = [
  { frequency: 3500, bandwidth: 250 },
  { frequency: 4500, bandwidth: 300 },
];

const FORMANTS: Record<Vowel, Formant[]> = {
  a: [{ frequency: 700, bandwidth: 110 }, { frequency: 1220, bandwidth: 120 }, { frequency: 2600, bandwidth: 160 }],
  e: [{ frequency: 420, bandwidth: 80 }, { frequency: 2000, bandwidth: 110 }, { frequency: 2650, bandwidth: 160 }],
  i: [{ frequency: 290, bandwidth: 60 }, { frequency: 2250, bandwidth: 100 }, { frequency: 3000, bandwidth: 170 }],
  o: [{ frequency: 440, bandwidth: 80 }, { frequency: 840, bandwidth: 100 }, { frequency: 2550, bandwidth: 160 }],
  u: [{ frequency: 320, bandwidth: 70 }, { frequency: 780, bandwidth: 90 }, { frequency: 2300, bandwidth: 160 }],
};

const MAX_FREQUENCY = 6000;
const SAMPLE_RATE = 44100;
const ONSET_SECONDS = 0.08;
const END_FADE_SECONDS = 0.3;

const resonance = (formant: Formant, frequency: number): number => {
  const squared = formant.frequency * formant.frequency;
  return squared / Math.sqrt((squared - frequency * frequency) ** 2 + (formant.bandwidth * frequency) ** 2);
};

/** Harmonic amplitudes of a sung vowel: a buzzing source shaped by the resonances of the mouth. */
export const vowelHarmonics = (vowel: Vowel, fundamental: number): number[] => {
  const formants = [...FORMANTS[vowel], ...UPPER_FORMANTS];
  const count = Math.floor(MAX_FREQUENCY / fundamental);
  return Array.from({ length: count }, (_, index) => {
    const harmonic = index + 1;
    const frequency = harmonic * fundamental;
    const envelope = formants.reduce((total, formant) => total * resonance(formant, frequency), 1);
    return envelope / harmonic;
  });
};

const cache = new Map<string, Promise<AudioBuffer>>();

const renderVowel = async (vowel: Vowel, note: NoteName): Promise<AudioBuffer> => {
  const fundamental = NOTE_FREQUENCIES[note];
  const amplitudes = vowelHarmonics(vowel, fundamental);
  const offline = new OfflineAudioContext(1, Math.floor(CLIP_SECONDS * SAMPLE_RATE), SAMPLE_RATE);
  const real = new Float32Array(amplitudes.length + 1);
  const imag = Float32Array.from([0, ...amplitudes]);
  const wave = offline.createPeriodicWave(real, imag, { disableNormalization: true });
  const oscillator = offline.createOscillator();
  const gain = offline.createGain();
  oscillator.setPeriodicWave(wave);
  oscillator.frequency.value = fundamental;
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(1, ONSET_SECONDS);
  oscillator.connect(gain);
  gain.connect(offline.destination);
  oscillator.start();
  const rendered = await offline.startRendering();
  return normalizeRms(fadeOut({ buffer: rendered, seconds: END_FADE_SECONDS }));
};

/** A vowel at the given note, with the same length and strength as every other sound in the comparison. */
export const loadVowel = (vowel: Vowel, note: NoteName): Promise<AudioBuffer> => {
  const key = `${vowel}:${note}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const promise = renderVowel(vowel, note);
  cache.set(key, promise);
  return promise;
};
