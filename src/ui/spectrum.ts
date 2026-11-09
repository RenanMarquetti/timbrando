import type { Reading } from '../audio/meter';
import { cssVar, fitCanvas, h } from './dom';

export type SpectrumView = {
  element: HTMLElement;
  update: (reading: Reading, analyser: AnalyserNode) => void;
};

type Peak = {
  frequency: number;
  decibels: number;
  harmonic: number | null;
};

type Plot = {
  width: number;
  height: number;
};

const MIN_HZ = 50;
const MAX_HZ = 8000;
const FLOOR_DB = -100;
const CEIL_DB = -10;
const MAX_HARMONICS = 16;
const LABELED_PEAKS = 10;
const PEAK_MIN_DB = -80;
const PAD_TOP = 30;
const PAD_BOTTOM = 18;
const TICKS = [100, 200, 500, 1000, 2000, 5000];
const SEARCH_FRACTION = 0.04;

const xFor = (frequency: number, width: number): number => (Math.log(frequency / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * width;

const frequencyAt = (x: number, width: number): number => MIN_HZ * (MAX_HZ / MIN_HZ) ** (x / width);

const yFor = (decibels: number, plot: Plot): number => {
  const clamped = Math.min(CEIL_DB, Math.max(FLOOR_DB, decibels));
  return PAD_TOP + (1 - (clamped - FLOOR_DB) / (CEIL_DB - FLOOR_DB)) * (plot.height - PAD_TOP);
};

const formatHz = (frequency: number): string => (frequency >= 1000 ? `${(frequency / 1000).toFixed(2).replace('.', ',')} kHz` : `${Math.round(frequency)} Hz`);

/** dB at a fractional bin, interpolated between neighbours, so low frequencies are drawn as curves instead of steps. */
const valueAt = (data: Float32Array, binHz: number, frequency: number, nextFrequency: number): number => {
  const position = frequency / binHz;
  const nextPosition = nextFrequency / binHz;
  if (nextPosition - position > 1) {
    return data.subarray(Math.floor(position), Math.ceil(nextPosition)).reduce((max, value) => Math.max(max, value), -Infinity);
  }
  const index = Math.floor(position);
  const fraction = position - index;
  const a = data[index] ?? FLOOR_DB;
  const b = data[index + 1] ?? FLOOR_DB;
  const smooth = fraction * fraction * (3 - 2 * fraction);
  return a + (b - a) * smooth;
};

const tracePath = (context: CanvasRenderingContext2D, data: Float32Array, sampleRate: number, plot: Plot): void => {
  const binHz = sampleRate / 2 / data.length;
  const step = 2;
  const points = Array.from({ length: Math.ceil(plot.width / step) + 1 }, (_, index) => {
    const x = index * step;
    return { x, y: yFor(valueAt(data, binHz, frequencyAt(x, plot.width), frequencyAt(x + step, plot.width)), plot) };
  });
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    context.quadraticCurveTo(previous.x, previous.y, (previous.x + point.x) / 2, (previous.y + point.y) / 2);
  });
};

/** Refines a peak position with a parabola through the three bins around it. */
const refinePeak = (data: Float32Array, index: number, binHz: number): Peak => {
  const left = data[index - 1] ?? data[index];
  const right = data[index + 1] ?? data[index];
  const center = data[index];
  const denominator = left - 2 * center + right;
  const offset = denominator === 0 ? 0 : (0.5 * (left - right)) / denominator;
  return { frequency: (index + offset) * binHz, decibels: center - 0.25 * (left - right) * offset, harmonic: null };
};

const harmonicPeaks = (data: Float32Array, binHz: number, fundamental: number): Peak[] =>
  Array.from({ length: MAX_HARMONICS }, (_, index) => index + 1)
    .filter((harmonic) => harmonic * fundamental < MAX_HZ)
    .map((harmonic) => {
      const target = harmonic * fundamental;
      const from = Math.max(1, Math.floor((target * (1 - SEARCH_FRACTION)) / binHz));
      const to = Math.ceil((target * (1 + SEARCH_FRACTION)) / binHz);
      const best = Array.from({ length: to - from + 1 }, (_, offset) => from + offset).reduce((top, bin) => (data[bin] > data[top] ? bin : top), from);
      return { ...refinePeak(data, best, binHz), harmonic };
    })
    .filter((peak) => peak.decibels > PEAK_MIN_DB);

const loudestPeaks = (data: Float32Array, binHz: number): Peak[] =>
  Array.from({ length: Math.floor(MAX_HZ / binHz) }, (_, index) => index)
    .filter((index) => index > 1 && data[index] > PEAK_MIN_DB && data[index] >= data[index - 1] && data[index] > data[index + 1])
    .map((index) => refinePeak(data, index, binHz))
    .sort((a, b) => b.decibels - a.decibels)
    .slice(0, 6);

const drawAxes = (context: CanvasRenderingContext2D, plot: Plot): void => {
  context.strokeStyle = cssVar('--line');
  context.fillStyle = cssVar('--muted');
  context.font = '11px system-ui, sans-serif';
  context.lineWidth = 1;
  TICKS.forEach((tick) => {
    const x = xFor(tick, plot.width);
    context.beginPath();
    context.moveTo(x, PAD_TOP);
    context.lineTo(x, plot.height);
    context.stroke();
    context.fillText(tick >= 1000 ? `${tick / 1000}k Hz` : `${tick} Hz`, x + 3, plot.height + 13);
  });
};

