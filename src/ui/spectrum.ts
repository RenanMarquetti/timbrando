import { getActiveAnalyser } from '../audio/engine';
import type { Reading } from '../audio/meter';
import { cssVar, fitCanvas, h } from './dom';

export type SpectrumView = {
  element: HTMLElement;
  update: (reading: Reading) => void;
};

const MIN_HZ = 50;
const MAX_HZ = 8000;
const FLOOR_DB = -100;
const CEIL_DB = -10;
const MAX_MARKERS = 16;
const PAD_BOTTOM = 18;
const TICKS = [100, 200, 500, 1000, 2000, 5000];

const xFor = (frequency: number, width: number): number => (Math.log(frequency / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * width;

const yFor = (decibels: number, height: number): number => {
  const clamped = Math.min(CEIL_DB, Math.max(FLOOR_DB, decibels));
  return (1 - (clamped - FLOOR_DB) / (CEIL_DB - FLOOR_DB)) * height;
};

const tracePath = (context: CanvasRenderingContext2D, data: Float32Array, sampleRate: number, width: number, height: number): void => {
  const binHz = sampleRate / 2 / data.length;
  context.beginPath();
  Array.from({ length: Math.ceil(width) }).forEach((_, x) => {
    const frequency = MIN_HZ * (MAX_HZ / MIN_HZ) ** (x / width);
    const nextFrequency = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((x + 1) / width);
    const from = Math.floor(frequency / binHz);
    const to = Math.max(from + 1, Math.floor(nextFrequency / binHz));
    const peak = data.subarray(from, to).reduce((max, value) => Math.max(max, value), -Infinity);
    const y = yFor(peak, height);
    if (x === 0) {
      context.moveTo(x, y);
      return;
    }
    context.lineTo(x, y);
  });
};

const drawAxes = (context: CanvasRenderingContext2D, width: number, height: number): void => {
  context.strokeStyle = cssVar('--line');
  context.fillStyle = cssVar('--muted');
  context.font = '11px system-ui, sans-serif';
  context.lineWidth = 1;
  TICKS.forEach((tick) => {
    const x = xFor(tick, width);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.fillText(tick >= 1000 ? `${tick / 1000}k Hz` : `${tick} Hz`, x + 3, height + 13);
  });
};

const drawMarkers = (context: CanvasRenderingContext2D, fundamental: number, width: number, height: number): void => {
  context.fillStyle = cssVar('--pitch');
  context.strokeStyle = cssVar('--pitch');
  context.font = 'bold 12px system-ui, sans-serif';
  Array.from({ length: MAX_MARKERS }).forEach((_, index) => {
    const frequency = fundamental * (index + 1);
    if (frequency > MAX_HZ) {
      return;
    }
    const x = xFor(frequency, width);
    context.globalAlpha = 0.35;
    context.beginPath();
    context.moveTo(x, 14);
    context.lineTo(x, height);
    context.stroke();
    context.globalAlpha = 1;
    context.fillText(String(index + 1), x - 3, 11);
  });
};

/** Live spectrum with the harmonics numbered, plus a frozen reference curve to compare against. */
export const createSpectrum = (): SpectrumView => {
  const canvas = h('canvas', { class: 'spectrum' });
  let live = new Float32Array(0);
  let reference: Float32Array | null = null;
  let frozen = false;
  const freezeButton = h('button', { type: 'button', class: 'secondary' }, '❚❚ Congelar');
  freezeButton.addEventListener('click', () => {
    frozen = !frozen;
    freezeButton.textContent = frozen ? '▶ Continuar' : '❚❚ Congelar';
  });
  const captureButton = h('button', { type: 'button', class: 'secondary' }, '📌 Guardar como referência');
  captureButton.addEventListener('click', () => {
    reference = live.slice();
  });
  const clearButton = h('button', { type: 'button', class: 'secondary', onclick: () => { reference = null; } }, 'Apagar referência');
  const legend = h('p', { class: 'muted small' }, 'Linha cheia: o som de agora. Linha tracejada: a referência guardada. Números: harmônicos.');
  const element = h('div', { class: 'spectrum-box' }, canvas, h('div', { class: 'toolbar' }, freezeButton, captureButton, clearButton), legend);
  const update = (reading: Reading): void => {
    if (element.offsetParent === null) {
      return;
    }
    const analyser = getActiveAnalyser();
    if (live.length !== analyser.frequencyBinCount) {
      live = new Float32Array(analyser.frequencyBinCount);
    }
    if (!frozen) {
      analyser.getFloatFrequencyData(live);
    }
    const context = fitCanvas(canvas);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight - PAD_BOTTOM;
    context.clearRect(0, 0, width, canvas.clientHeight);
    drawAxes(context, width, height);
    if (reading.frequency !== null) {
      drawMarkers(context, reading.frequency, width, height);
    }
    if (reference) {
      context.setLineDash([6, 4]);
      context.strokeStyle = cssVar('--muted');
      context.lineWidth = 2;
      tracePath(context, reference, analyser.context.sampleRate, width, height);
      context.stroke();
      context.setLineDash([]);
    }
    context.strokeStyle = cssVar('--accent');
    context.lineWidth = 2;
    tracePath(context, live, analyser.context.sampleRate, width, height);
    context.stroke();
  };
  return { element, update };
};
