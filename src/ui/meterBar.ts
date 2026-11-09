import { getListenSource, onListenSourceChange, setListenSource, type ListenSource } from '../audio/engine';
import type { Reading } from '../audio/meter';
import { cssVar, fitCanvas, h, selectInGroup } from './dom';

type HistoryPoint = {
  midi: number | null;
  level: number;
};

export type MeterBar = {
  element: HTMLElement;
  update: (reading: Reading) => void;
};

const HISTORY_LENGTH = 360;
const LEVEL_FLOOR = -60;
const LEVEL_CEIL = 0;
const PITCH_SPAN = 7;

const levelFraction = (level: number): number => Math.min(1, Math.max(0, (level - LEVEL_FLOOR) / (LEVEL_CEIL - LEVEL_FLOOR)));

const toMidi = (frequency: number | null): number | null => {
  if (frequency === null) {
    return null;
  }
  return 69 + 12 * Math.log2(frequency / 440);
};

const centerOf = (history: HistoryPoint[]): number => {
  const valid = history.map((point) => point.midi).filter((midi): midi is number => midi !== null);
  if (valid.length === 0) {
    return 57;
  }
  return Math.round(valid[valid.length - 1]);
};

const drawLane = (context: CanvasRenderingContext2D, values: Array<number | null>, top: number, height: number, width: number, color: string): void => {
  const step = width / HISTORY_LENGTH;
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  context.beginPath();
  values.reduce<boolean>((drawing, value, index) => {
    if (value === null) {
      return false;
    }
    const x = index * step;
    const y = top + height * (1 - Math.min(1, Math.max(0, value)));
    if (drawing) {
      context.lineTo(x, y);
      return true;
    }
    context.moveTo(x, y);
    return true;
  }, false);
  context.stroke();
};

const drawHistory = (canvas: HTMLCanvasElement, history: HistoryPoint[]): void => {
  const context = fitCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const laneHeight = (height - 24) / 2;
  const center = centerOf(history);
  context.clearRect(0, 0, width, height);
  context.fillStyle = cssVar('--muted');
  context.font = '12px system-ui, sans-serif';
  context.fillText('altura', 6, 14);
  context.fillText('intensidade', 6, laneHeight + 30);
  context.strokeStyle = cssVar('--line');
  context.lineWidth = 1;
  context.strokeRect(0.5, 18.5, width - 1, laneHeight);
  context.strokeRect(0.5, laneHeight + 34.5, width - 1, laneHeight - 12);
  const pitchValues = history.map((point) => (point.midi === null ? null : (point.midi - (center - PITCH_SPAN)) / (PITCH_SPAN * 2)));
  const levelValues = history.map((point) => (point.level <= LEVEL_FLOOR ? null : levelFraction(point.level)));
  drawLane(context, pitchValues, 18, laneHeight, width, cssVar('--pitch'));
  drawLane(context, levelValues, laneHeight + 34, laneHeight - 12, width, cssVar('--level'));
};

const sourceButtons = (): HTMLElement => {
  const group = h('div', { class: 'segmented', role: 'group', 'aria-label': 'O que medir' });
  const make = (source: ListenSource, label: string): HTMLButtonElement => {
    const button = h('button', { type: 'button', 'aria-pressed': String(getListenSource() === source) }, label);
    button.addEventListener('click', async () => {
      try {
        await setListenSource(source);
      } catch {
        window.alert('Não consegui abrir o microfone. Verifique a permissão do navegador ou do app.');
      }
    });
    return button;
  };
  const app = make('app', 'Sons do app');
  const mic = make('mic', '🎤 Microfone');
  group.append(app, mic);
  onListenSourceChange((source) => selectInGroup(group, source === 'mic' ? mic : app));
  return group;
};

/** Always-visible strip with pitch and loudness: proof that, in the comparisons, only the timbre changes. */
export const createMeterBar = (): MeterBar => {
  const note = h('strong', { class: 'meter-note' }, '—');
  const hertz = h('span', { class: 'meter-hz' }, '');
  const fill = h('div', { class: 'meter-fill' });
  const decibels = h('span', { class: 'meter-db' }, '');
  const canvas = h('canvas', { class: 'meter-history' });
  const details = h('div', { class: 'meter-details', hidden: true }, canvas);
  const toggle = h('button', { type: 'button', class: 'link', 'aria-expanded': 'false' }, 'Ver gráfico');
  toggle.addEventListener('click', () => {
    details.hidden = !details.hidden;
    toggle.setAttribute('aria-expanded', String(!details.hidden));
    toggle.textContent = details.hidden ? 'Ver gráfico' : 'Esconder gráfico';
  });
  const element = h(
    'section',
    { class: 'meter', 'aria-label': 'Medidor de altura e intensidade' },
    h(
      'div',
      { class: 'meter-row' },
      h('div', { class: 'meter-cell' }, h('span', { class: 'meter-label' }, 'Altura'), note, hertz),
      h('div', { class: 'meter-cell meter-grow' }, h('span', { class: 'meter-label' }, 'Intensidade'), h('div', { class: 'meter-track' }, fill), decibels),
      sourceButtons(),
      toggle,
    ),
    details,
  );
  const history: HistoryPoint[] = Array.from({ length: HISTORY_LENGTH }, () => ({ midi: null, level: -Infinity }));
  const update = (reading: Reading): void => {
    note.textContent = reading.noteLabel;
    hertz.textContent = reading.frequency === null ? '' : `${reading.frequency.toFixed(1)} Hz`;
    fill.style.width = `${levelFraction(reading.level) * 100}%`;
    decibels.textContent = reading.level <= LEVEL_FLOOR ? 'silêncio' : `${reading.level.toFixed(0)} dB`;
    history.shift();
    history.push({ midi: toMidi(reading.frequency), level: reading.level });
    if (!details.hidden) {
      drawHistory(canvas, history);
    }
  };
  return { element, update };
};
