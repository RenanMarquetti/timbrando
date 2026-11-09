import sampleMap from './sampleMap.json';

export type Instrument = {
  id: string;
  label: string;
  sustained: boolean;
};

export type Family = {
  label: string;
  instruments: Instrument[];
};

type SampleRef = {
  midi: number;
  file: string;
};

type PrepareArgs = {
  instrumentId: string;
  midi: number;
};

type FadeArgs = {
  buffer: AudioBuffer;
  seconds: number;
};

/** Families and order of the MSA (Método Simplificado de Aprendizagem Musical), plus three extras for the attack. */
export const FAMILIES: Family[] = [
  { label: 'Teclados', instruments: [{ id: 'organ', label: 'Órgão', sustained: true }] },
  {
    label: 'Cordas',
    instruments: [
      { id: 'violin', label: 'Violino', sustained: true },
      { id: 'viola', label: 'Viola', sustained: true },
      { id: 'cello', label: 'Violoncelo', sustained: true },
    ],
  },
  {
    label: 'Madeiras',
    instruments: [
      { id: 'flute', label: 'Flauta', sustained: true },
      { id: 'oboe', label: 'Oboé', sustained: true },
      { id: 'bassoon', label: 'Fagote', sustained: true },
      { id: 'clarinet', label: 'Clarinete', sustained: true },
      { id: 'saxophone', label: 'Saxofone', sustained: true },
    ],
  },
  {
    label: 'Metais',
    instruments: [
      { id: 'trumpet', label: 'Trompete', sustained: true },
      { id: 'french-horn', label: 'Trompa', sustained: true },
      { id: 'trombone', label: 'Trombone', sustained: true },
      { id: 'tuba', label: 'Tuba', sustained: true },
    ],
  },
  {
    label: 'Extras',
    instruments: [
      { id: 'piano', label: 'Piano', sustained: false },
      { id: 'guitar-nylon', label: 'Violão', sustained: false },
      { id: 'harp', label: 'Harpa', sustained: false },
    ],
  },
];

export const INSTRUMENTS: Instrument[] = FAMILIES.flatMap((family) => family.instruments);

export const CLIP_SECONDS = 2.6;
export const TARGET_RMS = 0.08;
export const LOWEST_MIDI = 48;
export const HIGHEST_MIDI = 72;
const MAX_SHIFT = 2;
const RMS_WINDOW_START = 0.15;
const RMS_WINDOW_END = 1.2;
const END_FADE_SECONDS = 0.35;
const SAMPLE_RATE = 44100;

const rawCache = new Map<string, Promise<AudioBuffer>>();
const preparedCache = new Map<string, Promise<AudioBuffer>>();

const samples = sampleMap as Record<string, SampleRef[]>;

const nearestSample = (instrumentId: string, midi: number): SampleRef | null => {
  const refs = samples[instrumentId] ?? [];
  const best = refs.reduce<SampleRef | null>((closest, ref) => {
    if (!closest || Math.abs(ref.midi - midi) < Math.abs(closest.midi - midi)) {
      return ref;
    }
    return closest;
  }, null);
  if (!best || Math.abs(best.midi - midi) > MAX_SHIFT) {
    return null;
  }
  return best;
};

export const hasNote = (instrumentId: string, midi: number): boolean => nearestSample(instrumentId, midi) !== null;

export const instrumentLabel = (instrumentId: string): string => INSTRUMENTS.find((item) => item.id === instrumentId)?.label ?? instrumentId;

const decodeFile = async (file: string): Promise<AudioBuffer> => {
  const response = await fetch(`samples/${file}`);
  const data = await response.arrayBuffer();
  const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  return decoder.decodeAudioData(data);
};

const loadRaw = (file: string): Promise<AudioBuffer> => {
  const cached = rawCache.get(file);
  if (cached) {
    return cached;
  }
  const promise = decodeFile(file);
  rawCache.set(file, promise);
  return promise;
};

/** Copies a buffer into a new one, so transforms never touch the cached original. */
export const cloneBuffer = (buffer: AudioBuffer): AudioBuffer => {
  const copy = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  Array.from({ length: buffer.numberOfChannels }).forEach((_, channel) => copy.copyToChannel(buffer.getChannelData(channel), channel));
  return copy;
};

export const measureRms = (buffer: AudioBuffer, startSeconds: number, endSeconds: number): number => {
  const data = buffer.getChannelData(0);
  const start = Math.min(Math.floor(startSeconds * buffer.sampleRate), data.length - 1);
  const end = Math.min(Math.floor(endSeconds * buffer.sampleRate), data.length);
  const slice = data.subarray(start, Math.max(end, start + 1));
  const sum = slice.reduce((total, value) => total + value * value, 0);
  return Math.sqrt(sum / slice.length);
};

const scaleBuffer = (buffer: AudioBuffer, factor: number): AudioBuffer => {
  const copy = cloneBuffer(buffer);
  Array.from({ length: copy.numberOfChannels }).forEach((_, channel) => {
    const data = copy.getChannelData(channel);
    data.forEach((value, index) => {
      data[index] = value * factor;
    });
  });
  return copy;
};

/** Brings the steady part of the sound to the same RMS level, so every timbre is equally strong. */
export const normalizeRms = (buffer: AudioBuffer): AudioBuffer => {
  const rms = measureRms(buffer, RMS_WINDOW_START, RMS_WINDOW_END);
  if (rms === 0) {
    return buffer;
  }
  return scaleBuffer(buffer, TARGET_RMS / rms);
};

export const fadeOut = (args: FadeArgs): AudioBuffer => {
  const copy = cloneBuffer(args.buffer);
  const fadeLength = Math.floor(args.seconds * copy.sampleRate);
  const fadeStart = copy.length - fadeLength;
  Array.from({ length: copy.numberOfChannels }).forEach((_, channel) => {
    const data = copy.getChannelData(channel);
    data.forEach((value, index) => {
      if (index >= fadeStart) {
        data[index] = value * ((copy.length - index) / fadeLength);
      }
    });
  });
  return copy;
};

const renderShifted = async (raw: AudioBuffer, shift: number): Promise<AudioBuffer> => {
  const offline = new OfflineAudioContext(1, Math.floor(CLIP_SECONDS * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = raw;
  source.playbackRate.value = 2 ** (shift / 12);
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
};

const buildPrepared = async (args: PrepareArgs): Promise<AudioBuffer> => {
  const ref = nearestSample(args.instrumentId, args.midi);
  if (!ref) {
    throw new Error(`No sample for ${args.instrumentId} ${args.midi}`);
  }
  const raw = await loadRaw(ref.file);
  const shifted = await renderShifted(raw, args.midi - ref.midi);
  return normalizeRms(fadeOut({ buffer: shifted, seconds: END_FADE_SECONDS }));
};

/** Same note, same length, same strength: only the instrument changes. */
export const loadPrepared = (args: PrepareArgs): Promise<AudioBuffer> => {
  const key = `${args.instrumentId}:${args.midi}`;
  const cached = preparedCache.get(key);
  if (cached) {
    return cached;
  }
  const promise = buildPrepared(args);
  preparedCache.set(key, promise);
  return promise;
};
