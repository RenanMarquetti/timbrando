import { CUT_SECONDS, shapeAttack, type AttackMode } from '../audio/attack';
import { getEngine, getListenSource, startMic, stopMic } from '../audio/engine';
import { playBuffer, stopAll } from '../audio/player';
import { hasNote, INSTRUMENTS, loadPrepared, normalizeRms } from '../audio/samples';
import { cssVar, fitCanvas, h, selectInGroup } from '../ui/dom';

type Choice = {
  id: string;
  label: string;
};

type Score = {
  right: number;
  total: number;
};

const RECORD_SECONDS = 3;
const GAME_OPTIONS = 4;
const RECORDING_ID = 'recording';

const MODES: Array<{ mode: AttackMode; label: string }> = [
  { mode: 'whole', label: 'Inteiro' },
  { mode: 'cut', label: 'Sem o começo' },
  { mode: 'soft', label: 'Começo lento' },
  { mode: 'reverse', label: 'Ao contrário' },
];

const CHOICES: Choice[] = INSTRUMENTS.filter((instrument) => hasNote(instrument.id, 'A3')).map((instrument) => ({ id: instrument.id, label: instrument.label }));

const shuffle = <T>(items: T[]): T[] =>
  items
    .map((item) => ({ item, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.item);

const drawWave = (canvas: HTMLCanvasElement, buffer: AudioBuffer, mode: AttackMode): void => {
  const context = fitCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const data = buffer.getChannelData(0);
  const bucket = Math.max(1, Math.floor(data.length / width));
  const peak = data.reduce((max, value) => Math.max(max, Math.abs(value)), 1e-6);
  context.clearRect(0, 0, width, height);
  if (mode === 'cut') {
    context.fillStyle = cssVar('--cut');
    context.fillRect(0, 0, (CUT_SECONDS / buffer.duration) * width, height);
  }
  context.fillStyle = cssVar('--accent');
  Array.from({ length: width }).forEach((_, x) => {
    const slice = data.subarray(x * bucket, (x + 1) * bucket);
    const max = slice.reduce((acc, value) => Math.max(acc, Math.abs(value)), 0) / peak;
    const bar = max * (height / 2 - 2);
    context.fillRect(x, height / 2 - bar, 1, bar * 2);
  });
};

const recordMic = async (seconds: number): Promise<AudioBuffer> => {
  const stream = await startMic();
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
  const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve()));
  recorder.start();
  window.setTimeout(() => recorder.stop(), seconds * 1000);
  await stopped;
  if (getListenSource() === 'app') {
    stopMic();
  }
  const data = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer();
  return getEngine().ctx.decodeAudioData(data);
};

