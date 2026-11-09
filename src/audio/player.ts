import { getEngine } from './engine';

type Voice = {
  stop: () => void;
};

type PlayBufferArgs = {
  buffer: AudioBuffer;
  destination?: AudioNode;
  playbackRate?: number;
  when?: number;
  gain?: number;
};

const FADE_SECONDS = 0.04;

let activeVoices: Voice[] = [];

/** Stops everything the app is playing, with a short fade so nothing clicks. */
export const stopAll = (): void => {
  activeVoices.forEach((voice) => voice.stop());
  activeVoices = [];
};

export const registerVoice = (voice: Voice): void => {
  activeVoices.push(voice);
};

export const unregisterVoice = (voice: Voice): void => {
  activeVoices = activeVoices.filter((item) => item !== voice);
};

/** Plays a buffer once through the master bus (or a given node) and returns a handle to stop it. */
export const playBuffer = (args: PlayBufferArgs): Voice => {
  const { ctx, master } = getEngine();
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  const start = args.when ?? ctx.currentTime;
  source.buffer = args.buffer;
  source.playbackRate.value = args.playbackRate ?? 1;
  gainNode.gain.value = args.gain ?? 1;
  source.connect(gainNode);
  gainNode.connect(args.destination ?? master);
  source.start(start);
  const voice: Voice = {
    stop: () => {
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
      source.stop(now + FADE_SECONDS + 0.01);
    },
  };
  source.onended = () => unregisterVoice(voice);
  registerVoice(voice);
  return voice;
};
