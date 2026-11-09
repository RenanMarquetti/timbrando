import { reverseBuffer, startAt } from '../audio/attack';
import { getEngine } from '../audio/engine';
import { playBuffer, stopAll } from '../audio/player';
import { hasNote, INSTRUMENTS, loadPrepared, type Instrument } from '../audio/samples';
import { toggleButton } from '../ui/controls';
import { cssVar, fitCanvas, h } from '../ui/dom';

const ATTACK_MIDI = 57;
const HANDLE_RADIUS = 9;
const MAX_START_FRACTION = 0.9;

const CHOICES: Instrument[] = INSTRUMENTS.filter((instrument) => hasNote(instrument.id, ATTACK_MIDI));

const formatSeconds = (seconds: number): string => `${seconds.toFixed(2).replace('.', ',')} s`;

const drawWave = (canvas: HTMLCanvasElement, buffer: AudioBuffer, startSeconds: number): void => {
  const context = fitCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const data = buffer.getChannelData(0);
  const bucket = Math.max(1, Math.floor(data.length / width));
  const peak = data.reduce((max, value) => Math.max(max, Math.abs(value)), 1e-6);
  const markerX = (startSeconds / buffer.duration) * width;
  context.clearRect(0, 0, width, height);
  Array.from({ length: width }).forEach((_, x) => {
    const slice = data.subarray(x * bucket, (x + 1) * bucket);
    const max = slice.reduce((acc, value) => Math.max(acc, Math.abs(value)), 0) / peak;
    const bar = max * (height / 2 - 14);
    context.fillStyle = x < markerX ? cssVar('--line') : cssVar('--accent');
    context.fillRect(x, height / 2 - bar, 1, bar * 2);
  });
  context.strokeStyle = cssVar('--level');
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(markerX, 0);
  context.lineTo(markerX, height);
  context.stroke();
  context.fillStyle = cssVar('--level');
  context.beginPath();
  context.arc(Math.max(HANDLE_RADIUS, markerX), HANDLE_RADIUS + 1, HANDLE_RADIUS, 0, Math.PI * 2);
  context.fill();
};

/** Part 1, block 2: how a sound begins. The student drags where the sound starts. */
export const createAttack = (): HTMLElement => {
  let instrumentId = 'piano';
  let reversed = false;
  let startSeconds = 0;
  let shown: AudioBuffer | null = null;
  const canvas = h('canvas', { class: 'wave', 'aria-label': 'Desenho do som: arraste para escolher onde ele começa' });
  const startLabel = h('span', { class: 'muted' }, 'Começa em 0,00 s');
  const redraw = (): void => {
    if (shown) {
      drawWave(canvas, shown, startSeconds);
    }
    startLabel.textContent = `Começa em ${formatSeconds(startSeconds)}`;
  };
  const load = async (): Promise<void> => {
    const buffer = await loadPrepared({ instrumentId, midi: ATTACK_MIDI });
    shown = reversed ? reverseBuffer(buffer) : buffer;
    redraw();
  };
  const play = (): void => {
    getEngine();
    stopAll();
    if (shown) {
      playBuffer({ buffer: startAt({ buffer: shown, seconds: startSeconds }) });
    }
  };
  const moveMarker = (event: PointerEvent): void => {
    if (!shown) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const fraction = Math.min(MAX_START_FRACTION, Math.max(0, (event.clientX - rect.left) / rect.width));
    startSeconds = fraction * shown.duration;
    redraw();
  };
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    moveMarker(event);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (canvas.hasPointerCapture(event.pointerId)) {
      moveMarker(event);
    }
  });
  canvas.addEventListener('pointerup', play);
  new ResizeObserver(redraw).observe(canvas);
  const instrumentSelect = h('select', { 'aria-label': 'Instrumento' }, ...CHOICES.map((choice) => h('option', { value: choice.id, selected: choice.id === instrumentId }, choice.label)));
  instrumentSelect.addEventListener('change', () => {
    instrumentId = instrumentSelect.value;
    startSeconds = 0;
    void load().then(play);
  });
  const reverseToggle = toggleButton('⇄ Ao contrário', (on) => {
    reversed = on;
    startSeconds = 0;
    void load().then(play);
  });
  const fromStart = h(
    'button',
    {
      type: 'button',
      class: 'secondary',
      onclick: () => {
        startSeconds = 0;
        redraw();
        play();
      },
    },
    '⟲ Do começo',
  );
  void load();
  return h(
    'section',
    { class: 'card', id: 'ataque' },
    h('h2', {}, 'O começo do som'),
    h('p', { class: 'prompt' }, 'Arraste a linha laranja sobre o desenho para escolher onde o som começa. Ele continua sendo o mesmo instrumento?'),
    h('div', { class: 'toolbar' }, instrumentSelect, h('button', { type: 'button', class: 'primary', onclick: play }, '▶ Tocar'), reverseToggle, fromStart),
    canvas,
    h('div', { class: 'toolbar' }, startLabel),
  );
};
