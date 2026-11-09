import { cloneBuffer } from './samples';

export type AttackMode = 'whole' | 'cut' | 'soft' | 'reverse';

type ShapeArgs = {
  buffer: AudioBuffer;
  mode: AttackMode;
};

export const CUT_SECONDS = 0.15;
const CUT_FADE_SECONDS = 0.04;
const SOFT_SECONDS = 0.6;

const mapChannels = (buffer: AudioBuffer, transform: (data: Float32Array<ArrayBuffer>) => Float32Array<ArrayBuffer>, length: number): AudioBuffer => {
  const result = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  Array.from({ length: buffer.numberOfChannels }).forEach((_, channel) => {
    result.copyToChannel(transform(buffer.getChannelData(channel)), channel);
  });
  return result;
};

const rampIn = (data: Float32Array<ArrayBuffer>, rampLength: number): Float32Array<ArrayBuffer> =>
  data.map((value, index) => {
    if (index >= rampLength) {
      return value;
    }
    const position = index / rampLength;
    return value * position * position;
  });

/** Removes the first instants of the sound and fades in quickly, like Schaeffer's tape experiment. */
const cutAttack = (buffer: AudioBuffer): AudioBuffer => {
  const skip = Math.floor(CUT_SECONDS * buffer.sampleRate);
  const fade = Math.floor(CUT_FADE_SECONDS * buffer.sampleRate);
  return mapChannels(buffer, (data) => rampIn(data.slice(skip), fade), buffer.length - skip);
};

const softAttack = (buffer: AudioBuffer): AudioBuffer => {
  const fade = Math.floor(SOFT_SECONDS * buffer.sampleRate);
  return mapChannels(buffer, (data) => rampIn(data.slice(), fade), buffer.length);
};

const reverseBuffer = (buffer: AudioBuffer): AudioBuffer => mapChannels(buffer, (data) => data.slice().reverse(), buffer.length);

/** Returns a new buffer with the beginning of the sound changed; the original stays untouched. */
export const shapeAttack = (args: ShapeArgs): AudioBuffer => {
  if (args.mode === 'cut') {
    return cutAttack(args.buffer);
  }
  if (args.mode === 'soft') {
    return softAttack(args.buffer);
  }
  if (args.mode === 'reverse') {
    return reverseBuffer(args.buffer);
  }
  return cloneBuffer(args.buffer);
};
