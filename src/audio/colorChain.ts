import { getEngine } from './engine';

export type ColorSettings = {
  brightness: number;
  space: number;
  roughness: number;
  body: number;
};

export type ColorChain = {
  input: GainNode;
  octaveInput: GainNode;
  doubleInput: GainNode;
  apply: (settings: ColorSettings) => void;
  attackSeconds: () => number;
};

const REVERB_SECONDS = 2.8;
const MAX_WET = 0.75;
const DARK_CUTOFF = 500;
const OPEN_CUTOFF = 18000;
const BRIGHT_SHELF_DB = 12;
const THIN_HIGHPASS = 1400;
const MAX_SOFT_ATTACK = 0.35;
const CURVE_SIZE = 2048;
const RAMP = 0.08;
const OCTAVE_LEVEL = 0.7;
const DOUBLE_LEVEL = 0.6;

export const NEUTRAL_COLOR: ColorSettings = { brightness: 0, space: 0, roughness: 0, body: 0 };

const buildImpulse = (ctx: BaseAudioContext): AudioBuffer => {
  const length = Math.floor(REVERB_SECONDS * ctx.sampleRate);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  Array.from({ length: 2 }).forEach((_, channel) => {
    const data = impulse.getChannelData(channel);
    data.forEach((_value, index) => {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
    });
  });
  return impulse;
};

const distortionCurve = (amount: number): Float32Array<ArrayBuffer> => {
  const drive = 1 + amount * 40;
  const curve = new Float32Array(CURVE_SIZE);
  curve.forEach((_value, index) => {
    const x = (index / (CURVE_SIZE - 1)) * 2 - 1;
    curve[index] = Math.tanh(drive * x) / Math.tanh(drive);
  });
  return curve;
};

const ramp = (param: AudioParam, value: number, ctx: BaseAudioContext): void => {
  param.setTargetAtTime(value, ctx.currentTime, RAMP / 3);
};

/**
 * Signal path: input -> drive -> lowpass -> highshelf -> highpass -> dry + reverb -> master.
 * Every control is described by how it feels, never by how it works.
 */
export const createColorChain = (): ColorChain => {
  const { ctx, master } = getEngine();
  const input = ctx.createGain();
  const octaveInput = ctx.createGain();
  const doubleInput = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const driveCompensation = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  const shelf = ctx.createBiquadFilter();
  const highpass = ctx.createBiquadFilter();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const reverb = ctx.createConvolver();
  lowpass.type = 'lowpass';
  shelf.type = 'highshelf';
  shelf.frequency.value = 3000;
  highpass.type = 'highpass';
  highpass.frequency.value = 20;
  reverb.buffer = buildImpulse(ctx);
  shaper.oversample = '4x';
  input.connect(shaper);
  octaveInput.connect(shaper);
  doubleInput.connect(shaper);
  shaper.connect(driveCompensation);
  driveCompensation.connect(lowpass);
  lowpass.connect(shelf);
  shelf.connect(highpass);
  highpass.connect(dry);
  highpass.connect(reverb);
  reverb.connect(wet);
  dry.connect(master);
  wet.connect(master);
  let current: ColorSettings = NEUTRAL_COLOR;
  const apply = (settings: ColorSettings): void => {
    current = settings;
    const dark = Math.max(0, -settings.brightness);
    const bright = Math.max(0, settings.brightness);
    const rough = Math.max(0, settings.roughness);
    const thin = Math.max(0, -settings.body);
    const wetAmount = Math.max(0, settings.space) * MAX_WET;
    ramp(lowpass.frequency, OPEN_CUTOFF * (DARK_CUTOFF / OPEN_CUTOFF) ** dark, ctx);
    ramp(shelf.gain, bright * BRIGHT_SHELF_DB, ctx);
    ramp(highpass.frequency, 20 + thin * THIN_HIGHPASS, ctx);
    shaper.curve = distortionCurve(rough);
    ramp(driveCompensation.gain, 1 - rough * 0.55, ctx);
    ramp(dry.gain, 1 - wetAmount * 0.5, ctx);
    ramp(wet.gain, wetAmount, ctx);
    ramp(octaveInput.gain, Math.max(0, settings.body) * OCTAVE_LEVEL, ctx);
    ramp(doubleInput.gain, Math.max(0, settings.body) * DOUBLE_LEVEL, ctx);
  };
  apply(NEUTRAL_COLOR);
  return {
    input,
    octaveInput,
    doubleInput,
    apply,
    attackSeconds: () => Math.max(0, -current.roughness) * MAX_SOFT_ATTACK,
  };
};
