import { getEngine } from '../audio/engine';
import type { SynthParams } from '../audio/synth';
import { cssVar, fitCanvas } from './dom';

type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Segment = {
  label: string;
  from: number;
  to: number;
  levelFrom: number;
  levelTo: number;
};

const MARGIN_LEFT = 46;
const MARGIN_BOTTOM = 30;
const MARGIN_TOP = 22;
const MARGIN_RIGHT = 10;
const HOLD_SECONDS = 0.8;
const FILTER_MIN_HZ = 50;
const FILTER_MAX_HZ = 16000;
const FILTER_POINTS = 240;
const FILTER_TOP_DB = 20;
const FILTER_BOTTOM_DB = -40;
const HARMONIC_DOTS = 16;

const plotBox = (canvas: HTMLCanvasElement): Box => ({
  left: MARGIN_LEFT,
  top: MARGIN_TOP,
  width: canvas.clientWidth - MARGIN_LEFT - MARGIN_RIGHT,
  height: canvas.clientHeight - MARGIN_TOP - MARGIN_BOTTOM,
});

const drawFrame = (context: CanvasRenderingContext2D, box: Box, xTitle: string, yTitle: string): void => {
  context.strokeStyle = cssVar('--muted');
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(box.left, box.top);
  context.lineTo(box.left, box.top + box.height);
  context.lineTo(box.left + box.width, box.top + box.height);
  context.stroke();
  context.fillStyle = cssVar('--muted');
  context.font = '12px system-ui, sans-serif';
  context.textAlign = 'right';
  context.fillText(xTitle, box.left + box.width, box.top + box.height + 26);
  context.textAlign = 'left';
  context.fillText(yTitle, box.left - 40, box.top - 8);
};

