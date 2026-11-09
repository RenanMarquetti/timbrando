import { getEngine } from './engine';
import { registerVoice, unregisterVoice } from './player';

export type SynthParams = {
  harmonics: number[];
  signs: number[];
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  noise: number;
  cutoff: number;
  resonance: number;
  filterOpening: number;
  vibratoRate: number;
  vibratoDepth: number;
};

export type SynthNote = {
  release: () => void;
  update: (params: SynthParams) => void;
};

export const HARMONIC_COUNT = 16;
const NOISE_SECONDS = 0.25;
const PEAK_LEVEL = 0.35;
const MIN_TIME = 0.003;

let noiseBuffer: AudioBuffer | null = null;

const getNoise = (ctx: BaseAudioContext): AudioBuffer => {
  if (noiseBuffer) {
    return noiseBuffer;
  }
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  data.forEach((_value, index) => {
    data[index] = Math.random() * 2 - 1;
  });
  noiseBuffer = buffer;
  return buffer;
};

const holdAt = (param: AudioParam, time: number): void => {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
    return;
  }
  const value = param.value;
  param.cancelScheduledValues(time);
  param.setValueAtTime(value, time);
};

/** The waveform that the harmonic recipe produces: one period, for drawing. */
export const waveShape = (params: SynthParams, points: number): number[] => {
  const raw = Array.from({ length: points }, (_, index) => {
    const phase = (index / points) * Math.PI * 2;
    return params.harmonics.reduce((total, amplitude, harmonic) => total + params.signs[harmonic] * amplitude * Math.sin((harmonic + 1) * phase), 0);
  });
  const peak = Math.max(...raw.map(Math.abs), 1e-6);
  return raw.map((value) => value / peak);
};

const buildWave = (ctx: BaseAudioContext, params: SynthParams): PeriodicWave => {
  const real = new Float32Array(HARMONIC_COUNT + 1);
  const imag = Float32Array.from([0, ...params.harmonics.map((amplitude, index) => amplitude * params.signs[index])]);
  return ctx.createPeriodicWave(real, imag);
};

const startNoise = (ctx: AudioContext, params: SynthParams, frequency: number, destination: AudioNode, start: number): void => {
  if (params.noise <= 0) {
    return;
  }
  const source = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = getNoise(ctx);
  band.type = 'bandpass';
  band.frequency.value = Math.min(frequency * 4, 8000);
  band.Q.value = 0.8;
  gain.gain.setValueAtTime(params.noise * 0.8, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + Math.max(0.05, params.attack + 0.08));
  source.connect(band);
  band.connect(gain);
  gain.connect(destination);
  source.start(start);
  source.stop(start + NOISE_SECONDS);
};

type Vibrato = {
  lfo: OscillatorNode;
  depth: GainNode;
};

const startVibrato = (ctx: AudioContext, params: SynthParams, oscillator: OscillatorNode, start: number): Vibrato => {
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = params.vibratoRate;
  depth.gain.setValueAtTime(0, start);
  depth.gain.linearRampToValueAtTime(params.vibratoDepth, start + 0.35);
  lfo.connect(depth);
  depth.connect(oscillator.detune);
  lfo.start(start);
  return { lfo, depth };
};

/** Starts a held note; call release() when the key is let go. */
export const startNote = (params: SynthParams, frequency: number): SynthNote => {
  const { ctx, master } = getEngine();
  const start = ctx.currentTime + 0.01;
  const oscillator = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  const attack = Math.max(MIN_TIME, params.attack);
  const decay = Math.max(MIN_TIME, params.decay);
  const closed = Math.max(80, params.cutoff * (1 - params.filterOpening * 0.85));
  oscillator.setPeriodicWave(buildWave(ctx, params));
  oscillator.frequency.value = frequency;
  filter.type = 'lowpass';
  filter.Q.value = params.resonance;
  filter.frequency.setValueAtTime(closed, start);
  filter.frequency.linearRampToValueAtTime(params.cutoff, start + attack + decay * 0.5);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(PEAK_LEVEL, start + attack);
  amp.gain.setTargetAtTime(PEAK_LEVEL * params.sustain, start + attack, decay / 3);
  oscillator.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  startNoise(ctx, params, frequency, filter, start);
  const vibrato = startVibrato(ctx, params, oscillator, start);
  oscillator.start(start);
  let released = false;
  const voice = {
    stop: () => {
      if (released) {
        return;
      }
      released = true;
      const now = ctx.currentTime;
      const release = Math.max(0.01, params.release);
      holdAt(amp.gain, now);
      amp.gain.setTargetAtTime(0, now, release / 4);
      oscillator.stop(now + release + 0.1);
      vibrato.lfo.stop(now + release + 0.1);
      unregisterVoice(voice);
    },
  };
  registerVoice(voice);
  const update = (next: SynthParams): void => {
    if (released) {
      return;
    }
    const now = ctx.currentTime;
    oscillator.setPeriodicWave(buildWave(ctx, next));
    filter.frequency.cancelScheduledValues(now);
    filter.frequency.setTargetAtTime(next.cutoff, now, 0.03);
    filter.Q.setTargetAtTime(next.resonance, now, 0.03);
    vibrato.lfo.frequency.setTargetAtTime(next.vibratoRate, now, 0.05);
    vibrato.depth.gain.cancelScheduledValues(now);
    vibrato.depth.gain.setTargetAtTime(next.vibratoDepth, now, 0.05);
    if (now > start + attack + decay) {
      amp.gain.cancelScheduledValues(now);
      amp.gain.setTargetAtTime(PEAK_LEVEL * next.sustain, now, 0.05);
    }
  };
  return { release: voice.stop, update };
};
