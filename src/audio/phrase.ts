import { getEngine } from './engine';
import { registerVoice, unregisterVoice } from './player';
import type { ColorChain } from './colorChain';

type Layer = {
  stop: () => void;
};

type NoteEvent = {
  semitones: number;
  beats: number;
};

type LayerArgs = {
  buffer: AudioBuffer;
  chain: ColorChain;
  semitones: number;
  start: number;
  length: number | null;
  loop: boolean;
};

export type Sustain = {
  stop: () => void;
};

const BEAT_SECONDS = 0.42;
const RELEASE_SECONDS = 0.12;
const DOUBLE_DETUNE_CENTS = 12;
const LOOP_START = 0.5;
const LOOP_END = 2.0;
const LOOP_CROSSFADE = 0.25;

const MELODY: NoteEvent[] = [
  { semitones: 0, beats: 1 },
  { semitones: 3, beats: 1 },
  { semitones: 7, beats: 2 },
  { semitones: 5, beats: 1 },
  { semitones: 3, beats: 1 },
  { semitones: 2, beats: 1 },
  { semitones: 3, beats: 1 },
  { semitones: -1, beats: 1 },
  { semitones: 0, beats: 3 },
];

const loopCache = new WeakMap<AudioBuffer, AudioBuffer>();

/** The attack as recorded, then a seamless loop cut from the steady middle, so a note can be held forever. */
const loopable = (buffer: AudioBuffer): AudioBuffer => {
  const cached = loopCache.get(buffer);
  if (cached) {
    return cached;
  }
  const rate = buffer.sampleRate;
  const start = Math.floor(LOOP_START * rate);
  const fade = Math.floor(LOOP_CROSSFADE * rate);
  const length = Math.floor((LOOP_END - LOOP_START) * rate) - fade;
  const source = buffer.getChannelData(0);
  const result = new AudioBuffer({ length: start + length, numberOfChannels: 1, sampleRate: rate });
  const data = result.getChannelData(0);
  data.set(source.subarray(0, start));
  Array.from({ length }).forEach((_value, index) => {
    const body = source[start + index] ?? 0;
    if (index >= fade) {
      data[start + index] = body;
      return;
    }
    const tail = source[start + length + index] ?? 0;
    const mix = index / fade;
    data[start + index] = body * Math.sqrt(mix) + tail * Math.sqrt(1 - mix);
  });
  loopCache.set(buffer, result);
  return result;
};

const startLayer = (args: LayerArgs & { rate: number; destination: AudioNode }): Layer => {
  const { ctx } = getEngine();
  const source = ctx.createBufferSource();
  const envelope = ctx.createGain();
  const attack = Math.max(0.005, args.chain.attackSeconds());
  source.buffer = args.loop ? loopable(args.buffer) : args.buffer;
  source.loop = args.loop;
  source.loopStart = LOOP_START;
  source.loopEnd = source.buffer.duration;
  source.playbackRate.value = args.rate * 2 ** (args.semitones / 12);
  envelope.gain.setValueAtTime(0, args.start);
  envelope.gain.linearRampToValueAtTime(1, args.start + attack);
  source.connect(envelope);
  envelope.connect(args.destination);
  source.start(args.start);
  if (args.length !== null) {
    const end = args.start + args.length;
    envelope.gain.setValueAtTime(1, end);
    envelope.gain.linearRampToValueAtTime(0, end + RELEASE_SECONDS);
    source.stop(end + RELEASE_SECONDS + 0.02);
  }
  return {
    stop: () => {
      const now = ctx.currentTime;
      envelope.gain.cancelScheduledValues(now);
      envelope.gain.setTargetAtTime(0, now, 0.03);
      source.stop(now + 0.2);
    },
  };
};

const startNote = (args: LayerArgs): Layer[] => [
  startLayer({ ...args, rate: 1, destination: args.chain.input }),
  startLayer({ ...args, rate: 0.5, destination: args.chain.octaveInput }),
  startLayer({ ...args, rate: 2 ** (DOUBLE_DETUNE_CENTS / 1200), destination: args.chain.doubleInput }),
];

/** Plays a short phrase through the color chain. */
export const playPhrase = (buffer: AudioBuffer, chain: ColorChain): void => {
  const { ctx } = getEngine();
  const startAt = ctx.currentTime + 0.05;
  const scheduled = MELODY.reduce<{ time: number; layers: Layer[] }>(
    (acc, event) => {
      const length = event.beats * BEAT_SECONDS;
      const layers = startNote({ buffer, chain, semitones: event.semitones, start: acc.time, length: length * 0.92, loop: false });
      return { time: acc.time + length, layers: [...acc.layers, ...layers] };
    },
    { time: startAt, layers: [] },
  );
  const voice = { stop: () => scheduled.layers.forEach((layer) => layer.stop()) };
  registerVoice(voice);
  window.setTimeout(() => unregisterVoice(voice), (scheduled.time - ctx.currentTime + 1) * 1000);
};

/** Holds one note until stopped; the color controls keep changing it live. */
export const sustainNote = (buffer: AudioBuffer, chain: ColorChain): Sustain => {
  const { ctx } = getEngine();
  const layers = startNote({ buffer, chain, semitones: 0, start: ctx.currentTime + 0.02, length: null, loop: true });
  const voice = {
    stop: () => {
      layers.forEach((layer) => layer.stop());
      unregisterVoice(voice);
    },
  };
  registerVoice(voice);
  return voice;
};
