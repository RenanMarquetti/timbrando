import { getEngine } from '../audio/engine';
import { playBuffer, stopAll } from '../audio/player';
import { CLIP_SECONDS, FAMILIES, hasNote, loadPrepared, type Instrument } from '../audio/samples';
import { loadVowel, VOWELS, type Vowel } from '../audio/vowels';
import { noteSelect } from '../ui/controls';
import { h } from '../ui/dom';

type Sound = {
  key: string;
  label: string;
  load: (midi: number) => Promise<AudioBuffer>;
  available: (midi: number) => boolean;
};

const OVERLAP_SECONDS = 0.3;
const DEFAULT_MIDI = 57;

const vowelSounds: Sound[] = VOWELS.map((vowel: Vowel) => ({
  key: `vowel-${vowel}`,
  label: vowel.toUpperCase(),
  load: (midi) => loadVowel(vowel, midi),
  available: () => true,
}));

const instrumentSound = (instrument: Instrument): Sound => ({
  key: instrument.id,
  label: instrument.label,
  load: (midi) => loadPrepared({ instrumentId: instrument.id, midi }),
  available: (midi) => hasNote(instrument.id, midi),
});

const instrumentSounds: Sound[] = FAMILIES.flatMap((family) => family.instruments.map(instrumentSound));

let timers: number[] = [];

const clearTimers = (): void => {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers = [];
};

/** Part 1, block 1: same note, same strength, same length. Only the color changes. */
export const createSameNote = (): HTMLElement => {
  let midi = DEFAULT_MIDI;
  const buttons = new Map<string, HTMLButtonElement>();
  const highlight = (key: string, delaySeconds: number): void => {
    const button = buttons.get(key);
    if (!button) {
      return;
    }
    timers.push(window.setTimeout(() => button.classList.add('playing'), delaySeconds * 1000));
    timers.push(window.setTimeout(() => button.classList.remove('playing'), (delaySeconds + CLIP_SECONDS - OVERLAP_SECONDS) * 1000));
  };
  const stop = (): void => {
    clearTimers();
    stopAll();
    buttons.forEach((button) => button.classList.remove('playing'));
  };
  const playSounds = async (sounds: Sound[]): Promise<void> => {
    const { ctx } = getEngine();
    stop();
    const playable = sounds.filter((sound) => sound.available(midi));
    const buffers = await Promise.all(playable.map((sound) => sound.load(midi)));
    const start = ctx.currentTime + 0.05;
    const step = CLIP_SECONDS - OVERLAP_SECONDS;
    buffers.forEach((buffer, index) => {
      playBuffer({ buffer, when: start + index * step });
      highlight(playable[index].key, index * step);
    });
  };
  const soundButton = (sound: Sound, extraClass: string): HTMLButtonElement => {
    const button = h('button', { type: 'button', class: `sound ${extraClass}` }, sound.label);
    button.addEventListener('click', () => void playSounds([sound]));
    buttons.set(sound.key, button);
    return button;
  };
  const refreshAvailability = (): void => {
    [...vowelSounds, ...instrumentSounds].forEach((sound) => {
      const button = buttons.get(sound.key);
      if (button) {
        button.disabled = !sound.available(midi);
        button.title = button.disabled ? 'Esta nota está fora da extensão gravada deste instrumento' : '';
      }
    });
  };
  const families = FAMILIES.map((family) =>
    h(
      'div',
      { class: 'family' },
      h('span', { class: 'family-label' }, family.label),
      h('div', { class: 'grid' }, ...family.instruments.map((instrument) => soundButton(instrumentSound(instrument), ''))),
    ),
  );
  const picker = noteSelect({
    value: midi,
    onChange: (value) => {
      midi = value;
      stop();
      refreshAvailability();
    },
  });
  refreshAvailability();
  return h(
    'section',
    { class: 'card', id: 'mesma-nota' },
    h('h2', {}, 'Mesma nota, mesma força'),
    h('p', { class: 'prompt' }, 'Escute e olhe o medidor lá em cima. O que muda de um som para o outro?'),
    h('div', { class: 'toolbar' }, h('label', { class: 'inline-label' }, 'Nota', picker), h('button', { type: 'button', class: 'secondary', onclick: stop }, '■ Parar')),
    h('h3', {}, 'Vogais'),
    h('div', { class: 'grid vowels' }, ...vowelSounds.map((sound) => soundButton(sound, 'vowel'))),
    h('div', { class: 'toolbar' }, h('button', { type: 'button', class: 'secondary', onclick: () => void playSounds(vowelSounds) }, '▶ Todas as vogais, emendadas')),
    h('h3', {}, 'Instrumentos do MSA'),
    ...families,
    h('div', { class: 'toolbar' }, h('button', { type: 'button', class: 'secondary', onclick: () => void playSounds(instrumentSounds) }, '▶ Todos os instrumentos, emendados')),
  );
};
