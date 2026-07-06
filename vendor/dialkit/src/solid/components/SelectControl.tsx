import { createSignal, createEffect, onMount, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { animate } from 'motion';
import { getDialKitPortalRoot, getDropdownPosition } from '../../dropdown-position';
import { ICON_CHEVRON } from '../../icons';

type SelectOption = string | { value: string; label: string };

interface SelectControlProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeOptions(options: SelectOption[]): { value: string; label: string }[] {
  return options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: toTitleCase(opt) } : opt
  );
}

export function SelectControl(props: SelectControlProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);
  const [pos, setPos] = createSignal<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const [portalTarget, setPortalTarget] = createSignal<HTMLElement | null>(null);
  let triggerRef!: HTMLButtonElement;
  let dropdownRef: HTMLDivElement | undefined;
  let chevronRef!: SVGSVGElement;
  let closeAnim: any = null;
  let chevronAnim: any = null;

  const normalized = () => normalizeOptions(props.options);
  const selectedOption = () => normalized().find((o) => o.value === props.value);

  onMount(() => {
    setPortalTarget(getDialKitPortalRoot(triggerRef) ?? document.body);

    if (chevronRef) {
      chevronRef.style.transform = `rotate(${isOpen() ? 180 : 0}deg)`;
    }

    onCleanup(() => {
      closeAnim?.stop();
      chevronAnim?.stop();
    });
  });

  createEffect(() => {
    if (!chevronRef) return;
    const open = isOpen();
    chevronAnim?.stop();
    chevronAnim = animate(
      chevronRef,
      { rotate: open ? 180 : 0 },
      { type: 'spring', visualDuration: 0.2, bounce: 0.15 }
    );
  });

  const updatePos = () => {
    const root = portalTarget();
    if (!triggerRef || !root) return;
    const dropdownHeight = 8 + normalized().length * 36;
    setPos(getDropdownPosition(triggerRef, root, { dropdownHeight }));
  };

  const openDropdown = () => {
    closeAnim?.stop();
    closeAnim = null;
    updatePos();
    setMounted(true);
    setIsOpen(true);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    if (!dropdownRef) { setMounted(false); return; }
    const above = pos()?.above ?? false;
    closeAnim?.stop();
    closeAnim = animate(
      dropdownRef,
      { opacity: 0, y: above ? 8 : -8, scale: 0.95 },
      { type: 'spring', visualDuration: 0.15, bounce: 0, onComplete: () => { setMounted(false); closeAnim = null; } }
    );
  };

  // Close on click outside
  createEffect(() => {
    if (!isOpen()) return;
    const handleViewportChange = () => updatePos();

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef && !triggerRef.contains(target) &&
        dropdownRef && !dropdownRef.contains(target)
      ) {
        closeDropdown();
      }
    };

    updatePos();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    onCleanup(() => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    });
  });

  const dropdownStyle = () => {
    const p = pos();
    if (!p) return {};
    return {
      position: 'absolute' as const,
      left: `${p.left}px`,
      top: `${p.top}px`,
      width: `${p.width}px`,
      'transform-origin': p.above ? 'bottom' : 'top',
    };
  };

  return (
    <div class="dialkit-select-row">
      <button
        ref={triggerRef}
        class="dialkit-select-trigger"
        onClick={() => isOpen() ? closeDropdown() : openDropdown()}
        data-open={String(isOpen())}
      >
        <span class="dialkit-select-label">{props.label}</span>
        <div class="dialkit-select-right">
          <span class="dialkit-select-value">{selectedOption()?.label ?? props.value}</span>
          <svg
            ref={chevronRef}
            class="dialkit-select-chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d={ICON_CHEVRON} />
          </svg>
        </div>
      </button>

      <Show when={!!portalTarget()}>
        <Portal mount={portalTarget()!}>
          <Show when={mounted() && pos()}>
            <div
              ref={(el) => {
                dropdownRef = el;
                const above = pos()?.above ?? false;
                animate(
                  el,
                  { opacity: [0, 1], y: [above ? 8 : -8, 0], scale: [0.95, 1] },
                  { type: 'spring', visualDuration: 0.15, bounce: 0 }
                );
              }}
              class="dialkit-select-dropdown"
              style={dropdownStyle()}
            >
              <For each={normalized()}>
                {(option) => (
                  <button
                    class="dialkit-select-option"
                    data-selected={String(option.value === props.value)}
                    onClick={() => {
                      props.onChange(option.value);
                      closeDropdown();
                    }}
                  >
                    {option.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Portal>
      </Show>
    </div>
  );
}
