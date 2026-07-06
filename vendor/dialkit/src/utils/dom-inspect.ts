export interface ElementInfo {
  url: string;
  pathname: string;
  selector: string;
  element: string;
  reactComponent: string | null;
  reactStack: string[];
  rect: { x: number; y: number; width: number; height: number };
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function getReactFiber(el: Element | null): any {
  if (!el || el.nodeType !== 1) return null;
  const keys = Object.keys(el);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) {
      return (el as any)[k];
    }
  }
  return null;
}

function fiberComponentName(fiber: any): string | null {
  let cur = fiber;
  let depth = 0;
  while (cur && depth < 40) {
    if (cur.type) {
      if (typeof cur.type === 'function') {
        return cur.type.displayName || cur.type.name || 'Anonymous';
      }
      if (typeof cur.type === 'object' && cur.type.displayName) {
        return cur.type.displayName;
      }
    }
    if (cur.elementType && typeof cur.elementType === 'function') {
      return cur.elementType.displayName || cur.elementType.name || 'Anonymous';
    }
    cur = cur.return;
    depth++;
  }
  return null;
}

function fiberStack(fiber: any): string[] {
  const names: string[] = [];
  let cur = fiber;
  let depth = 0;
  while (cur && depth < 12) {
    const name = fiberComponentName(cur);
    if (name && names[names.length - 1] !== name) names.push(name);
    cur = cur.return;
    depth++;
  }
  return names.reverse();
}

export function cssPath(el: Element | null): string {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return `#${cssEscape(el.id)}`;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${cssEscape(node.id)}`);
      break;
    }
    const className = (node.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (className.length) {
      part += className.map((c) => `.${cssEscape(c)}`).join('');
    }
    const parent: Element | null = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child): child is Element => child instanceof Element && child.tagName === node!.tagName,
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(' > ');
}

function elementLabel(el: Element): string {
  const tag = el.tagName ? el.tagName.toLowerCase() : 'node';
  const id = el.id ? `#${el.id}` : '';
  const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const classPart = cls.length ? `.${cls.join('.')}` : '';
  const text = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return tag + id + classPart + (text ? ` "${text}"` : '');
}

export function inspectElement(el: Element | null): ElementInfo | null {
  if (!el || el.nodeType !== 1) return null;
  const fiber = getReactFiber(el);
  const stack = fiber ? fiberStack(fiber) : [];
  const r = el.getBoundingClientRect();
  return {
    url: location.href,
    pathname: location.pathname,
    selector: cssPath(el),
    element: elementLabel(el),
    reactComponent: stack.length ? stack[stack.length - 1] : null,
    reactStack: stack,
    rect: {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    },
  };
}
