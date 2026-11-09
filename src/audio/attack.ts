export const GAME_CUT_SECONDS = 0.15;
const START_FADE_SECONDS = 0.03;

type StartAtArgs = {
  buffer: AudioBuffer;
  seconds: number;
};

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
    return value * (index / rampLength);
  });

/** The sound played from a chosen instant on, with a tiny fade so the cut does not click. */
export const startAt = (args: StartAtArgs): AudioBuffer => {
  const skip = Math.min(Math.floor(args.seconds * args.buffer.sampleRate), args.buffer.length - 1);
  const fade = skip === 0 ? 0 : Math.floor(START_FADE_SECONDS * args.buffer.sampleRate);
  return mapChannels(args.buffer, (data) => rampIn(data.slice(skip), fade), args.buffer.length - skip);
};

export const reverseBuffer = (buffer: AudioBuffer): AudioBuffer => mapChannels(buffer, (data) => data.slice().reverse(), buffer.length);