const formatTime = (seconds: number): string => (seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(1).replace('.', ',')} s`);

const niceStep = (total: number): number => [0.05, 0.1, 0.25, 0.5, 1, 2].find((step) => total / step <= 6) ?? 2;

const envelopeSegments = (params: SynthParams): Segment[] => {
  const attackEnd = params.attack;
  const decayEnd = attackEnd + params.decay;
  const holdEnd = decayEnd + HOLD_SECONDS;
  return [
    { label: 'Ataque', from: 0, to: attackEnd, levelFrom: 0, levelTo: 1 },
    { label: 'Queda', from: attackEnd, to: decayEnd, levelFrom: 1, levelTo: params.sustain },
    { label: 'Sustentação', from: decayEnd, to: holdEnd, levelFrom: params.sustain, levelTo: params.sustain },
    { label: 'Final', from: holdEnd, to: holdEnd + params.release, levelFrom: params.sustain, levelTo: 0 },
  ];
};

/** Volume of one note over time: x = time, y = volume, with the four phases named on the curve. */
export const drawEnvelope = (canvas: HTMLCanvasElement, params: SynthParams): void => {
  const context = fitCanvas(canvas);
  const box = plotBox(canvas);
  const segments = envelopeSegments(params);
  const total = segments[segments.length - 1].to;
  const x = (time: number): number => box.left + (time / total) * box.width;
  const y = (level: number): number => box.top + box.height * (1 - level);
  const colors = [cssVar('--level'), cssVar('--pitch'), cssVar('--accent'), cssVar('--muted')];
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawFrame(context, box, 'tempo →', 'volume');
  context.font = '11px system-ui, sans-serif';
  context.textAlign = 'right';
  [0, 0.5, 1].forEach((level) => context.fillText(`${Math.round(level * 100)}%`, box.left - 6, y(level) + 4));
  context.textAlign = 'center';
  const step = niceStep(total);
  Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step).forEach((time) => context.fillText(formatTime(time), x(time), box.top + box.height + 14));
  const sustainSegment = segments[2];
  context.fillStyle = cssVar('--chip');
  context.fillRect(x(0), box.top, x(sustainSegment.to) - x(0), box.height);
  context.fillStyle = cssVar('--muted');
  context.fillText('tecla apertada', (x(0) + x(sustainSegment.to)) / 2, box.top + box.height - 6);
  segments.forEach((segment, index) => {
    context.strokeStyle = colors[index];
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x(segment.from), y(segment.levelFrom));
    context.lineTo(x(segment.to), y(segment.levelTo));
    context.stroke();
  });
  context.font = 'bold 11px system-ui, sans-serif';
  context.textAlign = 'left';
  segments.reduce((legendX, segment, index) => {
    context.fillStyle = colors[index];
    context.fillRect(legendX, 4, 10, 10);
    context.fillText(segment.label, legendX + 14, 13);
    return legendX + 22 + context.measureText(segment.label).width;
  }, box.left + 30);
  context.textAlign = 'left';
};

let responseFilter: BiquadFilterNode | null = null;

const filterResponse = (params: SynthParams, frequencies: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> => {
  const { ctx } = getEngine();
  if (!responseFilter) {
    responseFilter = ctx.createBiquadFilter();
    responseFilter.type = 'lowpass';
  }
  responseFilter.frequency.value = params.cutoff;
  responseFilter.Q.value = params.resonance;
  const magnitude = new Float32Array(frequencies.length);
  const phase = new Float32Array(frequencies.length);
  responseFilter.getFrequencyResponse(frequencies, magnitude, phase);
  return magnitude;
};

/** How much of each frequency passes the "abafamento": x = frequency (Hz), y = volume that passes. Dots are the harmonics of the note. */
export const drawFilter = (canvas: HTMLCanvasElement, params: SynthParams, fundamental: number): void => {
  const context = fitCanvas(canvas);
  const box = plotBox(canvas);
  const ratio = FILTER_MAX_HZ / FILTER_MIN_HZ;
  const frequencies = Float32Array.from({ length: FILTER_POINTS }, (_, index) => FILTER_MIN_HZ * ratio ** (index / (FILTER_POINTS - 1)));
  const magnitude = filterResponse(params, frequencies);
  const x = (frequency: number): number => box.left + (Math.log(frequency / FILTER_MIN_HZ) / Math.log(ratio)) * box.width;
  const y = (decibels: number): number => box.top + box.height * ((FILTER_TOP_DB - Math.min(FILTER_TOP_DB, Math.max(FILTER_BOTTOM_DB, decibels))) / (FILTER_TOP_DB - FILTER_BOTTOM_DB));
  const toDb = (value: number): number => 20 * Math.log10(Math.max(value, 1e-6));
  const level = (frequency: number): number => {
    const index = Math.round((Math.log(frequency / FILTER_MIN_HZ) / Math.log(ratio)) * (FILTER_POINTS - 1));
    return toDb(magnitude[Math.min(FILTER_POINTS - 1, Math.max(0, index))]);
  };
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawFrame(context, box, 'frequência (Hz) →', 'volume que passa');
  context.font = '11px system-ui, sans-serif';
  context.textAlign = 'center';
  [100, 1000, 10000].forEach((tick) => context.fillText(tick >= 1000 ? `${tick / 1000}k` : String(tick), x(tick), box.top + box.height + 14));
  context.strokeStyle = cssVar('--line');
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(box.left, y(0));
  context.lineTo(box.left + box.width, y(0));
  context.stroke();
  context.setLineDash([]);
  context.textAlign = 'right';
  context.fillStyle = cssVar('--muted');
  context.fillText('igual', box.left - 6, y(0) + 4);
  context.fillText('some', box.left - 6, y(FILTER_BOTTOM_DB) + 4);
  context.strokeStyle = cssVar('--accent');
  context.lineWidth = 3;
  context.beginPath();
  frequencies.forEach((frequency, index) => {
    const px = x(frequency);
    const py = y(toDb(magnitude[index]));
    if (index === 0) {
      context.moveTo(px, py);
      return;
    }
    context.lineTo(px, py);
  });
  context.stroke();
  context.fillStyle = cssVar('--pitch');
  Array.from({ length: HARMONIC_DOTS }, (_, index) => fundamental * (index + 1))
    .filter((frequency) => frequency <= FILTER_MAX_HZ)
    .forEach((frequency) => {
      context.beginPath();
      context.arc(x(frequency), y(level(frequency)), 4, 0, Math.PI * 2);
      context.fill();
    });
  context.textAlign = 'left';
};
