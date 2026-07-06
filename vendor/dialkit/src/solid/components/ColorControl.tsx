import { createSignal, createEffect, createUniqueId, Show } from 'solid-js';

interface ColorControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function expandShorthandHex(hex: string): string {
  if (hex.length !== 4) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

export function ColorControl(props: ColorControlProps) {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal(props.value);
  const textInputId = createUniqueId();
  let colorInputRef!: HTMLInputElement;

  // Sync editValue when value changes externally
  createEffect(() => {
    if (!isEditing()) {
      setEditValue(props.value);
    }
  });

  const handleTextSubmit = () => {
    setIsEditing(false);
    if (HEX_COLOR_REGEX.test(editValue())) {
      props.onChange(editValue());
    } else {
      setEditValue(props.value);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleTextSubmit();
    else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(props.value);
    }
  };

  return (
    <div class="dialkit-color-control">
      <label class="dialkit-color-label" for={textInputId}>{props.label}</label>
      <div class="dialkit-color-inputs">
        <Show
          when={isEditing()}
          fallback={
            <span class="dialkit-color-hex" onClick={() => setIsEditing(true)}>
              {(props.value ?? '').toUpperCase()}
            </span>
          }
        >
          <input
            id={textInputId}
            type="text"
            class="dialkit-color-hex-input"
            value={editValue()}
            onInput={(e) => setEditValue(e.currentTarget.value)}
            onBlur={handleTextSubmit}
            onKeyDown={handleKeyDown}
            autofocus
          />
        </Show>
        <button
          class="dialkit-color-swatch"
          style={{ 'background-color': props.value }}
          onClick={() => colorInputRef?.click()}
          title="Pick color"
          aria-label={`Pick color for ${props.label}`}
        />
        <input
          ref={colorInputRef}
          type="color"
          class="dialkit-color-picker-native"
          aria-label={`${props.label} color picker`}
          value={props.value.length === 4 ? expandShorthandHex(props.value) : props.value.slice(0, 7)}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      </div>
    </div>
  );
}
