import { describeFrequency } from '../audio/meter';
import { HIGHEST_MIDI, LOWEST_MIDI } from '../audio/samples';
import { midiToHz } from '../audio/vowels';
import { h } from './dom';

type RadioOption<T> = {
  value: T;
  label: string | Node;
  title?: string;
};

type RadioGroupArgs<T> = {
  label: string;
  options: Array<RadioOption<T>>;
  selected: T | null;
  onSelect: (value: T) => void;
  className?: string;
};

export type RadioGroup<T> = {
  element: HTMLElement;
  select: (value: T | null) => void;
};

type NoteSelectArgs = {
  value: number;
  onChange: (midi: number) => void;
};

export const noteName = (midi: number): string => describeFrequency(midiToHz(midi)).noteLabel;

/** Buttons that behave like radio buttons: exactly one is marked as active (or none, when "custom"). */
export const radioGroup = <T>(args: RadioGroupArgs<T>): RadioGroup<T> => {
  const element = h('div', { class: args.className ?? 'grid', role: 'radiogroup', 'aria-label': args.label });
  const buttons = args.options.map((option) => {
    const button = h('button', { type: 'button', class: 'sound radio', role: 'radio', 'aria-checked': String(option.value === args.selected), title: option.title }, option.label);
    button.addEventListener('click', () => {
      select(option.value);
      args.onSelect(option.value);
    });
    element.append(button);
    return { value: option.value, button };
  });
  const select = (value: T | null): void => {
    buttons.forEach((item) => item.button.setAttribute('aria-checked', String(item.value === value)));
  };
  return { element, select };
};

/** Note picker from Dó 3 to Dó 5, with the frequency next to each name. */
export const noteSelect = (args: NoteSelectArgs): HTMLSelectElement => {
  const options = Array.from({ length: HIGHEST_MIDI - LOWEST_MIDI + 1 }, (_, index) => {
    const midi = LOWEST_MIDI + index;
    return h('option', { value: midi, selected: midi === args.value }, `${noteName(midi)} · ${Math.round(midiToHz(midi))} Hz`);
  });
  const select = h('select', { 'aria-label': 'Nota' }, ...options);
  select.addEventListener('change', () => args.onChange(Number(select.value)));
  return select;
};

/** A two-state switch button (on/off). */
export const toggleButton = (label: string, onChange: (on: boolean) => void, initial = false): HTMLButtonElement => {
  const button = h('button', { type: 'button', class: 'toggle', 'aria-pressed': String(initial) }, label);
  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
  return button;
};

