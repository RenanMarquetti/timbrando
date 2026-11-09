import { getEngine } from './engine';
import { registerVoice, unregisterVoice } from './player';
import type { ColorChain } from './colorChain';

export type PhraseKind = 'melody' | 'long';

type PlayPhraseArgs = {
  buffer: AudioBuffer;
  chain: ColorChain;
  kind: PhraseKind;
};

type NoteEvent = {
  semitones: number;
  beats: number;
};

type ScheduleNoteArgs = {
  buffer: AudioBuffer;
  chain: ColorChain;
  semitones: number;
  start: number;
  length: number;
};

const BEAT_SECONDS = 0.42;
const RELEASE_SECONDS = 0.12;
const DOUBLE_DETUNE_CENTS = 12;
const OCTAVE_LEVEL = 0.7;
const DOUBLE_LEVEL = 0.6;
const LONG_NOTE_SECONDS = 2.4;

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

const LONG: NoteEvent[] = [{ semitones: 0, beats: LONG_NOTE_SECONDS / BEAT_SECONDS }];

const scheduleLayer = (args: ScheduleNoteArgs & { rate: number; level: number; destination: AudioNode }): (() => void) => {
  const { ctx } = getEngine();
  const source = ctx.createBufferSource();
  const envelope = ctx.createGain();
  const attack = Math.max(0.005, args.chain.attackSeconds());
  const end = args.start + args.length;
  source.buffer = args.buffer;
  source.playbackRate.value = args.rate * 2 ** (args.semitones / 12);
  envelope.gain.setValueAtTime(0, args.start);
  envelope.gain.linearRampToValueAtTime(args.level, args.start + attack);
  envelope.gain.setValueAtTime(args.level, end);
  envelope.gain.linearRampToValueAtTime(0, end + RELEASE_SECONDS);
  source.connect(envelope);
  envelope.connect(args.destination);
  source.start(args.start);
  source.stop(end + RELEASE_SECONDS + 0.02);
  return () => {
    const now = ctx.currentTime;
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setTargetAtTime(0, now, 0.015);
    source.stop(now + 0.08);
  };
};

const scheduleNote = (args: ScheduleNoteArgs): Array<() => void> => {
  const body = args.chain.bodyAmount();
  const main = scheduleLayer({ ...args, rate: 1, level: 1, destination: args.chain.input });
  if (body <= 0) {
    return [main];
  }
  const octave = scheduleLayer({ ...args, rate: 0.5, level: body * OCTAVE_LEVEL, destination: args.chain.octaveInput });
  const double = scheduleLayer({
    ...args,
    rate: 2 ** (DOUBLE_DETUNE_CENTS / 1200),
    level: body * DOUBLE_LEVEL,
    destination: args.chain.octaveInput,
  });
  return [main, octave, double];
};

/** Plays a short phrase (or one long note) through the color chain; returns the total length in seconds. */
export const playPhrase = (args: PlayPhraseArgs): number => {
  const { ctx } = getEngine();
  const events = args.kind === 'melody' ? MELODY : LONG;
  const startAt = ctx.currentTime + 0.05;
  const stops = events.reduce<{ time: number; stops: Array<() => void> }>(
    (acc, event) => {
      const length = event.beats * BEAT_SECONDS;
      const noteStops = scheduleNote({ buffer: args.buffer, chain: args.chain, semitones: event.semitones, start: acc.time, length: length * 0.92 });
      return { time: acc.time + length, stops: [...acc.stops, ...noteStops] };
    },
    { time: startAt, stops: [] },
  );
  const voice = { stop: () => stops.stops.forEach((stop) => stop()) };
  registerVoice(voice);
  window.setTimeout(() => unregisterVoice(voice), (stops.time - ctx.currentTime + 1) * 1000);
  return stops.time - startAt;
};