const drawPeakLabels = (context: CanvasRenderingContext2D, peaks: Peak[], plot: Plot): void => {
  const placed: Array<{ from: number; to: number }> = [];
  context.font = 'bold 11px system-ui, sans-serif';
  context.textAlign = 'center';
  peaks.slice(0, LABELED_PEAKS).forEach((peak) => {
    const x = xFor(peak.frequency, plot.width);
    const y = yFor(peak.decibels, plot);
    context.fillStyle = cssVar('--pitch');
    context.beginPath();
    context.arc(x, y, 3.5, 0, Math.PI * 2);
    context.fill();
    const prefix = peak.harmonic === null ? '' : `${peak.harmonic}º · `;
    const text = `${prefix}${formatHz(peak.frequency)}`;
    const half = context.measureText(text).width / 2 + 4;
    const from = Math.max(half, Math.min(plot.width - half, x)) - half;
    const to = from + half * 2;
    if (placed.some((other) => from < other.to && to > other.from)) {
      return;
    }
    placed.push({ from, to });
    context.fillStyle = cssVar('--ink');
    context.fillText(text, from + half, Math.max(12, y - 8));
  });
  context.textAlign = 'left';
};

const drawCursor = (context: CanvasRenderingContext2D, x: number, plot: Plot): void => {
  const frequency = frequencyAt(x, plot.width);
  context.strokeStyle = cssVar('--level');
  context.setLineDash([3, 3]);
  context.beginPath();
  context.moveTo(x, PAD_TOP - 6);
  context.lineTo(x, plot.height);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = cssVar('--level');
  context.font = 'bold 12px system-ui, sans-serif';
  context.textAlign = x > plot.width - 80 ? 'right' : 'left';
  context.fillText(formatHz(frequency), x + (x > plot.width - 80 ? -6 : 6), PAD_TOP - 10);
  context.textAlign = 'left';
};

/** Live spectrum: smooth curve, every harmonic peak labeled with its frequency, tap to read any point. */
export const createSpectrum = (): SpectrumView => {
  const canvas = h('canvas', { class: 'spectrum', 'aria-label': 'Espectro: toque para ver a frequência de um ponto' });
  let live = new Float32Array(0);
  let reference: Float32Array | null = null;
  let frozen = false;
  let frozenFundamental: number | null = null;
  let cursorX: number | null = null;
  const freezeButton = h('button', { type: 'button', class: 'band-button' }, '❚❚ Congelar');
  freezeButton.addEventListener('click', () => {
    frozen = !frozen;
    freezeButton.textContent = frozen ? '▶ Continuar' : '❚❚ Congelar';
  });
  const captureButton = h('button', { type: 'button', class: 'band-button', onclick: () => { reference = live.slice(); } }, '📌 Guardar');
  const clearButton = h('button', { type: 'button', class: 'band-button', onclick: () => { reference = null; } }, 'Apagar');
  canvas.addEventListener('pointerdown', (event) => {
    cursorX = event.clientX - canvas.getBoundingClientRect().left;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || event.buttons > 0) {
      cursorX = event.clientX - canvas.getBoundingClientRect().left;
    }
  });
  canvas.addEventListener('pointerleave', () => {
    cursorX = null;
  });
  const element = h(
    'section',
    { class: 'card spectrum-card', id: 'espectro' },
    h('h2', {}, h('span', {}, 'Espectro'), h('span', { class: 'h2-actions' }, freezeButton, captureButton, clearButton)),
    h('p', { class: 'help' }, 'Cada pico é um harmônico, com a sua frequência. Toque no gráfico para ler qualquer ponto.'),
    canvas,
  );
  const update = (reading: Reading, analyser: AnalyserNode): void => {
    if (element.offsetParent === null) {
      return;
    }
    if (live.length !== analyser.frequencyBinCount) {
      live = new Float32Array(analyser.frequencyBinCount);
    }
    if (!frozen) {
      analyser.getFloatFrequencyData(live);
      frozenFundamental = reading.frequency;
    }
    const context = fitCanvas(canvas);
    const plot: Plot = { width: canvas.clientWidth, height: canvas.clientHeight - PAD_BOTTOM };
    const sampleRate = analyser.context.sampleRate;
    const binHz = sampleRate / 2 / live.length;
    context.clearRect(0, 0, plot.width, canvas.clientHeight);
    drawAxes(context, plot);
    if (reference) {
      context.setLineDash([6, 4]);
      context.strokeStyle = cssVar('--muted');
      context.lineWidth = 2;
      tracePath(context, reference, sampleRate, plot);
      context.stroke();
      context.setLineDash([]);
    }
    context.strokeStyle = cssVar('--accent');
    context.lineWidth = 2.2;
    tracePath(context, live, sampleRate, plot);
    context.stroke();
    const peaks = frozenFundamental === null ? loudestPeaks(live, binHz) : harmonicPeaks(live, binHz, frozenFundamental);
    drawPeakLabels(context, peaks, plot);
    if (cursorX !== null) {
      drawCursor(context, cursorX, plot);
    }
  };
  return { element, update };
};