/** Part 1, block 3: how a sound begins. Not timbre itself, but part of what the ear feels as identity. */
export const createAttack = (): HTMLElement => {
  let sourceId = 'piano';
  let mode: AttackMode = 'whole';
  let recording: AudioBuffer | null = null;
  let answer: Choice | null = null;
  let score: Score = { right: 0, total: 0 };
  const canvas = h('canvas', { class: 'wave' });
  let lastDrawn: { buffer: AudioBuffer; mode: AttackMode } | null = null;
  new ResizeObserver(() => {
    if (lastDrawn) {
      drawWave(canvas, lastDrawn.buffer, lastDrawn.mode);
    }
  }).observe(canvas);
  const loadSource = async (id: string): Promise<AudioBuffer> => {
    if (id === RECORDING_ID && recording) {
      return recording;
    }
    return loadPrepared({ instrumentId: id, note: 'A3' });
  };
  const play = async (): Promise<void> => {
    getEngine();
    stopAll();
    const buffer = shapeAttack({ buffer: await loadSource(sourceId), mode });
    lastDrawn = { buffer, mode };
    drawWave(canvas, buffer, mode);
    playBuffer({ buffer });
  };
  const sourceSelect = h('select', { 'aria-label': 'Som' }, ...CHOICES.map((choice) => h('option', { value: choice.id, selected: choice.id === sourceId }, choice.label)));
  const recordingOption = h('option', { value: RECORDING_ID, disabled: true }, 'Sua gravação');
  sourceSelect.append(recordingOption);
  sourceSelect.addEventListener('change', () => {
    sourceId = sourceSelect.value;
    void play();
  });
  const modeGroup = h('div', { class: 'segmented wrap', role: 'group', 'aria-label': 'Começo do som' });
  MODES.forEach((item) => {
    const button = h('button', { type: 'button', 'aria-pressed': String(item.mode === mode) }, item.label);
    button.addEventListener('click', () => {
      mode = item.mode;
      selectInGroup(modeGroup, button);
      void play();
    });
    modeGroup.append(button);
  });
  const recordStatus = h('span', { class: 'muted', 'aria-live': 'polite' }, '');
  const recordButton = h('button', { type: 'button', class: 'secondary' }, '● Gravar 3 s');
  recordButton.addEventListener('click', async () => {
    stopAll();
    recordButton.disabled = true;
    recordStatus.textContent = 'Gravando… toque ou cante uma nota.';
    try {
      recording = normalizeRms(await recordMic(RECORD_SECONDS));
      recordingOption.disabled = false;
      sourceSelect.value = RECORDING_ID;
      sourceId = RECORDING_ID;
      recordStatus.textContent = 'Pronto. Experimente os começos com a sua gravação.';
      void play();
    } catch {
      recordStatus.textContent = 'Não consegui gravar. Verifique a permissão do microfone.';
    }
    recordButton.disabled = false;
  });
  const gameStatus = h('p', { class: 'guess-status', 'aria-live': 'polite' }, '');
  const gameOptions = h('div', { class: 'grid' });
  const scoreLabel = h('span', { class: 'muted' }, '');
  const showScore = (): void => {
    scoreLabel.textContent = score.total === 0 ? '' : `Acertos: ${score.right} de ${score.total}`;
  };
  const playMystery = async (cut: boolean): Promise<void> => {
    if (!answer) {
      return;
    }
    stopAll();
    const buffer = await loadPrepared({ instrumentId: answer.id, note: 'A3' });
    playBuffer({ buffer: cut ? shapeAttack({ buffer, mode: 'cut' }) : buffer });
  };
  const guess = (choice: Choice, button: HTMLButtonElement): void => {
    if (!answer || gameOptions.dataset.done === 'true') {
      return;
    }
    const correct = choice.id === answer.id;
    score = { right: score.right + (correct ? 1 : 0), total: score.total + 1 };
    gameOptions.dataset.done = 'true';
    button.classList.add(correct ? 'right' : 'wrong');
    gameStatus.textContent = correct ? `Isso! Era ${answer.label}. Ouça agora com o começo.` : `Era ${answer.label}. Ouça agora com o começo.`;
    showScore();
    void playMystery(false);
  };
  const newRound = (): void => {
    answer = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    const others = shuffle(CHOICES.filter((choice) => choice.id !== answer?.id)).slice(0, GAME_OPTIONS - 1);
    const options = shuffle([answer, ...others]);
    gameOptions.dataset.done = 'false';
    gameOptions.replaceChildren(
      ...options.map((choice) => {
        const button = h('button', { type: 'button', class: 'sound' }, choice.label);
        button.addEventListener('click', () => guess(choice, button));
        return button;
      }),
    );
    gameStatus.textContent = 'Que instrumento é esse, sem o começo?';
    void playMystery(true);
  };
  return h(
    'section',
    { class: 'card', id: 'ataque' },
    h('h2', {}, 'O começo do som'),
    h('p', { class: 'prompt' }, 'O mesmo som, com começos diferentes. Ele continua sendo o mesmo instrumento?'),
    h('div', { class: 'toolbar' }, sourceSelect, h('button', { type: 'button', class: 'primary', onclick: () => void play() }, '▶ Tocar')),
    modeGroup,
    canvas,
    h('div', { class: 'toolbar' }, recordButton, recordStatus),
    h('h3', {}, 'Quem é, sem o começo?'),
    h(
      'div',
      { class: 'toolbar' },
      h('button', { type: 'button', class: 'secondary', onclick: newRound }, '🎲 Nova rodada'),
      h('button', { type: 'button', class: 'secondary', onclick: () => void playMystery(true) }, '↻ Ouvir de novo'),
      scoreLabel,
    ),
    gameStatus,
    gameOptions,
  );
};
