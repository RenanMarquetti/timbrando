import { createColorChain, NEUTRAL_COLOR, type ColorChain, type ColorSettings } from '../audio/colorChain';
import { getEngine } from '../audio/engine';
import { playPhrase, sustainNote, type Sustain } from '../audio/phrase';
import { stopAll } from '../audio/player';
import { hasNote, INSTRUMENTS, loadPrepared } from '../audio/samples';
import { radioGroup, toggleButton } from '../ui/controls';
import { h } from '../ui/dom';

type Axis = {
  key: keyof ColorSettings;
  left: string;
  right: string;
  how: string;
};

type Mood = {
  id: string;
  label: string;
  settings: ColorSettings;
};

const COLOR_MIDI = 69;
const SLIDER_STEPS = 100;

const AXES: Axis[] = [
  { key: 'brightness', left: 'escuro', right: 'brilhante', how: 'Corta (escuro) ou realça (brilhante) os harmônicos agudos. É o mesmo abafamento do sintetizador acima.' },
  { key: 'space', left: 'seco', right: 'envolvente', how: 'Soma o eco de uma sala grande (reverberação): o som parece vir de uma igreja em vez de um quarto.' },
  { key: 'roughness', left: 'suave', right: 'áspero', how: 'Áspero: satura o som e cria harmônicos que não existiam. Suave: cada nota começa mais devagar.' },
  { key: 'body', left: 'fino', right: 'cheio', how: 'Cheio: soma o mesmo som uma oitava abaixo e uma cópia um pouco desafinada. Fino: tira os graves.' },
];

const MOODS: Mood[] = [
  { id: 'neutral', label: 'Natural', settings: NEUTRAL_COLOR },
  { id: 'dark', label: 'Sombrio', settings: { brightness: -0.8, space: 0.55, roughness: -0.2, body: 0.7 } },
  { id: 'bright', label: 'Luminoso', settings: { brightness: 0.7, space: 0.35, roughness: 0, body: -0.2 } },
  { id: 'intimate', label: 'Íntimo', settings: { brightness: -0.35, space: -1, roughness: -0.7, body: 0.25 } },
  { id: 'ethereal', label: 'Etéreo', settings: { brightness: 0.35, space: 1, roughness: -1, body: -0.5 } },
  { id: 'aggressive', label: 'Agressivo', settings: { brightness: 0.55, space: -0.4, roughness: 0.9, body: 0.4 } },
  { id: 'warm', label: 'Caloroso', settings: { brightness: -0.3, space: 0.3, roughness: -0.3, body: 0.6 } },
  { id: 'distant', label: 'Distante', settings: { brightness: -0.6, space: 0.9, roughness: -0.5, body: -0.6 } },
];

const COLOR_INSTRUMENTS = INSTRUMENTS.filter((instrument) => instrument.sustained && hasNote(instrument.id, COLOR_MIDI));

/** Part 2: the sound-engineer controls that change how a real instrument feels, explained. */
export const createColors = (): HTMLElement => {
  let chain: ColorChain | null = null;
  let settings: ColorSettings = NEUTRAL_COLOR;
  let instrumentId = 'cello';
  let held: Sustain | null = null;
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
  const stopHeld = (): void => {
    held?.stop();
    held = null;
  };
  const startHeld = async (): Promise<void> => {
    stopHeld();
    const buffer = await loadPrepared({ instrumentId, midi: COLOR_MIDI });
    const active = getChain();
    active.apply(settings);
    held = sustainNote(buffer, active);
  };
  const playMelody = async (): Promise<void> => {
    stopAll();
    sustainToggle.setAttribute('aria-pressed', 'false');
    held = null;
    const buffer = await loadPrepared({ instrumentId, midi: COLOR_MIDI });
    const active = getChain();
    active.apply(settings);
    playPhrase(buffer, active);
  };
  const sustainToggle = toggleButton('♪ Sustentar nota', (on) => {
    if (on) {
      void startHeld();
      return;
    }
    stopHeld();
  });
  const moods = radioGroup<string>({
    label: 'Sensações prontas',
    selected: 'neutral',
    options: MOODS.map((mood) => ({ value: mood.id, label: mood.label })),
    onSelect: (id) => {
      const mood = MOODS.find((item) => item.id === id);
      if (mood) {
        applySettings(mood.settings);
      }
    },
  });
  const sliderRow = (axis: Axis): HTMLElement => {
    const slider = h('input', { type: 'range', min: -SLIDER_STEPS, max: SLIDER_STEPS, value: 0, 'aria-label': `${axis.left} ou ${axis.right}` });
    slider.addEventListener('input', () => {
      moods.select(null);
      applySettings({ ...settings, [axis.key]: Number(slider.value) / SLIDER_STEPS });
    });
    sliders.set(axis.key, slider);
    return h(
      'div',
      { class: 'axis-block' },
      h('label', { class: 'axis' }, h('span', { class: 'axis-left' }, axis.left), slider, h('span', { class: 'axis-right' }, axis.right)),
      h('p', { class: 'help' }, axis.how),
    );
  };
  const instrumentSelect = h('select', { 'aria-label': 'Instrumento' }, ...COLOR_INSTRUMENTS.map((instrument) => h('option', { value: instrument.id, selected: instrument.id === instrumentId }, instrument.label)));
  instrumentSelect.addEventListener('change', () => {
    instrumentId = instrumentSelect.value;
    if (held) {
      void startHeld();
    }
  });
  return h(
    'section',
    { class: 'card', id: 'cores' },
    h('h2', {}, 'Cores do som'),
    h(
      'p',
      { class: 'prompt' },
      'Um instrumento de verdade, e os mesmos controles que um técnico de som usa para mudar a sensação de uma música. A nota não muda: só a cor. Ligue "Sustentar nota" e mexa nos controles enquanto o som toca.',
    ),
    h('div', { class: 'toolbar' }, instrumentSelect, sustainToggle, h('button', { type: 'button', class: 'secondary', onclick: () => void playMelody() }, '▶ Tocar uma frase'), h('button', { type: 'button', class: 'secondary', onclick: () => { stopHeld(); sustainToggle.setAttribute('aria-pressed', 'false'); stopAll(); } }, '■ Parar')),
    h('div', { class: 'axes' }, ...AXES.map(sliderRow)),
    h('h3', {}, 'Sensações prontas'),
    moods.element,
  );
};
