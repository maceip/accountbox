import { createUniqueId } from 'solid-js';

interface TextControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TextControl(props: TextControlProps) {
  const inputId = createUniqueId();

  return (
    <div class="dialkit-text-control">
      <label class="dialkit-text-label" for={inputId}>{props.label}</label>
      <input
        id={inputId}
        type="text"
        class="dialkit-text-input"
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
        placeholder={props.placeholder}
      />
    </div>
  );
}
