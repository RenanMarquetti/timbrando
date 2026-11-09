type Props = Record<string, string | number | boolean | EventListener | undefined>;

type Child = Node | string | null | undefined | false;

/** Tiny element builder: h('button', { class: 'x', onclick: fn }, 'Texto'). */
export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === false) {
      return;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2), value);
      return;
    }
    if (key in element && key !== 'class' && key !== 'style') {
      (element as unknown as Record<string, unknown>)[key] = value;
      return;
    }
    element.setAttribute(key === 'class' ? 'class' : key, String(value));
  });
  children.forEach((child) => {
    if (child === null || child === undefined || child === false) {
      return;
    }
    element.append(child);
  });
  return element;
};

/** Marks one button of a group as selected. */
export const selectInGroup = (group: HTMLElement, selected: HTMLElement): void => {
  group.querySelectorAll('[aria-pressed]').forEach((item) => item.setAttribute('aria-pressed', 'false'));
  selected.setAttribute('aria-pressed', 'true');
};

/** Sizes a canvas to its CSS box at device resolution and returns its 2D context. */
export const fitCanvas = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
};

export const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
