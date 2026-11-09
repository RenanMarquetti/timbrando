import { PitchDetector } from 'pitchy';
import { getEngine, isMicOn } from './engine';

export type Reading = {
  frequency: number | null;
  noteLabel: string;
  cents: number;
  level: number;
};

const NOTE_NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
const MIN_CLARITY = 0.88;
const SILENCE_DB = -60;
const MIN_FREQUENCY = 40;
const MAX_FREQUENCY = 2500;
const PITCH_WINDOW = 4096;
const APP_ACTIVE_DB = -55;

export type Listening = {
  reading: Reading;
  analyser: AnalyserNode;
  source: 'app' | 'mic' | 'none';
};

const detectors = new Map<number, PitchDetector<Float32Array>>();
const buffers = new Map<number, Float32Array<ArrayBuffer>>();

const getDetector = (size: number): PitchDetector<Float32Array> => {
  const cached = detectors.get(size);
  if (cached) {
    return cached;
  }
  const detector = PitchDetector.forFloat32Array(size);
  detectors.set(size, detector);
  return detector;
};

const getBuffer = (size: number): Float32Array<ArrayBuffer> => {
  const cached = buffers.get(size);
  if (cached) {
    return cached;
  }
  const buffer = new Float32Array(size);
  buffers.set(size, buffer);
  return buffer;
};

export const toDecibels = (rms: number): number => {
  if (rms <= 0) {
    return -Infinity;
  }
  return 20 * Math.log10(rms);
};

/** "Lá 3" for 220 Hz, plus how many cents off the nearest note. */
export const describeFrequency = (frequency: number): { noteLabel: string; cents: number } => {
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const nearest = Math.round(midi);
  const name = NOTE_NAMES[((nearest % 12) + 12) % 12];
  const octave = Math.floor(nearest / 12) - 1;
  return { noteLabel: `${name} ${octave}`, cents: Math.round((midi - nearest) * 100) };
};

/** Reads pitch and loudness from what an analyser is hearing right now. */
export const readAnalyser = (analyser: AnalyserNode): Reading => {
  const buffer = getBuffer(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);
  const rms = Math.sqrt(buffer.reduce((total, value) => total + value * value, 0) / buffer.length);
  const level = toDecibels(rms);
  if (level < SILENCE_DB) {
    return { frequency: null, noteLabel: '—', cents: 0, level };
  }
  const window = buffer.subarray(buffer.length - PITCH_WINDOW);
  const [frequency, clarity] = getDetector(PITCH_WINDOW).findPitch(window, analyser.context.sampleRate);
  if (clarity < MIN_CLARITY || frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
    return { frequency: null, noteLabel: '—', cents: 0, level };
  }
  return { frequency, level, ...describeFrequency(frequency) };
};

/** What the class is hearing: the app's own sound while it plays, otherwise the microphone (if on). */
export const readListening = (): Listening => {
  const { outAnalyser, micAnalyser } = getEngine();
  const app = readAnalyser(outAnalyser);
  if (app.level > APP_ACTIVE_DB || !isMicOn()) {
    return { reading: app, analyser: outAnalyser, source: app.level > APP_ACTIVE_DB ? 'app' : 'none' };
  }
  return { reading: readAnalyser(micAnalyser), analyser: micAnalyser, source: 'mic' };
};
