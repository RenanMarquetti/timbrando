import sampleMap from './sampleMap.json';

export type NoteName = 'A3' | 'A4';

export type Instrument = {
  id: string;
  label: string;
};

type SampleRef = {
  file: string;
  shift: number;
};

type PrepareArgs = {
  instrumentId: string;
  note: NoteName;
};

type FadeArgs = {
  buffer: AudioBuffer;
  seconds: number;
};

export const INSTRUMENTS: Instrument[] = [
  { id: 'violin', label: 'Violino' },
  { id: 'cello', label: 'Violoncelo' },
  { id: 'flute', label: 'Flauta' },
  { id: 'clarinet', label: 'Clarinete' },
  { id: 'saxophone', label: 'Saxofone' },
  { id: 'trumpet', label: 'Trompete' },
  { id: 'french-horn', label: 'Trompa' },
  { id: 'bassoon', label: 'Fagote' },
  { id: 'piano', label: 'Piano' },
  { id: 'guitar-nylon', label: 'Violão' },
  { id: 'harp', label: 'Harpa' },
  { id: 'organ', label: 'Órgão' },
  { id: 'harmonium', label: 'Harmônio' },
];

export const CLIP_SECONDS = 2.6;
export const TARGET_RMS = 0.08;
const RMS_WINDOW_START = 0.15;
const RMS_WINDOW_END = 1.2;
const END_FADE_SECONDS = 0.35;
const SAMPLE_RATE = 44100;

const rawCache = new Map<string, Promise<AudioBuffer>>();
const preparedCache = new Map<string, Promise<AudioBuffer>>();

const samples = sampleMap as Record<string, Partial<Record<NoteName, SampleRef>>>;

export const hasNote = (instrumentId: string, note: NoteName): boolean => Boolean(samples[instrumentId]?.[note]);

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
  const ref = samples[args.instrumentId]?.[args.note];
  if (!ref) {
    throw new Error(`No sample for ${args.instrumentId} ${args.note}`);
  }
  const raw = await loadRaw(ref.file);
  const shifted = await renderShifted(raw, ref.shift);
  return normalizeRms(fadeOut({ buffer: shifted, seconds: END_FADE_SECONDS }));
};

/** Same note, same length, same strength: only the instrument changes. */
export const loadPrepared = (args: PrepareArgs): Promise<AudioBuffer> => {
  const key = `${args.instrumentId}:${args.note}`;
  const cached = preparedCache.get(key);
  if (cached) {
    return cached;
  }
  const promise = buildPrepared(args);
  preparedCache.set(key, promise);
  return promise;
};
