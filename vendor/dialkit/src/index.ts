// Main hook
export { useDialKit, useDialKitController } from './hooks/useDialKit';
export type { DialKitController, UseDialOptions } from './hooks/useDialKit';
export { useDevDialKit, useDevDialKitController } from './hooks/useDevDialKit';

// Root component (user mounts once)
export { DialRoot } from './components/DialRoot';
export type { DialPosition, DialMode, DialTheme } from './components/DialRoot';
export { FeedbackPanel } from './components/FeedbackPanel';

// Dev session (notes + change queue for agents)
export { DevSessionStore } from './store/DevSessionStore';
export type { DevNote, DialChangeEntry } from './store/DevSessionStore';
export { inspectElement, cssPath } from './utils/dom-inspect';
export type { ElementInfo } from './utils/dom-inspect';

// Individual components (for advanced usage)
export { Slider } from './components/Slider';
export { Toggle } from './components/Toggle';
export { Folder } from './components/Folder';
export { ButtonGroup } from './components/ButtonGroup';
export { SpringControl } from './components/SpringControl';
export { SpringVisualization } from './components/SpringVisualization';
export { TransitionControl } from './components/TransitionControl';
export { EasingVisualization } from './components/EasingVisualization';
export { TextControl } from './components/TextControl';
export { SelectControl } from './components/SelectControl';
export { ColorControl } from './components/ColorControl';
export { PresetManager } from './components/PresetManager';
export { ShortcutsMenu } from './components/ShortcutsMenu';

// Store (for advanced usage)
export { DialStore } from './store/DialStore';
export type {
  SpringConfig,
  EasingConfig,
  TransitionConfig,
  ActionConfig,
  SelectConfig,
  ColorConfig,
  TextConfig,
  DialKitPersistOptions,
  ShortcutConfig,
  ShortcutMode,
  ShortcutInteraction,
  Preset,
  DialValue,
  DialConfig,
  DialKitValueUpdates,
  ResolvedValues,
  ControlMeta,
  DialChangeEvent,
  PanelConfig,
} from './store/DialStore';
