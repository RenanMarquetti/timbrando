import { getEngine } from '../audio/engine';
import { playBuffer, stopAll } from '../audio/player';
import { hasNote, INSTRUMENTS, loadPrepared } from '../audio/samples';
import { HARMONIC_COUNT, startNote, waveShape, type SynthNote, type SynthParams } from '../audio/synth';
import { DEFAULT_PARAMS, PRESETS, WAVES, type WaveName } from '../audio/synthPresets';
import { cssVar, fitCanvas, h } from '../ui/dom';
import type { SpectrumView } from '../ui/spectrum';

type NumericKey = Exclude<keyof SynthParams, 'harmonics' | 'signs'>;

type SliderSpec = {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  log?: boolean;
  format: (value: number) => string;
};

type Key = {
  midi: number;
  black: boolean;
};

const SLIDER_STEPS = 1000;
const WAVE_POINTS = 400;
const LOWEST_MIDI = 57;
const KEY_COUNT = 13;
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const NOTE_LETTERS = ['Dó', '', 'Ré', '', 'Mi', 'Fá', '', 'Sol', '', 'Lá', '', 'Si'];

const seconds = (value: number): string => (value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`);
const percent = (value: number): string => `${Math.round(value * 100)}%`;

const ENVELOPE: SliderSpec[] = [
  { key: 'attack', label: 'Ataque', min: 0.003, max: 1.5, log: true, format: seconds },
  { key: 'decay', label: 'Queda', min: 0.01, max: 2, log: true, format: seconds },
  { key: 'sustain', label: 'Sustentação', min: 0, max: 1, format: percent },
  { key: 'release', label: 'Final', min: 0.01, max: 3, log: true, format: seconds },
  { key: 'noise', label: 'Ruído do começo', min: 0, max: 1, format: percent },
];

const FILTER: SliderSpec[] = [
  { key: 'cutoff', label: 'Abafamento (brilho)', min: 150, max: 16000, log: true, format: (value) => `${Math.round(value)} Hz` },
  { key: 'resonance', label: 'Ressonância', min: 0.5, max: 15, log: true, format: (value) => value.toFixed(1) },
  { key: 'filterOpening', label: 'Abrir no começo', min: 0, max: 1, format: percent },
];

const VIBRATO: SliderSpec[] = [
  { key: 'vibratoRate', label: 'Vibrato: velocidade', min: 0.5, max: 9, format: (value) => `${value.toFixed(1)} Hz` },
  { key: 'vibratoDepth', label: 'Vibrato: profundidade', min: 0, max: 60, format: (value) => `${Math.round(value)} cents` },
];

const toSlider = (spec: SliderSpec, value: number): number => {
  if (spec.log) {
    return (Math.log(value / spec.min) / Math.log(spec.max / spec.min)) * SLIDER_STEPS;
  }
  return ((value - spec.min) / (spec.max - spec.min)) * SLIDER_STEPS;
};

const fromSlider = (spec: SliderSpec, position: number): number => {
  const fraction = position / SLIDER_STEPS;
  if (spec.log) {
    return spec.min * (spec.max / spec.min) ** fraction;
  }
  return spec.min + fraction * (spec.max - spec.min);
};

const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const drawShape = (canvas: HTMLCanvasElement, params: SynthParams): void => {
  const context = fitCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const shape = waveShape(params, WAVE_POINTS);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = cssVar('--line');
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();
  context.strokeStyle = cssVar('--accent');
  context.lineWidth = 2.5;
  context.beginPath();
  [...shape, ...shape].forEach((value, index) => {
    const x = (index / (WAVE_POINTS * 2)) * width;
    const y = height / 2 - value * (height / 2 - 4);
    if (index === 0) {
      context.moveTo(x, y);
      return;
    }
    context.lineTo(x, y);
  });
  context.stroke();
};

const drawEnvelope = (canvas: HTMLCanvasElement, params: SynthParams): void => {
  const context = fitCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const hold = 0.6;
  const total = params.attack + params.decay + hold + params.release;
  const x = (time: number): number => (time / total) * (width - 8) + 4;
  const y = (level: number): number => height - 4 - level * (height - 8);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = cssVar('--level');
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(x(0), y(0));
  context.lineTo(x(params.attack), y(1));
  context.lineTo(x(params.attack + params.decay), y(params.sustain));
  context.lineTo(x(params.attack + params.decay + hold), y(params.sustain));
  context.lineTo(x(total), y(0));
  context.stroke();
};

const buildKeys = (): Key[] =>
  Array.from({ length: KEY_COUNT }, (_, index) => {
    const midi = LOWEST_MIDI + index;
    return { midi, black: BLACK_KEYS.has(midi % 12) };
  });

/** Part 2: see the harmonics and build timbres by hand. */
export const createLab = (spectrum: SpectrumView): HTMLElement => {
  let params: SynthParams = { ...DEFAULT_PARAMS, harmonics: [...DEFAULT_PARAMS.harmonics], signs: [...DEFAULT_PARAMS.signs] };
  let octaveShift = 0;
  let latched: SynthNote | null = null;
  const harmonicInputs: HTMLInputElement[] = [];
  const sliderInputs = new Map<NumericKey, { input: HTMLInputElement; output: HTMLElement; spec: SliderSpec }>();
  const shapeCanvas = h('canvas', { class: 'shape' });
  const envelopeCanvas = h('canvas', { class: 'envelope' });
  const redraw = (): void => {
    drawShape(shapeCanvas, params);
    drawEnvelope(envelopeCanvas, params);
  };
  const syncControls = (): void => {
    harmonicInputs.forEach((input, index) => {
      input.value = String(Math.round(params.harmonics[index] * 100));
    });
    sliderInputs.forEach(({ input, output, spec }) => {
      input.value = String(Math.round(toSlider(spec, params[spec.key])));
      output.textContent = spec.format(params[spec.key]);
    });
    redraw();
  };
  const restartLatched = (): void => {
    if (!latched) {
      return;
    }
    latched.release();
    latched = startNote(params, midiToHz(LOWEST_MIDI + octaveShift * 12));
  };
  const setParams = (next: SynthParams): void => {
    params = next;
    syncControls();
    restartLatched();
  };
  const harmonicSlider = (index: number): HTMLElement => {
    const input = h('input', { type: 'range', min: 0, max: 100, value: 0, class: 'vertical', 'aria-label': `Harmônico ${index + 1}` });
    input.addEventListener('input', () => {
      const harmonics = params.harmonics.map((value, position) => (position === index ? Number(input.value) / 100 : value));
      params = { ...params, harmonics };
      redraw();
    });
    input.addEventListener('change', restartLatched);
    harmonicInputs.push(input);
    return h('label', { class: 'harmonic' }, input, h('span', {}, String(index + 1)));
  };
  const specSlider = (spec: SliderSpec): HTMLElement => {
    const output = h('output', {}, '');
    const input = h('input', { type: 'range', min: 0, max: SLIDER_STEPS, value: 0, 'aria-label': spec.label });
    input.addEventListener('input', () => {
      params = { ...params, [spec.key]: fromSlider(spec, Number(input.value)) };
      output.textContent = spec.format(params[spec.key]);
      redraw();
    });
    input.addEventListener('change', restartLatched);
    sliderInputs.set(spec.key, { input, output, spec });
    return h('label', { class: 'param' }, h('span', {}, spec.label), input, output);
  };
  const waveButtons = (Object.keys(WAVES) as WaveName[]).map((name) =>
    h('button', {
      type: 'button',
      class: 'sound',
      onclick: () => setParams({ ...params, harmonics: [...WAVES[name].harmonics], signs: [...WAVES[name].signs] }),
    }, WAVES[name].label),
  );
  const presetButtons = PRESETS.map((preset) =>
    h('button', { type: 'button', class: 'sound', onclick: () => setParams({ ...preset.params, harmonics: [...preset.params.harmonics], signs: [...preset.params.signs] }) }, preset.label),
  );
  const realSelect = h('select', { 'aria-label': 'Instrumento real' }, ...INSTRUMENTS.filter((item) => hasNote(item.id, 'A3')).map((item) => h('option', { value: item.id }, item.label)));
  const playReal = async (): Promise<void> => {
    getEngine();
    stopAll();
    latched = null;
    playBuffer({ buffer: await loadPrepared({ instrumentId: realSelect.value, note: 'A3' }) });
  };
  const keyboard = h('div', { class: 'keyboard', role: 'group', 'aria-label': 'Teclado' });
  const renderKeys = (): void => {
    keyboard.replaceChildren(
      ...buildKeys().map((key) => {
        const midi = key.midi + octaveShift * 12;
        const label = NOTE_LETTERS[midi % 12];
        const button = h('button', { type: 'button', class: key.black ? 'key black' : 'key', 'aria-label': `Nota ${midi}` }, label);
        let note: SynthNote | null = null;
        const release = (): void => {
          note?.release();
          note = null;
          button.classList.remove('down');
        };
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          getEngine();
          button.setPointerCapture(event.pointerId);
          note = startNote(params, midiToHz(midi));
          button.classList.add('down');
        });
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', release);
        return button;
      }),
    );
  };
  const octaveLabel = h('span', { class: 'muted' }, '');
  const setOctave = (shift: number): void => {
    octaveShift = Math.max(-1, Math.min(2, shift));
    octaveLabel.textContent = `Lá ${3 + octaveShift} a Lá ${4 + octaveShift}`;
    renderKeys();
  };
  const latchButton = h('button', { type: 'button', class: 'primary' }, '▶ Nota longa');
  latchButton.addEventListener('click', () => {
    getEngine();
    if (latched) {
      latched.release();
      latched = null;
      latchButton.textContent = '▶ Nota longa';
      return;
    }
    latched = startNote(params, midiToHz(LOWEST_MIDI + octaveShift * 12));
    latchButton.textContent = '■ Parar nota';
  });
  setOctave(0);
  const element = h(
    'div',
    { class: 'lab' },
    h(
      'section',
      { class: 'card', id: 'espectro' },
      h('h2', {}, 'Espectro'),
      h('p', { class: 'prompt' }, 'Cada pico é um harmônico. Toque no laboratório, num instrumento real ou no microfone (botão lá em cima).'),
      spectrum.element,
    ),
    h(
      'section',
      { class: 'card', id: 'laboratorio' },
      h('h2', {}, 'Laboratório de timbres'),
      h('div', { class: 'toolbar' }, latchButton, h('button', { type: 'button', class: 'secondary', onclick: () => setOctave(octaveShift - 1) }, '− oitava'), octaveLabel, h('button', { type: 'button', class: 'secondary', onclick: () => setOctave(octaveShift + 1) }, '+ oitava')),
      keyboard,
      h('h3', {}, 'Onda geradora'),
      h('div', { class: 'grid' }, ...waveButtons),
      h('h3', {}, 'Imitar um instrumento'),
      h('div', { class: 'grid' }, ...presetButtons),
      h('div', { class: 'toolbar' }, h('span', { class: 'muted' }, 'Comparar com o real:'), realSelect, h('button', { type: 'button', class: 'secondary', onclick: () => void playReal() }, '▶ Ouvir o real')),
      h('h3', {}, 'Harmônicos'),
      h('div', { class: 'harmonics' }, ...Array.from({ length: HARMONIC_COUNT }, (_, index) => harmonicSlider(index))),
      h('div', { class: 'toolbar' }, h('button', { type: 'button', class: 'secondary', onclick: () => setParams({ ...params, harmonics: params.harmonics.map((value, index) => (index % 2 === 1 ? 0 : value)) }) }, 'Tirar os pares'), h('button', { type: 'button', class: 'secondary', onclick: () => setParams({ ...params, harmonics: params.harmonics.map((value, index) => (index === 0 ? 1 : value * 0.5)) }) }, 'Suavizar agudos')),
      shapeCanvas,
      h('div', { class: 'columns' },
        h('div', {}, h('h3', {}, 'Começo, meio e fim'), envelopeCanvas, ...ENVELOPE.map(specSlider)),
        h('div', {}, h('h3', {}, 'Abafamento'), ...FILTER.map(specSlider), h('h3', {}, 'Vibrato'), ...VIBRATO.map(specSlider)),
      ),
    ),
  );
  window.requestAnimationFrame(syncControls);
  window.addEventListener('resize', redraw);
  return element;
};
