import { createColorChain, NEUTRAL_COLOR, type ColorChain, type ColorSettings } from '../audio/colorChain';
import { getEngine } from '../audio/engine';
import { playPhrase, type PhraseKind } from '../audio/phrase';
import { stopAll } from '../audio/player';
import { hasNote, INSTRUMENTS, loadPrepared } from '../audio/samples';
import { h, selectInGroup } from '../ui/dom';

type Axis = {
  key: keyof ColorSettings;
  left: string;
  right: string;
};

type Mood = {
  label: string;
  settings: ColorSettings;
};

const AXES: Axis[] = [
  { key: 'brightness', left: 'escuro', right: 'brilhante' },
  { key: 'space', left: 'seco', right: 'envolvente' },
  { key: 'roughness', left: 'suave', right: 'áspero' },
  { key: 'body', left: 'fino', right: 'cheio' },
];

const MOODS: Mood[] = [
  { label: 'Sombrio', settings: { brightness: -0.8, space: 0.55, roughness: -0.2, body: 0.7 } },
  { label: 'Luminoso', settings: { brightness: 0.7, space: 0.35, roughness: 0, body: -0.2 } },
  { label: 'Íntimo', settings: { brightness: -0.35, space: -1, roughness: -0.7, body: 0.25 } },
  { label: 'Etéreo', settings: { brightness: 0.35, space: 1, roughness: -1, body: -0.5 } },
  { label: 'Agressivo', settings: { brightness: 0.55, space: -0.4, roughness: 0.9, body: 0.4 } },
  { label: 'Caloroso', settings: { brightness: -0.3, space: 0.3, roughness: -0.3, body: 0.6 } },
  { label: 'Distante', settings: { brightness: -0.6, space: 0.9, roughness: -0.5, body: -0.6 } },
  { label: 'Neutro', settings: NEUTRAL_COLOR },
];

const PHRASE_INSTRUMENTS = INSTRUMENTS.filter((instrument) => hasNote(instrument.id, 'A4'));
const SLIDER_STEPS = 100;

/** Part 1, block 2: the same phrase, painted with different colors, to look for feelings. */
export const createColors = (): HTMLElement => {
  let chain: ColorChain | null = null;
  let settings: ColorSettings = NEUTRAL_COLOR;
  let instrumentId = 'cello';
  let phrase: PhraseKind = 'melody';
  let secretMood: Mood | null = null;
  const sliders = new Map<keyof ColorSettings, HTMLInputElement>();
  const getChain = (): ColorChain => {
    getEngine();
    if (!chain) {
      chain = createColorChain();
    }
    return chain;
  };
  const applySettings = (next: ColorSettings): void => {
    settings = next;
    sliders.forEach((slider, key) => {
      slider.value = String(Math.round(next[key] * SLIDER_STEPS));
    });
    getChain().apply(next);
  };
  const play = async (): Promise<void> => {
    stopAll();
    const buffer = await loadPrepared({ instrumentId, note: 'A4' });
    const active = getChain();
    active.apply(settings);
    playPhrase({ buffer, chain: active, kind: phrase });
  };
  const sliderRow = (axis: Axis): HTMLElement => {
    const slider = h('input', { type: 'range', min: -SLIDER_STEPS, max: SLIDER_STEPS, value: 0, 'aria-label': `${axis.left} ou ${axis.right}` });
    slider.addEventListener('input', () => {
      applySettings({ ...settings, [axis.key]: Number(slider.value) / SLIDER_STEPS });
    });
    sliders.set(axis.key, slider);
    return h('label', { class: 'axis' }, h('span', { class: 'axis-left' }, axis.left), slider, h('span', { class: 'axis-right' }, axis.right));
  };
  const instrumentSelect = h('select', { 'aria-label': 'Instrumento' }, ...PHRASE_INSTRUMENTS.map((instrument) => h('option', { value: instrument.id, selected: instrument.id === instrumentId }, instrument.label)));
  instrumentSelect.addEventListener('change', () => {
    instrumentId = instrumentSelect.value;
  });
  const phraseGroup = h('div', { class: 'segmented', role: 'group', 'aria-label': 'O que tocar' });
  const phraseButton = (value: PhraseKind, label: string): HTMLButtonElement => {
    const button = h('button', { type: 'button', 'aria-pressed': String(phrase === value) }, label);
    button.addEventListener('click', () => {
      phrase = value;
      selectInGroup(phraseGroup, button);
    });
    return button;
  };
  phraseGroup.append(phraseButton('melody', 'Frase'), phraseButton('long', 'Nota longa'));
  const slidersBox = h('div', { class: 'axes' }, ...AXES.map(sliderRow));
  const moodRow = h(
    'div',
    { class: 'grid moods' },
    ...MOODS.map((mood) =>
      h('button', { type: 'button', class: 'sound mood', onclick: () => { applySettings(mood.settings); void play(); } }, mood.label),
    ),
  );
  const guessStatus = h('p', { class: 'guess-status', 'aria-live': 'polite' }, '');
  const guessPlay = (): void => {
    const candidates = MOODS.filter((mood) => mood.label !== 'Neutro');
    secretMood = candidates[Math.floor(Math.random() * candidates.length)];
    slidersBox.classList.add('hidden-values');
    applySettings(secretMood.settings);
    guessStatus.textContent = 'Que sensação esse som traz? Conversem antes de revelar.';
    void play();
  };
  const guessReveal = (): void => {
    slidersBox.classList.remove('hidden-values');
    guessStatus.textContent = secretMood ? `Era: ${secretMood.label}.` : '';
  };
  return h(
    'section',
    { class: 'card', id: 'cores' },
    h('h2', {}, 'Cores e sensações'),
    h('p', { class: 'prompt' }, 'A mesma frase, na mesma altura. Mexa nas cores e repare no que você sente.'),
    h(
      'div',
      { class: 'toolbar' },
      instrumentSelect,
      phraseGroup,
      h('button', { type: 'button', class: 'primary', onclick: () => void play() }, '▶ Tocar'),
      h('button', { type: 'button', class: 'secondary', onclick: () => stopAll() }, '■ Parar'),
    ),
    slidersBox,
    h('h3', {}, 'Sensações prontas'),
    moodRow,
    h('h3', {}, 'Adivinhe a sensação'),
    h(
      'div',
      { class: 'toolbar' },
      h('button', { type: 'button', class: 'secondary', onclick: guessPlay }, '🎲 Sortear'),
      h('button', { type: 'button', class: 'secondary', onclick: () => void play() }, '↻ Ouvir de novo'),
      h('button', { type: 'button', class: 'secondary', onclick: guessReveal }, 'Revelar'),
    ),
    guessStatus,
  );
};
