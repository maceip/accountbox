// src/vue/useDialKit.ts
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";

// src/store/DialStore.ts
var EMPTY_VALUES = Object.freeze({});
function resolveDialValues(config, flatValues) {
  return resolveConfigValues(config, flatValues, "");
}
function flattenDialValueUpdates(config, updates) {
  const values = {};
  if (typeof updates === "object" && updates !== null) {
    flattenConfigUpdates(config, updates, "", values);
  }
  return values;
}
function resolveConfigValues(config, flatValues, prefix) {
  const result = {};
  for (const [key, configValue] of Object.entries(config)) {
    if (key === "_collapsed") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(configValue) && configValue.length <= 4 && typeof configValue[0] === "number") {
      result[key] = flatValues[path] ?? configValue[0];
    } else if (typeof configValue === "number" || typeof configValue === "boolean" || typeof configValue === "string") {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSpringConfigValue(configValue) || isEasingConfigValue(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (isActionConfigValue(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSelectConfigValue(configValue)) {
      const defaultValue = configValue.default ?? getFirstOptionValue(configValue.options);
      result[key] = flatValues[path] ?? defaultValue;
    } else if (isColorConfigValue(configValue)) {
      result[key] = flatValues[path] ?? configValue.default ?? "#000000";
    } else if (isTextConfigValue(configValue)) {
      result[key] = flatValues[path] ?? configValue.default ?? "";
    } else if (typeof configValue === "object" && configValue !== null) {
      result[key] = resolveConfigValues(configValue, flatValues, path);
    }
  }
  return result;
}
function flattenConfigUpdates(config, updates, prefix, values) {
  for (const [key, configValue] of Object.entries(config)) {
    if (key === "_collapsed" || !(key in updates)) continue;
    const nextValue = updates[key];
    if (nextValue === void 0) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isActionConfigValue(configValue)) {
      continue;
    }
    if (isLeafConfigValue(configValue)) {
      values[path] = nextValue;
      continue;
    }
    if (typeof configValue === "object" && configValue !== null && typeof nextValue === "object" && nextValue !== null && !Array.isArray(nextValue)) {
      flattenConfigUpdates(configValue, nextValue, path, values);
    }
  }
}
function isLeafConfigValue(value) {
  return Array.isArray(value) && value.length <= 4 && typeof value[0] === "number" || typeof value === "number" || typeof value === "boolean" || typeof value === "string" || isSpringConfigValue(value) || isEasingConfigValue(value) || isActionConfigValue(value) || isSelectConfigValue(value) || isColorConfigValue(value) || isTextConfigValue(value);
}
function hasType(value, type) {
  return typeof value === "object" && value !== null && "type" in value && value.type === type;
}
function isSpringConfigValue(value) {
  return hasType(value, "spring");
}
function isEasingConfigValue(value) {
  return hasType(value, "easing");
}
function isActionConfigValue(value) {
  return hasType(value, "action");
}
function isSelectConfigValue(value) {
  return hasType(value, "select") && "options" in value && Array.isArray(value.options);
}
function isColorConfigValue(value) {
  return hasType(value, "color");
}
function isTextConfigValue(value) {
  return hasType(value, "text");
}
function getFirstOptionValue(options) {
  const first = options[0];
  if (first === void 0) return "";
  return typeof first === "string" ? first : first.value;
}
var DialStoreClass = class {
  constructor() {
    this.panels = /* @__PURE__ */ new Map();
    this.panelsSnapshot = [];
    this.listeners = /* @__PURE__ */ new Map();
    this.globalListeners = /* @__PURE__ */ new Set();
    this.snapshots = /* @__PURE__ */ new Map();
    this.actionListeners = /* @__PURE__ */ new Map();
    this.presets = /* @__PURE__ */ new Map();
    this.activePreset = /* @__PURE__ */ new Map();
    this.baseValues = /* @__PURE__ */ new Map();
    this.defaultValues = /* @__PURE__ */ new Map();
    this.registrationCounts = /* @__PURE__ */ new Map();
    this.retainedPanels = /* @__PURE__ */ new Set();
    this.persistConfigs = /* @__PURE__ */ new Map();
    this.changeListeners = /* @__PURE__ */ new Set();
  }
  registerPanel(id, name, config, shortcuts, options = {}) {
    this.configurePanelRetention(id, options);
    this.registrationCounts.set(id, (this.registrationCounts.get(id) ?? 0) + 1);
    const controls = this.parseConfig(config, "", shortcuts);
    const controlsByPath = this.mapControlsByPath(controls);
    const defaultValues = this.flattenValues(config, "");
    this.initTransitionModes(config, "", defaultValues);
    const persisted = this.loadPersistedPanel(id);
    const previousValues = this.panels.get(id)?.values ?? this.snapshots.get(id) ?? persisted?.values ?? {};
    const values = this.reconcileValues(defaultValues, previousValues, controlsByPath);
    const previousBaseValues = this.baseValues.get(id) ?? persisted?.baseValues ?? persisted?.values ?? {};
    const baseValues = this.reconcileValues(defaultValues, previousBaseValues, controlsByPath);
    this.panels.set(id, { id, name, controls, values, shortcuts: shortcuts ?? {} });
    this.snapshots.set(id, { ...values });
    this.baseValues.set(id, baseValues);
    this.defaultValues.set(id, { ...defaultValues });
    const existingPresets = this.presets.get(id) ?? persisted?.presets;
    if (existingPresets) {
      this.presets.set(id, this.reconcilePresets(existingPresets, defaultValues, controlsByPath));
    }
    if (!this.activePreset.has(id) && persisted?.activePresetId !== void 0) {
      this.activePreset.set(id, persisted.activePresetId);
    }
    this.persistPanel(id);
    this.notify(id);
    this.notifyGlobal();
  }
  updatePanel(id, name, config, shortcuts, options = {}) {
    this.configurePanelRetention(id, options);
    const existing = this.panels.get(id);
    if (!existing) {
      this.registerPanel(id, name, config, shortcuts, options);
      return;
    }
    const controls = this.parseConfig(config, "", shortcuts);
    const controlsByPath = this.mapControlsByPath(controls);
    const defaultValues = this.flattenValues(config, "");
    this.initTransitionModes(config, "", defaultValues);
    const nextValues = this.reconcileValues(defaultValues, existing.values, controlsByPath);
    const nextPanel = { id, name, controls, values: nextValues, shortcuts: shortcuts ?? existing.shortcuts };
    this.panels.set(id, nextPanel);
    this.snapshots.set(id, { ...nextValues });
    const previousBaseValues = this.baseValues.get(id) ?? {};
    const nextBaseValues = this.reconcileValues(defaultValues, previousBaseValues, controlsByPath);
    for (const [path, value] of Object.entries(nextValues)) {
      if (path.endsWith(".__mode")) {
        nextBaseValues[path] = value;
      }
    }
    this.baseValues.set(id, nextBaseValues);
    this.defaultValues.set(id, { ...defaultValues });
    this.presets.set(id, this.reconcilePresets(this.presets.get(id) ?? [], defaultValues, controlsByPath));
    this.persistPanel(id);
    this.notify(id);
    this.notifyGlobal();
  }
  unregisterPanel(id) {
    const nextCount = (this.registrationCounts.get(id) ?? 1) - 1;
    if (nextCount > 0) {
      this.registrationCounts.set(id, nextCount);
      return;
    }
    this.registrationCounts.delete(id);
    this.panels.delete(id);
    this.listeners.delete(id);
    this.actionListeners.delete(id);
    if (!this.retainedPanels.has(id)) {
      this.snapshots.delete(id);
      this.baseValues.delete(id);
      this.defaultValues.delete(id);
      this.presets.delete(id);
      this.activePreset.delete(id);
      this.persistConfigs.delete(id);
    }
    this.notifyGlobal();
  }
  updateValue(panelId, path, value) {
    this.updateValues(panelId, { [path]: value });
  }
  updateValues(panelId, updates) {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    const validUpdates = {};
    for (const [path, value] of Object.entries(updates)) {
      if (!Object.prototype.hasOwnProperty.call(panel.values, path)) {
        continue;
      }
      const control = this.findControlByPath(panel.controls, path);
      if (control?.type === "action") {
        continue;
      }
      panel.values[path] = value;
      validUpdates[path] = value;
    }
    if (Object.keys(validUpdates).length === 0) {
      return;
    }
    const activeId = this.activePreset.get(panelId);
    if (activeId) {
      const presets = this.presets.get(panelId) ?? [];
      const preset = presets.find((p) => p.id === activeId);
      if (preset) {
        for (const [path, value] of Object.entries(validUpdates)) {
          preset.values[path] = value;
        }
      }
    } else {
      const base = this.baseValues.get(panelId);
      if (base) {
        for (const [path, value] of Object.entries(validUpdates)) {
          base[path] = value;
        }
      }
    }
    this.snapshots.set(panelId, { ...panel.values });
    this.persistPanel(panelId);
    for (const [path, value] of Object.entries(validUpdates)) {
      this.changeListeners.forEach((fn) => fn({ panelId, path, value }));
    }
    this.notify(panelId);
  }
  subscribeChanges(listener) {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }
  resetValues(panelId) {
    const panel = this.panels.get(panelId);
    const defaults = this.defaultValues.get(panelId);
    if (!panel || !defaults) return;
    panel.values = { ...defaults };
    this.snapshots.set(panelId, { ...panel.values });
    this.baseValues.set(panelId, { ...defaults });
    this.activePreset.set(panelId, null);
    this.persistPanel(panelId);
    this.notify(panelId);
  }
  updateSpringMode(panelId, path, mode) {
    this.updateTransitionMode(panelId, path, mode);
  }
  getSpringMode(panelId, path) {
    const mode = this.getTransitionMode(panelId, path);
    if (mode === "easing") return "simple";
    return mode;
  }
  updateTransitionMode(panelId, path, mode) {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    panel.values[`${path}.__mode`] = mode;
    this.snapshots.set(panelId, { ...panel.values });
    this.persistPanel(panelId);
    this.notify(panelId);
  }
  getTransitionMode(panelId, path) {
    const panel = this.panels.get(panelId);
    if (!panel) return "simple";
    return panel.values[`${path}.__mode`] || "simple";
  }
  getValue(panelId, path) {
    const panel = this.panels.get(panelId);
    return panel?.values[path];
  }
  getValues(panelId) {
    return this.snapshots.get(panelId) ?? EMPTY_VALUES;
  }
  getPanels() {
    return this.panelsSnapshot;
  }
  getPanel(id) {
    return this.panels.get(id);
  }
  subscribe(panelId, listener) {
    if (!this.listeners.has(panelId)) {
      this.listeners.set(panelId, /* @__PURE__ */ new Set());
    }
    this.listeners.get(panelId).add(listener);
    return () => {
      this.listeners.get(panelId)?.delete(listener);
    };
  }
  subscribeGlobal(listener) {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }
  subscribeActions(panelId, listener) {
    if (!this.actionListeners.has(panelId)) {
      this.actionListeners.set(panelId, /* @__PURE__ */ new Set());
    }
    this.actionListeners.get(panelId).add(listener);
    return () => {
      this.actionListeners.get(panelId)?.delete(listener);
    };
  }
  triggerAction(panelId, path) {
    this.actionListeners.get(panelId)?.forEach((fn) => fn(path));
  }
  savePreset(panelId, name) {
    const panel = this.panels.get(panelId);
    if (!panel) throw new Error(`Panel ${panelId} not found`);
    const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const preset = {
      id,
      name,
      values: { ...panel.values }
    };
    const existing = this.presets.get(panelId) ?? [];
    this.presets.set(panelId, [...existing, preset]);
    this.activePreset.set(panelId, id);
    this.snapshots.set(panelId, { ...panel.values });
    this.persistPanel(panelId);
    this.notify(panelId);
    return id;
  }
  loadPreset(panelId, presetId) {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    const presets = this.presets.get(panelId) ?? [];
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    panel.values = { ...preset.values };
    this.snapshots.set(panelId, { ...panel.values });
    this.activePreset.set(panelId, presetId);
    this.persistPanel(panelId);
    this.notify(panelId);
  }
  deletePreset(panelId, presetId) {
    const presets = this.presets.get(panelId) ?? [];
    this.presets.set(panelId, presets.filter((p) => p.id !== presetId));
    if (this.activePreset.get(panelId) === presetId) {
      this.activePreset.set(panelId, null);
    }
    const panel = this.panels.get(panelId);
    if (panel) {
      this.snapshots.set(panelId, { ...panel.values });
    }
    this.persistPanel(panelId);
    this.notify(panelId);
  }
  getPresets(panelId) {
    return this.presets.get(panelId) ?? [];
  }
  getActivePresetId(panelId) {
    return this.activePreset.get(panelId) ?? null;
  }
  clearActivePreset(panelId) {
    const panel = this.panels.get(panelId);
    const base = this.baseValues.get(panelId);
    if (panel && base) {
      panel.values = { ...base };
      this.snapshots.set(panelId, { ...panel.values });
    }
    this.activePreset.set(panelId, null);
    this.persistPanel(panelId);
    this.notify(panelId);
  }
  resolveShortcutTarget(key, modifier) {
    for (const panel of this.panels.values()) {
      for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
        if (!shortcut.key) continue;
        if (shortcut.key.toLowerCase() !== key.toLowerCase()) continue;
        const scMod = shortcut.modifier ?? void 0;
        if (scMod !== modifier) continue;
        const control = this.findControlByPath(panel.controls, path);
        if (control) {
          return { panelId: panel.id, path, control };
        }
      }
    }
    return null;
  }
  resolveScrollOnlyTargets() {
    const results = [];
    for (const panel of this.panels.values()) {
      for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
        if ((shortcut.interaction ?? "scroll") !== "scroll-only") continue;
        const control = this.findControlByPath(panel.controls, path);
        if (control) {
          results.push({ panelId: panel.id, path, control, shortcut });
        }
      }
    }
    return results;
  }
  configurePanelRetention(id, options) {
    if (options.retainOnUnmount) {
      this.retainedPanels.add(id);
    }
    const persistConfig = this.normalizePersistConfig(id, options.persist);
    if (persistConfig) {
      this.persistConfigs.set(id, persistConfig);
      this.retainedPanels.add(id);
    }
  }
  reconcileValues(defaultValues, previousValues, controlsByPath) {
    const nextValues = {};
    for (const [path, defaultValue] of Object.entries(defaultValues)) {
      if (path.endsWith(".__mode")) {
        const transitionPath = path.slice(0, -".__mode".length);
        const transitionControl = controlsByPath.get(transitionPath);
        nextValues[path] = transitionControl?.type === "transition" && previousValues[path] !== void 0 ? previousValues[path] : defaultValue;
        continue;
      }
      nextValues[path] = this.normalizePreservedValue(
        previousValues[path],
        defaultValue,
        controlsByPath.get(path)
      );
    }
    return nextValues;
  }
  reconcilePresets(presets, defaultValues, controlsByPath) {
    return presets.map((preset) => ({
      ...preset,
      values: this.reconcileValues(defaultValues, preset.values, controlsByPath)
    }));
  }
  normalizePersistConfig(id, persist) {
    if (!persist) return null;
    const options = typeof persist === "object" ? persist : {};
    return {
      key: options.key ?? `dialkit:${id}`,
      storage: options.storage ?? "localStorage",
      presets: options.presets ?? true
    };
  }
  loadPersistedPanel(id) {
    const config = this.persistConfigs.get(id);
    if (!config) return null;
    const storage = this.getStorage(config.storage);
    if (!storage) return null;
    try {
      const raw = storage.getItem(config.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }
  persistPanel(id) {
    const config = this.persistConfigs.get(id);
    if (!config) return;
    const storage = this.getStorage(config.storage);
    if (!storage) return;
    const values = this.snapshots.get(id) ?? this.panels.get(id)?.values;
    if (!values) return;
    const state = {
      version: 1,
      values,
      baseValues: this.baseValues.get(id) ?? values,
      activePresetId: this.activePreset.get(id) ?? null
    };
    if (config.presets) {
      state.presets = this.presets.get(id) ?? [];
    }
    try {
      storage.setItem(config.key, JSON.stringify(state));
    } catch {
    }
  }
  getStorage(kind) {
    if (typeof globalThis === "undefined" || !("window" in globalThis)) {
      return null;
    }
    try {
      return kind === "sessionStorage" ? globalThis.window?.sessionStorage ?? null : globalThis.window?.localStorage ?? null;
    } catch {
      return null;
    }
  }
  findControlByPath(controls, path) {
    for (const control of controls) {
      if (control.path === path) return control;
      if (control.type === "folder" && control.children) {
        const found = this.findControlByPath(control.children, path);
        if (found) return found;
      }
    }
    return null;
  }
  notify(panelId) {
    this.listeners.get(panelId)?.forEach((fn) => fn());
  }
  notifyGlobal() {
    this.panelsSnapshot = Array.from(this.panels.values());
    this.globalListeners.forEach((fn) => fn());
  }
  initTransitionModes(config, prefix, values) {
    for (const [key, value] of Object.entries(config)) {
      if (key === "_collapsed") continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (this.isEasingConfig(value)) {
        values[`${path}.__mode`] = "easing";
      } else if (this.isSpringConfig(value)) {
        const hasPhysics = value.stiffness !== void 0 || value.damping !== void 0 || value.mass !== void 0;
        const hasTime = value.visualDuration !== void 0 || value.bounce !== void 0;
        values[`${path}.__mode`] = hasPhysics && !hasTime ? "advanced" : "simple";
      } else if (typeof value === "object" && value !== null && !Array.isArray(value) && !this.isActionConfig(value) && !this.isSelectConfig(value) && !this.isColorConfig(value) && !this.isTextConfig(value)) {
        this.initTransitionModes(value, path, values);
      }
    }
  }
  parseConfig(config, prefix, shortcuts) {
    const controls = [];
    for (const [key, value] of Object.entries(config)) {
      if (key === "_collapsed") continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const label = this.formatLabel(key);
      const shortcut = shortcuts?.[path];
      if (Array.isArray(value) && value.length <= 4 && typeof value[0] === "number") {
        controls.push({
          type: "slider",
          path,
          label,
          min: value[1],
          max: value[2],
          step: value[3] ?? this.inferStep(value[1], value[2]),
          shortcut
        });
      } else if (typeof value === "number") {
        const { min, max, step } = this.inferRange(value);
        controls.push({ type: "slider", path, label, min, max, step, shortcut });
      } else if (typeof value === "boolean") {
        controls.push({ type: "toggle", path, label, shortcut });
      } else if (this.isSpringConfig(value) || this.isEasingConfig(value)) {
        controls.push({ type: "transition", path, label });
      } else if (this.isActionConfig(value)) {
        controls.push({ type: "action", path, label: value.label || label });
      } else if (this.isSelectConfig(value)) {
        controls.push({ type: "select", path, label, options: value.options });
      } else if (this.isColorConfig(value)) {
        controls.push({ type: "color", path, label });
      } else if (this.isTextConfig(value)) {
        controls.push({ type: "text", path, label, placeholder: value.placeholder });
      } else if (typeof value === "string") {
        if (this.isHexColor(value)) {
          controls.push({ type: "color", path, label });
        } else {
          controls.push({ type: "text", path, label });
        }
      } else if (typeof value === "object" && value !== null) {
        const folderConfig = value;
        const defaultOpen = "_collapsed" in folderConfig ? !folderConfig._collapsed : true;
        controls.push({
          type: "folder",
          path,
          label,
          defaultOpen,
          children: this.parseConfig(folderConfig, path, shortcuts)
        });
      }
    }
    return controls;
  }
  flattenValues(config, prefix) {
    const values = {};
    for (const [key, value] of Object.entries(config)) {
      if (key === "_collapsed") continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(value) && value.length <= 4 && typeof value[0] === "number") {
        values[path] = value[0];
      } else if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
        values[path] = value;
      } else if (this.isSpringConfig(value) || this.isEasingConfig(value)) {
        values[path] = value;
      } else if (this.isActionConfig(value)) {
        values[path] = value;
      } else if (this.isSelectConfig(value)) {
        const firstOption = value.options[0];
        const firstValue = typeof firstOption === "string" ? firstOption : firstOption.value;
        values[path] = value.default ?? firstValue;
      } else if (this.isColorConfig(value)) {
        values[path] = value.default ?? "#000000";
      } else if (this.isTextConfig(value)) {
        values[path] = value.default ?? "";
      } else if (typeof value === "object" && value !== null) {
        Object.assign(values, this.flattenValues(value, path));
      }
    }
    return values;
  }
  isSpringConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "spring";
  }
  isEasingConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "easing";
  }
  isActionConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "action";
  }
  isSelectConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "select" && "options" in value && Array.isArray(value.options);
  }
  isColorConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "color";
  }
  isTextConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "text";
  }
  isHexColor(value) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
  }
  formatLabel(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()).trim();
  }
  inferRange(value) {
    if (value >= 0 && value <= 1) {
      return { min: 0, max: 1, step: 0.01 };
    } else if (value >= 0 && value <= 10) {
      return { min: 0, max: value * 3 || 10, step: 0.1 };
    } else if (value >= 0 && value <= 100) {
      return { min: 0, max: value * 3 || 100, step: 1 };
    } else if (value >= 0) {
      return { min: 0, max: value * 3 || 1e3, step: 10 };
    } else {
      return { min: value * 3, max: -value * 3, step: 1 };
    }
  }
  inferStep(min, max) {
    const range = max - min;
    if (range <= 1) return 0.01;
    if (range <= 10) return 0.1;
    if (range <= 100) return 1;
    return 10;
  }
  normalizePreservedValue(existingValue, defaultValue, control) {
    if (existingValue === void 0 || !control) {
      return defaultValue;
    }
    switch (control.type) {
      case "slider": {
        if (typeof existingValue !== "number" || typeof defaultValue !== "number") {
          return defaultValue;
        }
        const min = control.min ?? Number.NEGATIVE_INFINITY;
        const max = control.max ?? Number.POSITIVE_INFINITY;
        const clamped = Math.min(max, Math.max(min, existingValue));
        if (typeof control.step !== "number" || control.step <= 0) {
          return clamped;
        }
        return this.roundToStep(clamped, min, max, control.step);
      }
      case "toggle":
        return typeof existingValue === "boolean" ? existingValue : defaultValue;
      case "select": {
        if (typeof existingValue !== "string") {
          return defaultValue;
        }
        const options = control.options ?? [];
        const validValues = new Set(options.map((option) => typeof option === "string" ? option : option.value));
        return validValues.has(existingValue) ? existingValue : defaultValue;
      }
      case "color":
      case "text":
        return typeof existingValue === "string" ? existingValue : defaultValue;
      case "transition":
        if (this.isSpringConfig(defaultValue)) {
          return this.isSpringConfig(existingValue) ? existingValue : defaultValue;
        }
        if (this.isEasingConfig(defaultValue)) {
          return this.isEasingConfig(existingValue) ? existingValue : defaultValue;
        }
        return defaultValue;
      case "action":
        return defaultValue;
      default:
        return defaultValue;
    }
  }
  roundToStep(value, min, max, step) {
    const snapped = min + Math.round((value - min) / step) * step;
    const clamped = Math.min(max, Math.max(min, snapped));
    const precision = this.stepPrecision(step);
    return Number(clamped.toFixed(precision));
  }
  stepPrecision(step) {
    const text = String(step);
    const decimalIndex = text.indexOf(".");
    return decimalIndex === -1 ? 0 : text.length - decimalIndex - 1;
  }
  mapControlsByPath(controls) {
    const map = /* @__PURE__ */ new Map();
    const visit = (nodes) => {
      for (const node of nodes) {
        if (node.type === "folder" && node.children) {
          visit(node.children);
          continue;
        }
        map.set(node.path, node);
      }
    };
    visit(controls);
    return map;
  }
};
var DialStore = new DialStoreClass();

// src/vue/useDialKit.ts
var dialKitInstance = 0;
function useDialKit(name, config, options) {
  return useDialKitController(name, config, options).values;
}
function useDialKitController(name, config, options) {
  const hasStableId = options?.id !== void 0;
  const panelId = options?.id ?? `${name}-${++dialKitInstance}`;
  const configRef = shallowRef(config);
  const onActionRef = ref(options?.onAction);
  const shortcutsRef = shallowRef(options?.shortcuts);
  const persistRef = shallowRef(options?.persist);
  const flatValues = ref(DialStore.getValues(panelId));
  const mounted = ref(false);
  const serializedConfig = computed(() => JSON.stringify(config));
  const serializedShortcuts = computed(() => JSON.stringify(options?.shortcuts));
  const serializedPersist = computed(() => JSON.stringify(options?.persist));
  let unsubscribeValues;
  let unsubscribeActions;
  const register = () => {
    DialStore.registerPanel(panelId, name, configRef.value, shortcutsRef.value, {
      retainOnUnmount: hasStableId,
      persist: persistRef.value
    });
    flatValues.value = DialStore.getValues(panelId);
    unsubscribeValues = DialStore.subscribe(panelId, () => {
      flatValues.value = DialStore.getValues(panelId);
    });
    unsubscribeActions = DialStore.subscribeActions(panelId, (action) => {
      onActionRef.value?.(action);
    });
  };
  watch(() => options?.onAction, (next) => {
    onActionRef.value = next;
  });
  watch(() => options?.shortcuts, (next) => {
    shortcutsRef.value = next;
  });
  watch(() => options?.persist, (next) => {
    persistRef.value = next;
  });
  watch([serializedConfig, serializedShortcuts, serializedPersist], () => {
    configRef.value = config;
    shortcutsRef.value = options?.shortcuts;
    persistRef.value = options?.persist;
    if (mounted.value) {
      DialStore.updatePanel(panelId, name, configRef.value, shortcutsRef.value, {
        retainOnUnmount: hasStableId,
        persist: persistRef.value
      });
      flatValues.value = DialStore.getValues(panelId);
    }
  });
  onMounted(register);
  onMounted(() => {
    mounted.value = true;
  });
  onUnmounted(() => {
    unsubscribeValues?.();
    unsubscribeActions?.();
    DialStore.unregisterPanel(panelId);
  });
  const values = computed(() => resolveDialValues(configRef.value, flatValues.value));
  return {
    values,
    setValue(path, value) {
      DialStore.updateValue(panelId, path, value);
    },
    setValues(nextValues) {
      DialStore.updateValues(panelId, flattenDialValueUpdates(configRef.value, nextValues));
    },
    resetValues() {
      DialStore.resetValues(panelId);
    },
    getValues() {
      return resolveDialValues(configRef.value, DialStore.getValues(panelId));
    }
  };
}

// src/vue/directives/dialkit.ts
import {
  createApp,
  defineComponent as defineComponent16,
  h as h16,
  shallowRef as shallowRef2
} from "vue";

// src/vue/components/DialRoot.ts
import { computed as computed5, defineComponent as defineComponent15, h as h15, nextTick as nextTick3, onMounted as onMounted10, onUnmounted as onUnmounted9, ref as ref13, Teleport as Teleport3 } from "vue";

// src/vue/components/Folder.ts
import { defineComponent, h, onMounted as onMounted2, onUnmounted as onUnmounted2, ref as ref2 } from "vue";
import { AnimatePresence, motion } from "motion-v";

// src/icons.ts
var ICON_CHEVRON = "M6 9.5L12 15.5L18 9.5";
var ICON_CHECK = "M5 12.75L10 19L19 5";
var ICON_CLIPBOARD = {
  board: "M8 6C8 4.34315 9.34315 3 11 3H13C14.6569 3 16 4.34315 16 6V7H8V6Z",
  sparkle: "M19.2405 16.1852L18.5436 14.3733C18.4571 14.1484 18.241 14 18 14C17.759 14 17.5429 14.1484 17.4564 14.3733L16.7595 16.1852C16.658 16.4493 16.4493 16.658 16.1852 16.7595L14.3733 17.4564C14.1484 17.5429 14 17.759 14 18C14 18.241 14.1484 18.4571 14.3733 18.5436L16.1852 19.2405C16.4493 19.342 16.658 19.5507 16.7595 19.8148L17.4564 21.6267C17.5429 21.8516 17.759 22 18 22C18.241 22 18.4571 21.8516 18.5436 21.6267L19.2405 19.8148C19.342 19.5507 19.5507 19.342 19.8148 19.2405L21.6267 18.5436C21.8516 18.4571 22 18.241 22 18C22 17.759 21.8516 17.5429 21.6267 17.4564L19.8148 16.7595C19.5507 16.658 19.342 16.4493 19.2405 16.1852Z",
  body: "M16 5H17C18.6569 5 20 6.34315 20 8V11M8 5H7C5.34315 5 4 6.34315 4 8V18C4 19.6569 5.34315 21 7 21H12"
};
var ICON_ADD_PRESET = [
  "M4 6H20",
  "M4 12H10",
  "M15 15L21 15",
  "M18 12V18",
  "M4 18H10"
];
var ICON_TRASH = [
  "M5 6.5L5.80734 18.2064C5.91582 19.7794 7.22348 21 8.80023 21H15.1998C16.7765 21 18.0842 19.7794 18.1927 18.2064L19 6.5",
  "M10 11V16",
  "M14 11V16",
  "M3.5 6H20.5",
  "M8.07092 5.74621C8.42348 3.89745 10.0485 2.5 12 2.5C13.9515 2.5 15.5765 3.89745 15.9291 5.74621"
];
var ICON_PANEL = {
  path: "M6.84766 11.75C6.78583 11.9899 6.75 12.2408 6.75 12.5C6.75 12.7592 6.78583 13.0101 6.84766 13.25H2C1.58579 13.25 1.25 12.9142 1.25 12.5C1.25 12.0858 1.58579 11.75 2 11.75H6.84766ZM14 11.75C14.4142 11.75 14.75 12.0858 14.75 12.5C14.75 12.9142 14.4142 13.25 14 13.25H12.6523C12.7142 13.0101 12.75 12.7592 12.75 12.5C12.75 12.2408 12.7142 11.9899 12.6523 11.75H14ZM3.09766 7.25C3.03583 7.48994 3 7.74075 3 8C3 8.25925 3.03583 8.51006 3.09766 8.75H2C1.58579 8.75 1.25 8.41421 1.25 8C1.25 7.58579 1.58579 7.25 2 7.25H3.09766ZM14 7.25C14.4142 7.25 14.75 7.58579 14.75 8C14.75 8.41421 14.4142 8.75 14 8.75H8.90234C8.96417 8.51006 9 8.25925 9 8C9 7.74075 8.96417 7.48994 8.90234 7.25H14ZM7.59766 2.75C7.53583 2.98994 7.5 3.24075 7.5 3.5C7.5 3.75925 7.53583 4.01006 7.59766 4.25H2C1.58579 4.25 1.25 3.91421 1.25 3.5C1.25 3.08579 1.58579 2.75 2 2.75H7.59766ZM14 2.75C14.4142 2.75 14.75 3.08579 14.75 3.5C14.75 3.91421 14.4142 4.25 14 4.25H13.4023C13.4642 4.01006 13.5 3.75925 13.5 3.5C13.5 3.24075 13.4642 2.98994 13.4023 2.75H14Z",
  circles: [
    { cx: "6", cy: "8", r: "0.998596" },
    { cx: "10.4999", cy: "3.5", r: "0.998657" },
    { cx: "9.75015", cy: "12.5", r: "0.997986" }
  ]
};

// src/vue/components/Folder.ts
var Folder = defineComponent({
  name: "DialKitFolder",
  props: {
    title: { type: String, required: true },
    defaultOpen: { type: Boolean, default: true },
    isRoot: { type: Boolean, default: false },
    inline: { type: Boolean, default: false },
    toolbar: {
      type: null,
      required: false,
      default: null
    },
    panelHeightOffset: {
      type: Number,
      default: 10
    }
  },
  emits: ["openChange"],
  setup(props, { emit, slots }) {
    const isOpen = ref2(props.defaultOpen);
    const isCollapsed = ref2(!props.defaultOpen);
    const contentRef = ref2(null);
    const contentHeight = ref2(void 0);
    const windowHeight = ref2(typeof window !== "undefined" ? window.innerHeight : 800);
    let resizeHandler = null;
    if (props.isRoot) {
      resizeHandler = () => {
        windowHeight.value = window.innerHeight;
      };
      window.addEventListener("resize", resizeHandler);
    }
    onUnmounted2(() => {
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    });
    const handleToggle = () => {
      if (props.inline && props.isRoot) return;
      const next = !isOpen.value;
      isOpen.value = next;
      isCollapsed.value = !next;
      emit("openChange", next);
    };
    let ro = null;
    onMounted2(() => {
      if (!props.isRoot || typeof ResizeObserver === "undefined") return;
      const el = contentRef.value;
      if (!el) return;
      ro = new ResizeObserver(() => {
        if (isOpen.value) {
          const next = el.offsetHeight;
          if (contentHeight.value !== next) {
            contentHeight.value = next;
          }
        }
      });
      ro.observe(el);
      if (isOpen.value) {
        contentHeight.value = el.offsetHeight;
      }
    });
    onUnmounted2(() => {
      ro?.disconnect();
    });
    const renderHeader = () => h("div", {
      class: `dialkit-folder-header ${props.isRoot ? "dialkit-panel-header" : ""}`,
      onClick: handleToggle
    }, [
      h("div", { class: "dialkit-folder-header-top" }, [
        props.isRoot ? isOpen.value ? h("div", { class: "dialkit-folder-title-row" }, [
          h("span", { class: "dialkit-folder-title dialkit-folder-title-root" }, props.title)
        ]) : null : h("div", { class: "dialkit-folder-title-row" }, [
          h("span", { class: "dialkit-folder-title" }, props.title)
        ]),
        props.isRoot && !props.inline ? h("svg", { class: "dialkit-panel-icon", viewBox: "0 0 16 16", fill: "none" }, [
          h("path", {
            opacity: "0.5",
            d: ICON_PANEL.path,
            fill: "currentColor"
          }),
          ...ICON_PANEL.circles.map((c) => h("circle", { cx: c.cx, cy: c.cy, r: c.r, fill: "currentColor", stroke: "currentColor", "stroke-width": "1.25" }))
        ]) : null,
        !props.isRoot ? h(motion.svg, {
          class: "dialkit-folder-icon",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2.5",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          initial: false,
          animate: { rotate: isOpen.value ? 0 : 180 },
          transition: { type: "spring", visualDuration: 0.35, bounce: 0.15 }
        }, [h("path", { d: ICON_CHEVRON })]) : null
      ]),
      props.isRoot && props.toolbar && isOpen.value ? h("div", { class: "dialkit-panel-toolbar", onClick: (event) => event.stopPropagation() }, [props.toolbar()]) : null
    ]);
    const renderChildren = () => h("div", { class: "dialkit-folder-inner" }, slots.default ? slots.default() : []);
    const renderContent = () => {
      if (props.isRoot) {
        return isOpen.value ? h("div", { class: "dialkit-folder-content" }, [renderChildren()]) : null;
      }
      return h(AnimatePresence, { initial: false }, {
        default: () => isOpen.value ? [h(motion.div, {
          key: "dialkit-folder-content",
          class: "dialkit-folder-content",
          initial: { height: 0, opacity: 0 },
          animate: { height: "auto", opacity: 1 },
          exit: { height: 0, opacity: 0 },
          transition: { type: "spring", visualDuration: 0.35, bounce: 0.1 },
          style: { clipPath: "inset(0 -20px)" }
        }, [renderChildren()])] : []
      });
    };
    const folderContent = () => h("div", {
      ref: props.isRoot ? contentRef : void 0,
      class: `dialkit-folder ${props.isRoot ? "dialkit-folder-root" : ""}`,
      "data-open": String(isOpen.value)
    }, [
      renderHeader(),
      renderContent()
    ]);
    return () => {
      if (props.isRoot) {
        if (props.inline) {
          return h("div", { class: "dialkit-panel-inner dialkit-panel-inline" }, [folderContent()]);
        }
        const panelStyle = isOpen.value ? {
          width: 280,
          height: contentHeight.value !== void 0 ? Math.min(contentHeight.value + props.panelHeightOffset, windowHeight.value - 32) : "auto",
          borderRadius: 14,
          boxShadow: "var(--dial-shadow)",
          cursor: void 0,
          overflowY: "auto"
        } : {
          width: 42,
          height: 42,
          borderRadius: 21,
          boxShadow: "var(--dial-shadow-collapsed)",
          overflow: "hidden",
          cursor: "pointer"
        };
        return h(motion.div, {
          class: "dialkit-panel-inner",
          style: panelStyle,
          onClick: !isOpen.value ? handleToggle : void 0,
          "data-collapsed": String(isCollapsed.value),
          whilePress: !isOpen.value ? { scale: 0.9 } : void 0,
          transition: { type: "spring", visualDuration: 0.15, bounce: 0.3 }
        }, [folderContent()]);
      }
      return folderContent();
    };
  }
});

// src/vue/components/Panel.ts
import { Fragment, defineComponent as defineComponent14, h as h14, onMounted as onMounted9, onUnmounted as onUnmounted8, ref as ref12 } from "vue";
import { AnimatePresence as AnimatePresence4, motion as motion4 } from "motion-v";

// src/vue/components/Slider.ts
import { defineComponent as defineComponent2, h as h2, computed as computed2, nextTick, onMounted as onMounted3, onUnmounted as onUnmounted3, ref as ref3, watch as watch2 } from "vue";
import { animate, motionValue } from "motion-v";

// src/shortcut-utils.ts
function decimalsForStep(step) {
  const s = step.toString();
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}
function roundValue(val, step) {
  const raw = Math.round(val / step) * step;
  return parseFloat(raw.toFixed(decimalsForStep(step)));
}
function getEffectiveStep(control, shortcut) {
  const min = control.min ?? 0;
  const max = control.max ?? 1;
  const range = max - min;
  const mode = shortcut.mode ?? "normal";
  return mode === "fine" ? range * 0.01 : mode === "coarse" ? range * 0.1 : control.step ?? 1;
}
function applySliderDelta(panelId, path, control, effectiveStep, direction) {
  const currentValue = DialStore.getValue(panelId, path);
  const min = control.min ?? 0;
  const max = control.max ?? 1;
  const newValue = Math.max(min, Math.min(max, currentValue + direction * effectiveStep));
  DialStore.updateValue(panelId, path, roundValue(newValue, effectiveStep));
}
function snapToDecile(rawValue, min, max) {
  const normalized = (rawValue - min) / (max - min);
  const nearest = Math.round(normalized * 10) / 10;
  if (Math.abs(normalized - nearest) <= 0.03125) {
    return min + nearest * (max - min);
  }
  return rawValue;
}
function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (el.contentEditable === "true") return true;
  return false;
}
function getActiveModifier(e) {
  if (e.altKey) return "alt";
  if (e.shiftKey) return "shift";
  if (e.metaKey) return "meta";
  return void 0;
}
function findControl(controls, path) {
  for (const control of controls) {
    if (control.path === path) return control;
    if (control.type === "folder" && control.children) {
      const found = findControl(control.children, path);
      if (found) return found;
    }
  }
  return null;
}
var DRAG_SENSITIVITY = 4;
function formatInteractionLabel(interaction) {
  switch (interaction) {
    case "drag":
      return "Drag";
    case "move":
      return "Move";
    case "scroll-only":
      return "Scroll";
    default:
      return "Scroll";
  }
}
function formatSliderShortcut(sc) {
  const interaction = sc.interaction ?? "scroll";
  const actionLabel = formatInteractionLabel(interaction);
  if (!sc.key) return actionLabel;
  const mod = formatModifier(sc.modifier);
  return `${mod}${sc.key.toUpperCase()}+${actionLabel}`;
}
function formatToggleShortcut(sc) {
  if (!sc.key) return "Press";
  const mod = formatModifier(sc.modifier);
  return `${mod}${sc.key.toUpperCase()}`;
}
function formatModifier(modifier) {
  return modifier === "alt" ? "\u2325" : modifier === "shift" ? "\u21E7" : modifier === "meta" ? "\u2318" : "";
}

// src/vue/components/Slider.ts
var CLICK_THRESHOLD = 3;
var DEAD_ZONE = 32;
var MAX_CURSOR_RANGE = 200;
var MAX_STRETCH = 8;
var Slider = defineComponent2({
  name: "DialKitSlider",
  props: {
    label: { type: String, required: true },
    value: { type: Number, required: true },
    min: { type: Number, required: false },
    max: { type: Number, required: false },
    step: { type: Number, required: false },
    unit: { type: String, required: false },
    shortcut: { type: Object, default: void 0 },
    shortcutActive: { type: Boolean, default: false }
  },
  emits: ["change"],
  setup(props, { emit }) {
    const min = computed2(() => props.min ?? 0);
    const max = computed2(() => props.max ?? 1);
    const step = computed2(() => props.step ?? 0.01);
    const wrapperRef = ref3(null);
    const trackRef = ref3(null);
    const fillRef = ref3(null);
    const handleRef = ref3(null);
    const labelRef = ref3(null);
    const valueSpanRef = ref3(null);
    const inputRef = ref3(null);
    const isInteracting = ref3(false);
    const isDragging = ref3(false);
    const isHovered = ref3(false);
    const isValueHovered = ref3(false);
    const isValueEditable = ref3(false);
    const showInput = ref3(false);
    const inputValue = ref3("");
    const fillPercent = motionValue((props.value - min.value) / (max.value - min.value) * 100);
    const rubberStretchPx = motionValue(0);
    const handleOpacityMv = motionValue(0);
    const handleScaleXMv = motionValue(0.25);
    const handleScaleYMv = motionValue(1);
    const percentage = computed2(() => (props.value - min.value) / (max.value - min.value) * 100);
    const isActive = computed2(() => isInteracting.value || isHovered.value);
    const displayValue = computed2(() => props.value.toFixed(decimalsForStep(step.value)));
    let pointerDownPos = null;
    let isClickFlag = true;
    let wrapperRect = null;
    let scaleVal = 1;
    let hoverTimeout = null;
    let snapAnim = null;
    let rubberAnim = null;
    let handleOpacityAnim = null;
    let handleScaleXAnim = null;
    let handleScaleYAnim = null;
    const applyFillStyles = (pct) => {
      if (fillRef.value) fillRef.value.style.width = `${pct}%`;
      if (handleRef.value) handleRef.value.style.left = `max(5px, calc(${pct}% - 9px))`;
    };
    const applyRubberStyles = (stretch) => {
      if (!trackRef.value) return;
      trackRef.value.style.width = `calc(100% + ${Math.abs(stretch)}px)`;
      trackRef.value.style.transform = `translateX(${stretch < 0 ? stretch : 0}px)`;
    };
    const applyHandleVisualStyles = () => {
      if (!handleRef.value) return;
      handleRef.value.style.opacity = String(handleOpacityMv.get());
      handleRef.value.style.transform = `translateY(-50%) scaleX(${handleScaleXMv.get()}) scaleY(${handleScaleYMv.get()})`;
    };
    const positionToValue = (clientX) => {
      if (!wrapperRect) return props.value;
      const screenX = clientX - wrapperRect.left;
      const sceneX = screenX / scaleVal;
      const nativeWidth = wrapperRef.value ? wrapperRef.value.offsetWidth : wrapperRect.width;
      const pct = Math.max(0, Math.min(1, sceneX / nativeWidth));
      const rawValue = min.value + pct * (max.value - min.value);
      return Math.max(min.value, Math.min(max.value, rawValue));
    };
    const percentFromValue = (value) => (value - min.value) / (max.value - min.value) * 100;
    const computeRubberStretch = (clientX, sign) => {
      if (!wrapperRect) return 0;
      const distancePast = sign < 0 ? wrapperRect.left - clientX : clientX - wrapperRect.right;
      const overflow = Math.max(0, distancePast - DEAD_ZONE);
      return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1));
    };
    const leftThreshold = () => {
      const HANDLE_BUFFER = 8;
      const LABEL_CSS_LEFT = 10;
      const trackWidth = wrapperRef.value?.offsetWidth;
      if (trackWidth && labelRef.value) {
        return (LABEL_CSS_LEFT + labelRef.value.offsetWidth + HANDLE_BUFFER) / trackWidth * 100;
      }
      return 30;
    };
    const rightThreshold = () => {
      const HANDLE_BUFFER = 8;
      const VALUE_CSS_RIGHT = 10;
      const trackWidth = wrapperRef.value?.offsetWidth;
      if (trackWidth && valueSpanRef.value) {
        return (trackWidth - VALUE_CSS_RIGHT - valueSpanRef.value.offsetWidth - HANDLE_BUFFER) / trackWidth * 100;
      }
      return 78;
    };
    const valueDodge = () => percentage.value < leftThreshold() || percentage.value > rightThreshold();
    const handleOpacity = () => {
      if (!isActive.value) return 0;
      if (valueDodge()) return 0.1;
      if (isDragging.value) return 0.9;
      return 0.5;
    };
    const animateHandleState = () => {
      const targetOpacity = handleOpacity();
      const targetScaleX = isActive.value ? 1 : 0.25;
      const targetScaleY = isActive.value && valueDodge() ? 0.75 : 1;
      handleOpacityAnim?.stop();
      handleScaleXAnim?.stop();
      handleScaleYAnim?.stop();
      handleOpacityAnim = animate(handleOpacityMv, targetOpacity, { duration: 0.15 });
      handleScaleXAnim = animate(handleScaleXMv, targetScaleX, {
        type: "spring",
        visualDuration: 0.25,
        bounce: 0.15
      });
      handleScaleYAnim = animate(handleScaleYMv, targetScaleY, {
        type: "spring",
        visualDuration: 0.2,
        bounce: 0.1
      });
    };
    const handlePointerDown = (event) => {
      if (showInput.value) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerDownPos = { x: event.clientX, y: event.clientY };
      isClickFlag = true;
      isInteracting.value = true;
      if (wrapperRef.value) {
        wrapperRect = wrapperRef.value.getBoundingClientRect();
        scaleVal = wrapperRect.width / wrapperRef.value.offsetWidth;
      }
    };
    const handlePointerMove = (event) => {
      if (!isInteracting.value || !pointerDownPos) return;
      const dx = event.clientX - pointerDownPos.x;
      const dy = event.clientY - pointerDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (isClickFlag && distance > CLICK_THRESHOLD) {
        isClickFlag = false;
        isDragging.value = true;
      }
      if (!isClickFlag) {
        if (wrapperRect) {
          if (event.clientX < wrapperRect.left) {
            rubberStretchPx.jump(computeRubberStretch(event.clientX, -1));
          } else if (event.clientX > wrapperRect.right) {
            rubberStretchPx.jump(computeRubberStretch(event.clientX, 1));
          } else {
            rubberStretchPx.jump(0);
          }
        }
        const nextValue = positionToValue(event.clientX);
        const nextPct = percentFromValue(nextValue);
        if (snapAnim) {
          snapAnim.stop();
          snapAnim = null;
        }
        fillPercent.jump(nextPct);
        emit("change", roundValue(nextValue, step.value));
      }
    };
    const handlePointerUp = (event) => {
      if (!isInteracting.value) return;
      if (isClickFlag) {
        const rawValue = positionToValue(event.clientX);
        const discreteSteps2 = (max.value - min.value) / step.value;
        const snappedValue = discreteSteps2 <= 10 ? Math.max(min.value, Math.min(max.value, min.value + Math.round((rawValue - min.value) / step.value) * step.value)) : snapToDecile(rawValue, min.value, max.value);
        const nextPct = percentFromValue(snappedValue);
        snapAnim?.stop();
        snapAnim = animate(fillPercent, nextPct, {
          type: "spring",
          stiffness: 300,
          damping: 25,
          mass: 0.8,
          onComplete: () => {
            snapAnim = null;
          }
        });
        emit("change", roundValue(snappedValue, step.value));
      }
      if (rubberStretchPx.get() !== 0) {
        rubberAnim?.stop();
        rubberAnim = animate(rubberStretchPx, 0, {
          type: "spring",
          visualDuration: 0.35,
          bounce: 0.15
        });
      }
      isInteracting.value = false;
      isDragging.value = false;
      pointerDownPos = null;
    };
    const handlePointerCancel = () => {
      if (!isInteracting.value) return;
      isInteracting.value = false;
      isDragging.value = false;
      rubberStretchPx.jump(0);
      pointerDownPos = null;
    };
    const handleInputSubmit = () => {
      const parsed = parseFloat(inputValue.value);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.max(min.value, Math.min(max.value, parsed));
        emit("change", roundValue(clamped, step.value));
      }
      showInput.value = false;
      isValueHovered.value = false;
      isValueEditable.value = false;
    };
    const handleValueClick = (event) => {
      if (!isValueEditable.value) return;
      event.stopPropagation();
      event.preventDefault();
      showInput.value = true;
      inputValue.value = props.value.toFixed(decimalsForStep(step.value));
    };
    const handleInputKeydown = (event) => {
      if (event.key === "Enter") {
        handleInputSubmit();
      } else if (event.key === "Escape") {
        showInput.value = false;
        isValueHovered.value = false;
      }
    };
    watch2(() => props.value, () => {
      if (!isInteracting.value && !snapAnim) {
        fillPercent.jump(percentage.value);
      }
    });
    watch2([isInteracting, isHovered, isDragging, () => props.value], () => {
      animateHandleState();
    });
    watch2([isValueHovered, showInput, isValueEditable], () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      if (isValueHovered.value && !showInput.value && !isValueEditable.value) {
        hoverTimeout = setTimeout(() => {
          isValueEditable.value = true;
          animateHandleState();
        }, 800);
      } else if (!isValueHovered.value && !showInput.value) {
        isValueEditable.value = false;
      }
    });
    watch2(showInput, async (visible) => {
      if (!visible) return;
      await nextTick();
      inputRef.value?.focus();
      inputRef.value?.select();
    });
    const discreteSteps = computed2(() => (max.value - min.value) / step.value);
    const hashMarks = computed2(() => {
      const marks = [];
      if (discreteSteps.value <= 10) {
        const count = Math.max(0, Math.floor(discreteSteps.value) - 1);
        for (let i = 0; i < count; i += 1) {
          const pct = (i + 1) * step.value / (max.value - min.value) * 100;
          marks.push(h2("div", { class: "dialkit-slider-hashmark", style: { left: `${pct}%` } }));
        }
        return marks;
      }
      for (let i = 0; i < 9; i += 1) {
        const pct = (i + 1) * 10;
        marks.push(h2("div", { class: "dialkit-slider-hashmark", style: { left: `${pct}%` } }));
      }
      return marks;
    });
    let unsubFill = null;
    let unsubRubber = null;
    let unsubHandleOpacity = null;
    let unsubHandleScaleX = null;
    let unsubHandleScaleY = null;
    onMounted3(() => {
      unsubFill = fillPercent.on("change", applyFillStyles);
      unsubRubber = rubberStretchPx.on("change", applyRubberStyles);
      unsubHandleOpacity = handleOpacityMv.on("change", applyHandleVisualStyles);
      unsubHandleScaleX = handleScaleXMv.on("change", applyHandleVisualStyles);
      unsubHandleScaleY = handleScaleYMv.on("change", applyHandleVisualStyles);
      applyFillStyles(fillPercent.get());
      applyRubberStyles(rubberStretchPx.get());
      applyHandleVisualStyles();
      animateHandleState();
    });
    onUnmounted3(() => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      snapAnim?.stop();
      rubberAnim?.stop();
      handleOpacityAnim?.stop();
      handleScaleXAnim?.stop();
      handleScaleYAnim?.stop();
      unsubFill?.();
      unsubRubber?.();
      unsubHandleOpacity?.();
      unsubHandleScaleX?.();
      unsubHandleScaleY?.();
    });
    return () => h2("div", { ref: wrapperRef, class: "dialkit-slider-wrapper" }, [
      h2("div", {
        ref: trackRef,
        class: `dialkit-slider ${isActive.value ? "dialkit-slider-active" : ""}`,
        onPointerdown: handlePointerDown,
        onPointermove: handlePointerMove,
        onPointerup: handlePointerUp,
        onPointercancel: handlePointerCancel,
        onMouseenter: () => {
          isHovered.value = true;
          animateHandleState();
        },
        onMouseleave: () => {
          isHovered.value = false;
          animateHandleState();
        }
      }, [
        h2("div", { class: "dialkit-slider-hashmarks" }, hashMarks.value),
        h2("div", {
          ref: fillRef,
          class: "dialkit-slider-fill",
          style: {
            width: `${fillPercent.get()}%`
          }
        }),
        h2("div", {
          ref: handleRef,
          class: "dialkit-slider-handle",
          style: {
            left: `max(5px, calc(${fillPercent.get()}% - 9px))`,
            transform: "translateY(-50%) scaleX(0.25) scaleY(1)",
            opacity: 0
          }
        }),
        h2("span", { ref: labelRef, class: "dialkit-slider-label" }, [
          props.label,
          props.shortcut ? h2("span", {
            class: `dialkit-shortcut-pill${props.shortcutActive ? " dialkit-shortcut-pill-active" : ""}`
          }, formatSliderShortcut(props.shortcut)) : null
        ]),
        showInput.value ? h2("input", {
          ref: inputRef,
          type: "text",
          class: "dialkit-slider-input",
          value: inputValue.value,
          onInput: (event) => {
            inputValue.value = event.target.value;
          },
          onKeydown: handleInputKeydown,
          onBlur: handleInputSubmit,
          onClick: (event) => event.stopPropagation(),
          onMousedown: (event) => event.stopPropagation()
        }) : h2("span", {
          ref: valueSpanRef,
          class: `dialkit-slider-value ${isValueEditable.value ? "dialkit-slider-value-editable" : ""}`,
          onMouseenter: () => {
            isValueHovered.value = true;
          },
          onMouseleave: () => {
            isValueHovered.value = false;
          },
          onClick: handleValueClick,
          onMousedown: (event) => {
            if (isValueEditable.value) event.stopPropagation();
          },
          style: { cursor: isValueEditable.value ? "text" : "default" }
        }, displayValue.value)
      ])
    ]);
  }
});

// src/vue/components/Toggle.ts
import { defineComponent as defineComponent4, h as h4 } from "vue";

// src/vue/components/SegmentedControl.ts
import { defineComponent as defineComponent3, h as h3, nextTick as nextTick2, onMounted as onMounted4, onUnmounted as onUnmounted4, ref as ref4, watch as watch3 } from "vue";
import { animate as animate2 } from "motion";
var SegmentedControl = defineComponent3({
  name: "DialKitSegmentedControl",
  props: {
    options: {
      type: Array,
      required: true
    },
    value: {
      type: String,
      required: true
    }
  },
  emits: ["change"],
  setup(props, { emit }) {
    const containerRef = ref4(null);
    const pillRef = ref4(null);
    const buttonRefs = /* @__PURE__ */ new Map();
    const pillReady = ref4(false);
    let hasAnimated = false;
    let pillAnim = null;
    const measurePill = () => {
      const button = buttonRefs.get(props.value);
      const container = containerRef.value;
      if (!button || !container) return null;
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width
      };
    };
    const setPillImmediate = (left, width) => {
      if (!pillRef.value) return;
      pillRef.value.style.left = `${left}px`;
      pillRef.value.style.width = `${width}px`;
      pillRef.value.style.visibility = "visible";
    };
    const updatePill = (shouldAnimate) => {
      const next = measurePill();
      if (!next) return;
      if (!pillReady.value) {
        setPillImmediate(next.left, next.width);
        pillReady.value = true;
        return;
      }
      if (!shouldAnimate || !hasAnimated || !pillRef.value) {
        pillAnim?.stop();
        pillAnim = null;
        setPillImmediate(next.left, next.width);
        return;
      }
      pillAnim?.stop();
      pillAnim = animate2(
        pillRef.value,
        {
          left: next.left,
          width: next.width
        },
        {
          type: "spring",
          visualDuration: 0.2,
          bounce: 0.15,
          onComplete: () => {
            pillAnim = null;
          }
        }
      );
    };
    let ro;
    onMounted4(() => {
      nextTick2(() => {
        updatePill(false);
        hasAnimated = true;
      });
      if (typeof ResizeObserver !== "undefined" && containerRef.value) {
        ro = new ResizeObserver(() => updatePill(false));
        ro.observe(containerRef.value);
      }
    });
    onUnmounted4(() => {
      pillAnim?.stop();
      ro?.disconnect();
    });
    watch3(
      () => props.value,
      () => {
        updatePill(true);
      },
      { flush: "post" }
    );
    return () => h3("div", { ref: containerRef, class: "dialkit-segmented" }, [
      h3("div", {
        ref: pillRef,
        class: "dialkit-segmented-pill",
        style: {
          left: "0px",
          width: "0px",
          visibility: pillReady.value ? "visible" : "hidden"
        }
      }),
      ...props.options.map((option) => h3("button", {
        ref: ((el) => {
          if (el instanceof HTMLElement) {
            buttonRefs.set(option.value, el);
            return;
          }
          buttonRefs.delete(option.value);
        }),
        class: "dialkit-segmented-button",
        "data-active": String(props.value === option.value),
        onClick: () => emit("change", option.value)
      }, option.label))
    ]);
  }
});

// src/vue/components/Toggle.ts
var Toggle = defineComponent4({
  name: "DialKitToggle",
  props: {
    label: { type: String, required: true },
    checked: { type: Boolean, required: true },
    shortcut: { type: Object, default: void 0 },
    shortcutActive: { type: Boolean, default: false }
  },
  emits: ["change"],
  setup(props, { emit }) {
    return () => h4("div", { class: "dialkit-labeled-control" }, [
      h4("span", { class: "dialkit-labeled-control-label" }, [
        props.label,
        props.shortcut ? h4("span", {
          class: `dialkit-shortcut-pill${props.shortcutActive ? " dialkit-shortcut-pill-active" : ""}`
        }, formatToggleShortcut(props.shortcut)) : null
      ]),
      h4(SegmentedControl, {
        options: [
          { value: "off", label: "Off" },
          { value: "on", label: "On" }
        ],
        value: props.checked ? "on" : "off",
        onChange: (value) => emit("change", value === "on")
      })
    ]);
  }
});

// src/vue/components/SpringControl.ts
import { defineComponent as defineComponent6, h as h6, onMounted as onMounted5, onUnmounted as onUnmounted5, ref as ref5 } from "vue";

// src/vue/components/SpringVisualization.ts
import { defineComponent as defineComponent5, h as h5, computed as computed3 } from "vue";
function generateSpringCurve(stiffness, damping, mass, duration) {
  const points = [];
  const steps = 100;
  const dt = duration / steps;
  let position = 0;
  let velocity = 0;
  const target = 1;
  for (let i = 0; i <= steps; i += 1) {
    const time = i * dt;
    points.push([time, position]);
    const springForce = -stiffness * (position - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;
    velocity += acceleration * dt;
    position += velocity * dt;
  }
  return points;
}
var SpringVisualization = defineComponent5({
  name: "DialKitSpringVisualization",
  props: {
    spring: {
      type: Object,
      required: true
    },
    isSimpleMode: {
      type: Boolean,
      required: true
    }
  },
  setup(props) {
    const width = 256;
    const height = 140;
    const pathData = computed3(() => {
      let stiffness;
      let damping;
      let mass;
      if (props.isSimpleMode) {
        const visualDuration = props.spring.visualDuration ?? 0.3;
        const bounce = props.spring.bounce ?? 0.2;
        mass = 1;
        stiffness = (2 * Math.PI / visualDuration) ** 2;
        const dampingRatio = 1 - bounce;
        damping = 2 * dampingRatio * Math.sqrt(stiffness * mass);
      } else {
        stiffness = props.spring.stiffness ?? 400;
        damping = props.spring.damping ?? 17;
        mass = props.spring.mass ?? 1;
      }
      const duration = 2;
      const points = generateSpringCurve(stiffness, damping, mass, duration);
      const values = points.map(([, value]) => value);
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);
      const valueRange = maxValue - minValue;
      return points.map(([time, value], index) => {
        const x = time / duration * width;
        const normalizedValue = (value - minValue) / (valueRange || 1);
        const y = height - (normalizedValue * height * 0.6 + height * 0.2);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ");
    });
    return () => h5("svg", { viewBox: `0 0 ${width} ${height}`, class: "dialkit-spring-viz" }, [
      ...Array.from({ length: 3 }).flatMap((_, index) => {
        const lineIndex = index + 1;
        const x = width / 4 * lineIndex;
        const y = height / 4 * lineIndex;
        return [
          h5("line", { x1: x, y1: 0, x2: x, y2: height, stroke: "rgba(255, 255, 255, 0.08)", "stroke-width": 1 }),
          h5("line", { x1: 0, y1: y, x2: width, y2: y, stroke: "rgba(255, 255, 255, 0.08)", "stroke-width": 1 })
        ];
      }),
      h5("line", {
        x1: 0,
        y1: height / 2,
        x2: width,
        y2: height / 2,
        stroke: "rgba(255, 255, 255, 0.15)",
        "stroke-width": 1,
        "stroke-dasharray": "4,4"
      }),
      h5("path", {
        d: pathData.value,
        fill: "none",
        stroke: "rgba(255, 255, 255, 0.6)",
        "stroke-width": 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      })
    ]);
  }
});

// src/vue/components/SpringControl.ts
var SpringControl = defineComponent6({
  name: "DialKitSpringControl",
  props: {
    panelId: { type: String, required: true },
    path: { type: String, required: true },
    label: { type: String, required: true },
    spring: {
      type: Object,
      required: true
    }
  },
  emits: ["change"],
  setup(props, { emit }) {
    const mode = ref5(DialStore.getSpringMode(props.panelId, props.path));
    let unsub;
    onMounted5(() => {
      unsub = DialStore.subscribe(props.panelId, () => {
        mode.value = DialStore.getSpringMode(props.panelId, props.path);
      });
    });
    onUnmounted5(() => {
      unsub?.();
    });
    const isSimpleMode = () => mode.value === "simple";
    const cache = {
      simple: props.spring.visualDuration !== void 0 ? { ...props.spring } : { type: "spring", visualDuration: 0.3, bounce: 0.2 },
      advanced: props.spring.stiffness !== void 0 ? { ...props.spring } : { type: "spring", stiffness: 200, damping: 25, mass: 1 }
    };
    const handleModeChange = (nextMode) => {
      if (isSimpleMode()) {
        cache.simple = { ...props.spring };
      } else {
        cache.advanced = { ...props.spring };
      }
      DialStore.updateSpringMode(props.panelId, props.path, nextMode);
      if (nextMode === "simple") {
        emit("change", cache.simple);
      } else {
        emit("change", cache.advanced);
      }
    };
    const handleUpdate = (key, value) => {
      if (isSimpleMode()) {
        const { stiffness, damping, mass, ...rest } = props.spring;
        emit("change", { ...rest, [key]: value });
      } else {
        const { visualDuration, bounce, ...rest } = props.spring;
        emit("change", { ...rest, [key]: value });
      }
    };
    return () => h6(Folder, { title: props.label, defaultOpen: true }, {
      default: () => [
        h6("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
          h6(SpringVisualization, { spring: props.spring, isSimpleMode: isSimpleMode() }),
          h6("div", { class: "dialkit-labeled-control" }, [
            h6("span", { class: "dialkit-labeled-control-label" }, "Type"),
            h6(SegmentedControl, {
              options: [
                { value: "simple", label: "Time" },
                { value: "advanced", label: "Physics" }
              ],
              value: mode.value,
              onChange: handleModeChange
            })
          ]),
          ...isSimpleMode() ? [
            h6(Slider, {
              label: "Duration",
              value: props.spring.visualDuration ?? 0.3,
              min: 0.1,
              max: 1,
              step: 0.05,
              unit: "s",
              onChange: (next) => handleUpdate("visualDuration", next)
            }),
            h6(Slider, {
              label: "Bounce",
              value: props.spring.bounce ?? 0.2,
              min: 0,
              max: 1,
              step: 0.05,
              onChange: (next) => handleUpdate("bounce", next)
            })
          ] : [
            h6(Slider, {
              label: "Stiffness",
              value: props.spring.stiffness ?? 400,
              min: 1,
              max: 1e3,
              step: 10,
              onChange: (next) => handleUpdate("stiffness", next)
            }),
            h6(Slider, {
              label: "Damping",
              value: props.spring.damping ?? 17,
              min: 1,
              max: 100,
              step: 1,
              onChange: (next) => handleUpdate("damping", next)
            }),
            h6(Slider, {
              label: "Mass",
              value: props.spring.mass ?? 1,
              min: 0.1,
              max: 10,
              step: 0.1,
              onChange: (next) => handleUpdate("mass", next)
            })
          ]
        ])
      ]
    });
  }
});

// src/vue/components/TransitionControl.ts
import { defineComponent as defineComponent8, h as h8, onMounted as onMounted6, onUnmounted as onUnmounted6, ref as ref6 } from "vue";

// src/vue/components/EasingVisualization.ts
import { defineComponent as defineComponent7, h as h7, computed as computed4 } from "vue";
var EasingVisualization = defineComponent7({
  name: "DialKitEasingVisualization",
  props: {
    easing: {
      type: Object,
      required: true
    }
  },
  setup(props) {
    const size = 200;
    const pad = 10;
    const inner = size - pad * 2;
    const unit = inner / 2;
    const curve = computed4(() => {
      const [x1, y1, x2, y2] = props.easing.ease;
      const toSvg = (nx, ny) => ({
        x: pad + (nx + 0.5) * unit,
        y: pad + (1.5 - ny) * unit
      });
      const start = toSvg(0, 0);
      const end = toSvg(1, 1);
      const p1 = toSvg(x1, y1);
      const p2 = toSvg(x2, y2);
      return `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`;
    });
    return () => h7("svg", {
      viewBox: `0 0 ${size} ${size}`,
      preserveAspectRatio: "xMidYMid slice",
      class: "dialkit-spring-viz dialkit-easing-viz"
    }, [
      h7("line", {
        x1: pad + (0 + 0.5) * unit,
        y1: pad + (1.5 - 0) * unit,
        x2: pad + (1 + 0.5) * unit,
        y2: pad + (1.5 - 1) * unit,
        stroke: "rgba(255, 255, 255, 0.15)",
        "stroke-width": 1,
        "stroke-dasharray": "4,4"
      }),
      h7("path", {
        d: curve.value,
        fill: "none",
        stroke: "rgba(255, 255, 255, 0.6)",
        "stroke-width": 2,
        "stroke-linecap": "round"
      })
    ]);
  }
});

// src/vue/components/TransitionControl.ts
function formatEase(ease) {
  return ease.map((value) => Number(value.toFixed(2))).join(", ");
}
function parseEase(value) {
  const parts = value.split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
    return parts;
  }
  return null;
}
var EaseTextInput = defineComponent8({
  name: "DialKitEaseTextInput",
  props: {
    ease: {
      type: Array,
      required: true
    },
    onChange: {
      type: Function,
      required: true
    }
  },
  setup(props) {
    const editing = ref6(false);
    const draft = ref6("");
    const handleFocus = () => {
      draft.value = formatEase(props.ease);
      editing.value = true;
    };
    const handleBlur = () => {
      const parsed = parseEase(draft.value);
      if (parsed) props.onChange(parsed);
      editing.value = false;
    };
    const handleKeydown = (event) => {
      if (event.key === "Enter") {
        event.target.blur();
      }
    };
    return () => h8("div", { class: "dialkit-labeled-control" }, [
      h8("span", { class: "dialkit-labeled-control-label" }, "Ease"),
      h8("input", {
        type: "text",
        class: "dialkit-text-input",
        value: editing.value ? draft.value : formatEase(props.ease),
        spellcheck: false,
        onInput: (event) => {
          draft.value = event.target.value;
        },
        onFocus: handleFocus,
        onBlur: handleBlur,
        onKeydown: handleKeydown
      })
    ]);
  }
});
var TransitionControl = defineComponent8({
  name: "DialKitTransitionControl",
  props: {
    panelId: { type: String, required: true },
    path: { type: String, required: true },
    label: { type: String, required: true },
    value: {
      type: Object,
      required: true
    }
  },
  emits: ["change"],
  setup(props, { emit }) {
    const mode = ref6(DialStore.getTransitionMode(props.panelId, props.path));
    let unsub;
    onMounted6(() => {
      unsub = DialStore.subscribe(props.panelId, () => {
        mode.value = DialStore.getTransitionMode(props.panelId, props.path);
      });
    });
    onUnmounted6(() => unsub?.());
    const cache = {
      easing: props.value.type === "easing" ? { ...props.value } : { type: "easing", duration: 0.3, ease: [1, -0.4, 0.5, 1] },
      simple: props.value.type === "spring" && props.value.visualDuration !== void 0 ? { ...props.value } : { type: "spring", visualDuration: 0.3, bounce: 0.2 },
      advanced: props.value.type === "spring" && props.value.stiffness !== void 0 ? { ...props.value } : { type: "spring", stiffness: 200, damping: 25, mass: 1 }
    };
    const spring = () => {
      if (props.value.type === "spring") {
        if (mode.value === "simple") cache.simple = props.value;
        else if (mode.value === "advanced") cache.advanced = props.value;
        return props.value;
      }
      return cache.simple;
    };
    const easing = () => {
      if (props.value.type === "easing") {
        cache.easing = props.value;
        return props.value;
      }
      return cache.easing;
    };
    const handleModeChange = (nextMode) => {
      DialStore.updateTransitionMode(props.panelId, props.path, nextMode);
      if (nextMode === "easing") {
        emit("change", cache.easing);
      } else if (nextMode === "simple") {
        emit("change", cache.simple);
      } else {
        emit("change", cache.advanced);
      }
    };
    const updateEase = (index, value) => {
      const current = easing();
      const next = [...current.ease];
      next[index] = value;
      emit("change", { ...current, ease: next });
    };
    const handleSpringUpdate = (key, value) => {
      const current = spring();
      if (mode.value === "simple") {
        const { stiffness, damping, mass, ...rest } = current;
        emit("change", { ...rest, [key]: value });
      } else {
        const { visualDuration, bounce, ...rest } = current;
        emit("change", { ...rest, [key]: value });
      }
    };
    return () => {
      const isEasing = mode.value === "easing";
      const isSimpleSpring = mode.value === "simple";
      const currentSpring = spring();
      const currentEasing = easing();
      return h8(Folder, { title: props.label, defaultOpen: true }, {
        default: () => [
          h8("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, [
            isEasing ? h8(EasingVisualization, { easing: currentEasing }) : h8(SpringVisualization, { spring: currentSpring, isSimpleMode: isSimpleSpring }),
            h8("div", { class: "dialkit-labeled-control" }, [
              h8("span", { class: "dialkit-labeled-control-label" }, "Type"),
              h8(SegmentedControl, {
                options: [
                  { value: "easing", label: "Easing" },
                  { value: "simple", label: "Time" },
                  { value: "advanced", label: "Physics" }
                ],
                value: mode.value,
                onChange: handleModeChange
              })
            ]),
            ...isEasing ? [
              h8(Slider, { label: "x1", value: currentEasing.ease[0], min: 0, max: 1, step: 0.01, onChange: (next) => updateEase(0, next) }),
              h8(Slider, { label: "y1", value: currentEasing.ease[1], min: -1, max: 2, step: 0.01, onChange: (next) => updateEase(1, next) }),
              h8(Slider, { label: "x2", value: currentEasing.ease[2], min: 0, max: 1, step: 0.01, onChange: (next) => updateEase(2, next) }),
              h8(Slider, { label: "y2", value: currentEasing.ease[3], min: -1, max: 2, step: 0.01, onChange: (next) => updateEase(3, next) }),
              h8(Slider, {
                label: "Duration",
                value: currentEasing.duration,
                min: 0.1,
                max: 2,
                step: 0.05,
                unit: "s",
                onChange: (next) => emit("change", { ...currentEasing, duration: next })
              }),
              h8(EaseTextInput, {
                ease: currentEasing.ease,
                onChange: (next) => emit("change", { ...currentEasing, ease: next })
              })
            ] : isSimpleSpring ? [
              h8(Slider, {
                label: "Duration",
                value: currentSpring.visualDuration ?? 0.3,
                min: 0.1,
                max: 1,
                step: 0.05,
                unit: "s",
                onChange: (next) => handleSpringUpdate("visualDuration", next)
              }),
              h8(Slider, {
                label: "Bounce",
                value: currentSpring.bounce ?? 0.2,
                min: 0,
                max: 1,
                step: 0.05,
                onChange: (next) => handleSpringUpdate("bounce", next)
              })
            ] : [
              h8(Slider, {
                label: "Stiffness",
                value: currentSpring.stiffness ?? 400,
                min: 1,
                max: 1e3,
                step: 10,
                onChange: (next) => handleSpringUpdate("stiffness", next)
              }),
              h8(Slider, {
                label: "Damping",
                value: currentSpring.damping ?? 17,
                min: 1,
                max: 100,
                step: 1,
                onChange: (next) => handleSpringUpdate("damping", next)
              }),
              h8(Slider, {
                label: "Mass",
                value: currentSpring.mass ?? 1,
                min: 0.1,
                max: 10,
                step: 0.1,
                onChange: (next) => handleSpringUpdate("mass", next)
              })
            ]
          ])
        ]
      });
    };
  }
});

// src/vue/components/TextControl.ts
import { defineComponent as defineComponent9, h as h9, ref as ref7 } from "vue";
var textControlInstance = 0;
var TextControl = defineComponent9({
  name: "DialKitTextControl",
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    placeholder: { type: String, required: false }
  },
  emits: ["change"],
  setup(props, { emit }) {
    const inputId = ref7(`dialkit-text-${++textControlInstance}`);
    return () => h9("div", { class: "dialkit-text-control" }, [
      h9("label", { class: "dialkit-text-label", for: inputId.value }, props.label),
      h9("input", {
        id: inputId.value,
        type: "text",
        class: "dialkit-text-input",
        value: props.value,
        placeholder: props.placeholder,
        onInput: (event) => emit("change", event.target.value)
      })
    ]);
  }
});

// src/vue/components/SelectControl.ts
import { Teleport, defineComponent as defineComponent10, h as h10, onMounted as onMounted7, ref as ref8, watch as watch4 } from "vue";
import { AnimatePresence as AnimatePresence2, motion as motion2 } from "motion-v";

// src/dropdown-position.ts
function getDropdownPosition(trigger, portalRoot, options = {}) {
  const { dropdownHeight = 0, gap = 4, allowAbove = true } = options;
  const triggerRect = trigger.getBoundingClientRect();
  const rootRect = portalRoot.getBoundingClientRect();
  const spaceBelow = window.innerHeight - triggerRect.bottom - gap;
  const above = allowAbove && spaceBelow < dropdownHeight && triggerRect.top > spaceBelow;
  return {
    top: above ? triggerRect.top - rootRect.top - dropdownHeight - gap : triggerRect.bottom - rootRect.top + gap,
    left: triggerRect.left - rootRect.left,
    width: triggerRect.width,
    above
  };
}
function getDialKitPortalRoot(trigger) {
  return trigger?.closest(".dialkit-root") ?? null;
}

// src/vue/components/SelectControl.ts
function toTitleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
function normalizeOptions(options) {
  return options.map(
    (option) => typeof option === "string" ? { value: option, label: toTitleCase(option) } : option
  );
}
var SelectControl = defineComponent10({
  name: "DialKitSelectControl",
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    options: {
      type: Array,
      required: true
    }
  },
  emits: ["change"],
  setup(props, { emit }) {
    const isOpen = ref8(false);
    const pos = ref8(null);
    const portalTarget = ref8(null);
    const triggerRef = ref8(null);
    const dropdownRef = ref8(null);
    const normalizedOptions = () => normalizeOptions(props.options);
    const selectedLabel = () => normalizedOptions().find((option) => option.value === props.value)?.label ?? props.value;
    const updatePos = () => {
      if (!triggerRef.value || !portalTarget.value) return;
      const dropdownHeight = 8 + normalizedOptions().length * 36;
      pos.value = getDropdownPosition(triggerRef.value, portalTarget.value, { dropdownHeight });
    };
    const openDropdown = () => {
      updatePos();
      isOpen.value = true;
    };
    const closeDropdown = () => {
      isOpen.value = false;
    };
    const setDropdownRef = (node) => {
      if (node instanceof HTMLElement) {
        dropdownRef.value = node;
        return;
      }
      if (node && typeof node === "object" && "$el" in node) {
        const el = node.$el;
        dropdownRef.value = el instanceof HTMLElement ? el : null;
        return;
      }
      dropdownRef.value = null;
    };
    const toggleDropdown = () => {
      if (isOpen.value) closeDropdown();
      else openDropdown();
    };
    watch4(isOpen, (open, _, onCleanup) => {
      if (!open) return;
      const handleViewportChange = () => updatePos();
      const handleDocumentClick = (event) => {
        const target = event.target;
        if (triggerRef.value?.contains(target) || dropdownRef.value?.contains(target)) return;
        closeDropdown();
      };
      updatePos();
      document.addEventListener("mousedown", handleDocumentClick);
      window.addEventListener("resize", handleViewportChange);
      window.addEventListener("scroll", handleViewportChange, true);
      onCleanup(() => {
        document.removeEventListener("mousedown", handleDocumentClick);
        window.removeEventListener("resize", handleViewportChange);
        window.removeEventListener("scroll", handleViewportChange, true);
      });
    });
    onMounted7(() => {
      portalTarget.value = getDialKitPortalRoot(triggerRef.value) ?? document.body;
    });
    return () => h10("div", { class: "dialkit-select-row" }, [
      h10("button", {
        ref: triggerRef,
        class: "dialkit-select-trigger",
        "data-open": String(isOpen.value),
        onClick: toggleDropdown
      }, [
        h10("span", { class: "dialkit-select-label" }, props.label),
        h10("div", { class: "dialkit-select-right" }, [
          h10("span", { class: "dialkit-select-value" }, selectedLabel()),
          h10(motion2.svg, {
            class: "dialkit-select-chevron",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2.5",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            animate: { rotate: isOpen.value ? 180 : 0 },
            transition: { type: "spring", visualDuration: 0.2, bounce: 0.15 }
          }, [h10("path", { d: "M6 9.5L12 15.5L18 9.5" })])
        ])
      ]),
      portalTarget.value ? h10(Teleport, { to: portalTarget.value }, [
        h10(AnimatePresence2, null, {
          default: () => isOpen.value && pos.value ? [h10(motion2.div, {
            key: "dialkit-select-dropdown",
            ref: setDropdownRef,
            class: "dialkit-select-dropdown",
            initial: { opacity: 0, y: pos.value.above ? 8 : -8, scale: 0.95 },
            animate: { opacity: 1, y: 0, scale: 1 },
            exit: { opacity: 0, y: pos.value.above ? 8 : -8, scale: 0.95 },
            transition: { type: "spring", visualDuration: 0.15, bounce: 0 },
            style: {
              position: "absolute",
              left: `${pos.value.left}px`,
              top: `${pos.value.top}px`,
              width: `${pos.value.width}px`,
              transformOrigin: pos.value.above ? "bottom" : "top"
            }
          }, normalizedOptions().map((option) => h10("button", {
            key: option.value,
            class: "dialkit-select-option",
            "data-selected": String(option.value === props.value),
            onClick: () => {
              emit("change", option.value);
              closeDropdown();
            }
          }, option.label)))] : []
        })
      ]) : null
    ]);
  }
});

// src/vue/components/ColorControl.ts
import { defineComponent as defineComponent11, h as h11, ref as ref9, watch as watch5 } from "vue";
var HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
function expandShorthandHex(hex) {
  if (hex.length !== 4) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}
var colorControlInstance = 0;
var ColorControl = defineComponent11({
  name: "DialKitColorControl",
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true }
  },
  emits: ["change"],
  setup(props, { emit }) {
    const textInputId = ref9(`dialkit-color-${++colorControlInstance}`);
    const isEditing = ref9(false);
    const editValue = ref9(props.value);
    const colorInputRef = ref9(null);
    watch5(() => props.value, (value) => {
      if (!isEditing.value) editValue.value = value;
    });
    const submit = () => {
      isEditing.value = false;
      if (HEX_COLOR_REGEX.test(editValue.value)) {
        emit("change", editValue.value);
      } else {
        editValue.value = props.value;
      }
    };
    return () => h11("div", { class: "dialkit-color-control" }, [
      h11("label", { class: "dialkit-color-label", for: textInputId.value }, props.label),
      h11("div", { class: "dialkit-color-inputs" }, [
        isEditing.value ? h11("input", {
          id: textInputId.value,
          type: "text",
          class: "dialkit-color-hex-input",
          value: editValue.value,
          autofocus: true,
          onInput: (event) => {
            editValue.value = event.target.value;
          },
          onBlur: submit,
          onKeydown: (event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") {
              isEditing.value = false;
              editValue.value = props.value;
            }
          }
        }) : h11("span", { class: "dialkit-color-hex", onClick: () => {
          isEditing.value = true;
        } }, (props.value ?? "").toUpperCase()),
        h11("button", {
          class: "dialkit-color-swatch",
          style: { backgroundColor: props.value },
          title: "Pick color",
          "aria-label": `Pick color for ${props.label}`,
          onClick: () => colorInputRef.value?.click()
        }),
        h11("input", {
          ref: colorInputRef,
          type: "color",
          class: "dialkit-color-picker-native",
          "aria-label": `${props.label} color picker`,
          value: props.value.length === 4 ? expandShorthandHex(props.value) : props.value.slice(0, 7),
          onInput: (event) => emit("change", event.target.value)
        })
      ])
    ]);
  }
});

// src/vue/components/PresetManager.ts
import { Teleport as Teleport2, defineComponent as defineComponent12, h as h12, ref as ref10, watch as watch6 } from "vue";
import { AnimatePresence as AnimatePresence3, motion as motion3 } from "motion-v";
var PresetManager = defineComponent12({
  name: "DialKitPresetManager",
  props: {
    panelId: { type: String, required: true },
    presets: {
      type: Array,
      required: true
    },
    activePresetId: {
      type: String,
      required: false,
      default: null
    }
  },
  setup(props) {
    const isOpen = ref10(false);
    const pos = ref10({ top: 0, left: 0, width: 0 });
    const triggerRef = ref10(null);
    const dropdownRef = ref10(null);
    const hasPresets = () => props.presets.length > 0;
    const activePreset = () => props.presets.find((preset) => preset.id === props.activePresetId);
    const open = () => {
      if (!hasPresets()) return;
      const rect = triggerRef.value?.getBoundingClientRect();
      if (rect) {
        pos.value = { top: rect.bottom + 4, left: rect.left, width: rect.width };
      }
      isOpen.value = true;
    };
    const close = () => {
      isOpen.value = false;
    };
    const setDropdownRef = (node) => {
      if (node instanceof HTMLElement) {
        dropdownRef.value = node;
        return;
      }
      if (node && typeof node === "object" && "$el" in node) {
        const el = node.$el;
        dropdownRef.value = el instanceof HTMLElement ? el : null;
        return;
      }
      dropdownRef.value = null;
    };
    const toggle = () => {
      if (isOpen.value) close();
      else open();
    };
    watch6(isOpen, (open2, _, onCleanup) => {
      if (!open2) return;
      const handler = (event) => {
        const target = event.target;
        if (triggerRef.value?.contains(target) || dropdownRef.value?.contains(target)) return;
        close();
      };
      document.addEventListener("mousedown", handler);
      onCleanup(() => {
        document.removeEventListener("mousedown", handler);
      });
    });
    const handleSelect = (presetId) => {
      if (presetId) {
        DialStore.loadPreset(props.panelId, presetId);
      } else {
        DialStore.clearActivePreset(props.panelId);
      }
      close();
    };
    const handleDelete = (event, presetId) => {
      event.stopPropagation();
      DialStore.deletePreset(props.panelId, presetId);
    };
    return () => h12("div", { class: "dialkit-preset-manager" }, [
      h12("button", {
        ref: triggerRef,
        class: "dialkit-preset-trigger",
        onClick: toggle,
        "data-open": String(isOpen.value),
        "data-has-preset": String(!!activePreset()),
        "data-disabled": String(!hasPresets())
      }, [
        h12("span", { class: "dialkit-preset-label" }, activePreset()?.name ?? "Version 1"),
        h12(motion3.svg, {
          class: "dialkit-select-chevron",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2.5",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          animate: { rotate: isOpen.value ? 180 : 0, opacity: hasPresets() ? 0.6 : 0.25 },
          transition: { type: "spring", visualDuration: 0.2, bounce: 0.15 }
        }, [h12("path", { d: ICON_CHEVRON })])
      ]),
      h12(Teleport2, { to: "body" }, [
        h12(AnimatePresence3, null, {
          default: () => isOpen.value ? [h12(motion3.div, {
            key: "dialkit-preset-dropdown",
            ref: setDropdownRef,
            class: "dialkit-root dialkit-preset-dropdown",
            style: {
              position: "fixed",
              top: `${pos.value.top}px`,
              left: `${pos.value.left}px`,
              minWidth: `${pos.value.width}px`
            },
            initial: { opacity: 0, y: 4, scale: 0.97 },
            animate: { opacity: 1, y: 0, scale: 1 },
            exit: { opacity: 0, y: 4, scale: 0.97, pointerEvents: "none" },
            transition: { type: "spring", visualDuration: 0.15, bounce: 0 }
          }, [
            h12("div", {
              class: "dialkit-preset-item",
              "data-active": String(!props.activePresetId),
              onClick: () => handleSelect(null)
            }, [h12("span", { class: "dialkit-preset-name" }, "Version 1")]),
            ...props.presets.map((preset) => h12("div", {
              key: preset.id,
              class: "dialkit-preset-item",
              "data-active": String(preset.id === props.activePresetId),
              onClick: () => handleSelect(preset.id)
            }, [
              h12("span", { class: "dialkit-preset-name" }, preset.name),
              h12("button", {
                class: "dialkit-preset-delete",
                onClick: (event) => handleDelete(event, preset.id),
                title: "Delete preset"
              }, [
                h12("svg", {
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "2",
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round"
                }, ICON_TRASH.map((d) => h12("path", { d })))
              ])
            ]))
          ])] : []
        })
      ])
    ]);
  }
});

// src/vue/components/ShortcutListener.ts
import { defineComponent as defineComponent13, inject, onMounted as onMounted8, onUnmounted as onUnmounted7, provide, ref as ref11 } from "vue";
var ShortcutKey = /* @__PURE__ */ Symbol("DialKitShortcut");
function useShortcutContext() {
  return inject(ShortcutKey, {
    activePanelId: ref11(null),
    activePath: ref11(null)
  });
}
var ShortcutListener = defineComponent13({
  name: "DialKitShortcutListener",
  setup(_, { slots }) {
    const activePanelId = ref11(null);
    const activePath = ref11(null);
    const activeKeys = /* @__PURE__ */ new Set();
    let isDragging = false;
    let lastMouseX = null;
    let dragAccumulator = 0;
    provide(ShortcutKey, { activePanelId, activePath });
    const resolveActiveTarget = (interaction) => {
      for (const key of activeKeys) {
        const panels = DialStore.getPanels();
        for (const panel of panels) {
          for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
            if (!shortcut.key) continue;
            if (shortcut.key.toLowerCase() !== key) continue;
            if ((shortcut.interaction ?? "scroll") !== interaction) continue;
            const control = DialStore.getPanel(panel.id)?.controls ? findControl(panel.controls, path) : null;
            if (control && control.type === "slider") {
              return { panelId: panel.id, path, control, shortcut };
            }
          }
        }
      }
      return null;
    };
    const handleKeyDown = (e) => {
      if (isInputFocused()) return;
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "arrowright" || key === "arrowup" || key === "arrowdown") {
        if (activeKeys.size > 0) {
          const target2 = resolveActiveTarget("scroll") || resolveActiveTarget("drag") || resolveActiveTarget("move");
          if (target2 && target2.control.type === "slider") {
            e.preventDefault();
            const direction = key === "arrowright" || key === "arrowup" ? 1 : -1;
            const effectiveStep = getEffectiveStep(target2.control, target2.shortcut);
            applySliderDelta(target2.panelId, target2.path, target2.control, effectiveStep, direction);
            return;
          }
        }
      }
      const wasAlreadyHeld = activeKeys.has(key);
      activeKeys.add(key);
      const modifier = getActiveModifier(e);
      const target = DialStore.resolveShortcutTarget(key, modifier);
      if (target) {
        activePanelId.value = target.panelId;
        activePath.value = target.path;
        if (!wasAlreadyHeld && target.control.type === "toggle") {
          const currentValue = DialStore.getValue(target.panelId, target.path);
          DialStore.updateValue(target.panelId, target.path, !currentValue);
        }
      }
      if (!wasAlreadyHeld) {
        lastMouseX = null;
        dragAccumulator = 0;
      }
    };
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      activeKeys.delete(key);
      isDragging = false;
      lastMouseX = null;
      dragAccumulator = 0;
      if (activeKeys.size === 0) {
        activePanelId.value = null;
        activePath.value = null;
      } else {
        let found = false;
        for (const remainingKey of activeKeys) {
          const modifier = getActiveModifier(e);
          const target = DialStore.resolveShortcutTarget(remainingKey, modifier);
          if (target) {
            activePanelId.value = target.panelId;
            activePath.value = target.path;
            found = true;
            break;
          }
        }
        if (!found) {
          activePanelId.value = null;
          activePath.value = null;
        }
      }
    };
    const handleWheel = (e) => {
      if (isInputFocused()) return;
      const modifier = getActiveModifier(e);
      if (activeKeys.size > 0) {
        for (const key of activeKeys) {
          const target = DialStore.resolveShortcutTarget(key, modifier);
          if (!target) continue;
          const { panelId, path, control } = target;
          const interaction = control.shortcut?.interaction ?? "scroll";
          if (interaction !== "scroll" || control.type !== "slider") continue;
          e.preventDefault();
          const effectiveStep = getEffectiveStep(control, control.shortcut);
          const direction = e.deltaY > 0 ? -1 : 1;
          applySliderDelta(panelId, path, control, effectiveStep, direction);
          return;
        }
      }
      const scrollOnlyTargets = DialStore.resolveScrollOnlyTargets();
      for (const { panelId, path, control, shortcut } of scrollOnlyTargets) {
        if (control.type !== "slider") continue;
        e.preventDefault();
        const effectiveStep = getEffectiveStep(control, shortcut);
        const direction = e.deltaY > 0 ? -1 : 1;
        applySliderDelta(panelId, path, control, effectiveStep, direction);
        return;
      }
    };
    const handleMouseDown = (e) => {
      if (isInputFocused()) return;
      if (activeKeys.size === 0) return;
      const target = resolveActiveTarget("drag");
      if (target) {
        isDragging = true;
        lastMouseX = e.clientX;
        dragAccumulator = 0;
        e.preventDefault();
      }
    };
    const handleMouseUp = () => {
      isDragging = false;
      lastMouseX = null;
      dragAccumulator = 0;
    };
    const handleMouseMove = (e) => {
      if (isInputFocused()) return;
      if (activeKeys.size === 0) return;
      if (isDragging) {
        const target = resolveActiveTarget("drag");
        if (target && lastMouseX !== null) {
          const deltaX = e.clientX - lastMouseX;
          lastMouseX = e.clientX;
          dragAccumulator += deltaX;
          const effectiveStep = getEffectiveStep(target.control, target.shortcut);
          const steps = Math.trunc(dragAccumulator / DRAG_SENSITIVITY);
          if (steps !== 0) {
            dragAccumulator -= steps * DRAG_SENSITIVITY;
            applySliderDelta(target.panelId, target.path, target.control, effectiveStep, steps);
          }
        }
        return;
      }
      const moveTarget = resolveActiveTarget("move");
      if (moveTarget) {
        if (lastMouseX === null) {
          lastMouseX = e.clientX;
          return;
        }
        const deltaX = e.clientX - lastMouseX;
        lastMouseX = e.clientX;
        dragAccumulator += deltaX;
        const effectiveStep = getEffectiveStep(moveTarget.control, moveTarget.shortcut);
        const steps = Math.trunc(dragAccumulator / DRAG_SENSITIVITY);
        if (steps !== 0) {
          dragAccumulator -= steps * DRAG_SENSITIVITY;
          applySliderDelta(moveTarget.panelId, moveTarget.path, moveTarget.control, effectiveStep, steps);
        }
      }
    };
    const handleWindowBlur = () => {
      activeKeys.clear();
      isDragging = false;
      lastMouseX = null;
      dragAccumulator = 0;
      activePanelId.value = null;
      activePath.value = null;
    };
    onMounted8(() => {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("wheel", handleWheel, { passive: false });
      window.addEventListener("mousedown", handleMouseDown);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("blur", handleWindowBlur);
    });
    onUnmounted7(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("blur", handleWindowBlur);
    });
    return () => slots.default?.();
  }
});

// src/vue/components/Panel.ts
var Panel = defineComponent14({
  name: "DialKitPanel",
  props: {
    panel: {
      type: Object,
      required: true
    },
    defaultOpen: {
      type: Boolean,
      default: true
    },
    inline: {
      type: Boolean,
      default: false
    },
    variant: {
      type: String,
      default: "root"
    }
  },
  emits: ["openChange"],
  setup(props, { emit }) {
    const shortcutCtx = useShortcutContext();
    const values = ref12(DialStore.getValues(props.panel.id));
    const presets = ref12(DialStore.getPresets(props.panel.id));
    const activePresetId = ref12(DialStore.getActivePresetId(props.panel.id));
    const copied = ref12(false);
    const hasShortcuts = () => Object.keys(DialStore.getPanel(props.panel.id)?.shortcuts ?? {}).length > 0;
    let unsubscribe;
    let copiedTimeout = null;
    onMounted9(() => {
      unsubscribe = DialStore.subscribe(props.panel.id, () => {
        values.value = DialStore.getValues(props.panel.id);
        presets.value = DialStore.getPresets(props.panel.id);
        activePresetId.value = DialStore.getActivePresetId(props.panel.id);
      });
    });
    onUnmounted8(() => {
      unsubscribe?.();
      if (copiedTimeout) {
        window.clearTimeout(copiedTimeout);
      }
    });
    const handleAddPreset = () => {
      const nextNum = presets.value.length + 2;
      DialStore.savePreset(props.panel.id, `Version ${nextNum}`);
    };
    const handleCopy = () => {
      const json = JSON.stringify(values.value, null, 2);
      const instruction = `Update the useDialKit configuration for "${props.panel.name}" with these values:

\`\`\`json
${json}
\`\`\`

Apply these values as the new defaults in the useDialKit call.`;
      try {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(instruction).catch(() => void 0);
        }
      } catch {
      }
      copied.value = true;
      if (copiedTimeout) {
        window.clearTimeout(copiedTimeout);
      }
      copiedTimeout = window.setTimeout(() => {
        copied.value = false;
      }, 1500);
    };
    const handleOpenChange = (open) => {
      emit("openChange", open);
    };
    const renderControl = (control) => {
      const value = values.value[control.path];
      switch (control.type) {
        case "slider":
          return h14(Slider, {
            key: control.path,
            label: control.label,
            value,
            min: control.min,
            max: control.max,
            step: control.step,
            shortcut: control.shortcut,
            shortcutActive: shortcutCtx.activePanelId.value === props.panel.id && shortcutCtx.activePath.value === control.path,
            onChange: (next) => DialStore.updateValue(props.panel.id, control.path, next)
          });
        case "toggle":
          return h14(Toggle, {
            key: control.path,
            label: control.label,
            checked: value,
            shortcut: control.shortcut,
            shortcutActive: shortcutCtx.activePanelId.value === props.panel.id && shortcutCtx.activePath.value === control.path,
            onChange: (next) => DialStore.updateValue(props.panel.id, control.path, next)
          });
        case "spring":
          return h14(SpringControl, {
            key: control.path,
            panelId: props.panel.id,
            path: control.path,
            label: control.label,
            spring: value,
            onChange: (next) => DialStore.updateValue(props.panel.id, control.path, next)
          });
        case "transition":
          return h14(TransitionControl, {
            key: control.path,
            panelId: props.panel.id,
            path: control.path,
            label: control.label,
            value,
            onChange: (next) => DialStore.updateValue(props.panel.id, control.path, next)
          });
        case "folder":
          return h14(Folder, {
            key: control.path,
            title: control.label,
            defaultOpen: control.defaultOpen ?? true
          }, {
            default: () => (control.children ?? []).map(renderControl)
          });
        case "text":
          return h14(TextControl, {
            key: control.path,
            label: control.label,
            value,
            placeholder: control.placeholder,
            onChange: (next) => DialStore.updateValue(props.panel.id, control.path, next)
          });
        case "select":
          return h14(SelectControl, {
            key: control.path,
            label: control.label,
            value,
            options: control.options ?? [],
            onChange: (next) => DialStore.updateValue(props.panel.id, control.path, next)
          });
        case "color":
          return h14(ColorControl, {
            key: control.path,
            label: control.label,
            value,
            onChange: (next) => DialStore.updateValue(props.panel.id, control.path, next)
          });
        case "action":
          return h14("button", {
            key: control.path,
            class: "dialkit-button",
            onClick: () => DialStore.triggerAction(props.panel.id, control.path)
          }, control.label);
        default:
          return null;
      }
    };
    return () => {
      const toolbarNode = h14(Fragment, null, [
        h14(motion4.button, {
          class: "dialkit-toolbar-add",
          onClick: handleAddPreset,
          title: "Add preset",
          whilePress: { scale: 0.9 },
          transition: { type: "spring", visualDuration: 0.15, bounce: 0.3 }
        }, [
          h14("svg", {
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2.5",
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
          }, ICON_ADD_PRESET.map((d) => h14("path", { d })))
        ]),
        h14(PresetManager, {
          panelId: props.panel.id,
          presets: presets.value,
          activePresetId: activePresetId.value
        }),
        h14(motion4.button, {
          class: "dialkit-toolbar-copy",
          onClick: handleCopy,
          title: "Copy parameters",
          whilePress: { scale: 0.95 },
          transition: { type: "spring", visualDuration: 0.15, bounce: 0.3 }
        }, [
          h14("span", { class: "dialkit-toolbar-copy-icon-wrap" }, [
            h14("span", {
              class: "dialkit-toolbar-copy-icon",
              style: { opacity: copied.value ? 0 : 1, transition: "opacity 120ms ease" }
            }, [
              h14("svg", {
                viewBox: "0 0 24 24",
                fill: "none",
                width: 16,
                height: 16
              }, [
                h14("path", {
                  d: ICON_CLIPBOARD.board,
                  stroke: "currentColor",
                  "stroke-width": 2,
                  "stroke-linejoin": "round"
                }),
                h14("path", {
                  d: ICON_CLIPBOARD.sparkle,
                  fill: "currentColor"
                }),
                h14("path", {
                  d: ICON_CLIPBOARD.body,
                  stroke: "currentColor",
                  "stroke-width": 2,
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round"
                })
              ])
            ]),
            h14(AnimatePresence4, { initial: false, mode: "popLayout" }, {
              default: () => copied.value ? [h14(motion4.span, {
                key: "check",
                class: "dialkit-toolbar-copy-icon",
                initial: { scale: 0.5, opacity: 0 },
                animate: { scale: 1, opacity: 1 },
                exit: { scale: 0.5, opacity: 0 },
                transition: { type: "spring", visualDuration: 0.3, bounce: 0.2 }
              }, [
                h14("svg", {
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": 2,
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round",
                  width: 16,
                  height: 16
                }, [h14("path", { d: ICON_CHECK })])
              ])] : []
            })
          ]),
          "Copy"
        ])
      ]);
      if (props.variant === "section") {
        return h14(Folder, {
          title: props.panel.name,
          defaultOpen: props.defaultOpen,
          onOpenChange: handleOpenChange
        }, {
          default: () => [
            h14("div", {
              class: "dialkit-panel-section-toolbar",
              onClick: (event) => event.stopPropagation()
            }, [toolbarNode]),
            ...props.panel.controls.map(renderControl)
          ]
        });
      }
      return h14("div", { class: "dialkit-panel-wrapper" }, [
        h14(Folder, {
          title: props.panel.name,
          defaultOpen: props.defaultOpen,
          isRoot: true,
          inline: props.inline,
          toolbar: () => toolbarNode,
          onOpenChange: handleOpenChange
        }, {
          default: () => props.panel.controls.map(renderControl)
        })
      ]);
    };
  }
});

// src/panel-drag.ts
var PANEL_DRAG_THRESHOLD = 8;
var COLLAPSED_PANEL_SIZE = 42;
var DRAG_EXCLUSION_SELECTOR = [
  ".dialkit-panel-icon",
  ".dialkit-panel-toolbar",
  "button",
  "input",
  "select",
  "textarea",
  "a",
  '[role="button"]',
  '[contenteditable="true"]'
].join(",");
function getPanelDragHandle(target, panel) {
  if (!(target instanceof Element) || !panel) return null;
  const inner = target.closest(".dialkit-panel-inner");
  if (!inner || !panel.contains(inner)) return null;
  if (inner.getAttribute("data-collapsed") === "true") {
    return inner;
  }
  const header = target.closest(".dialkit-panel-header");
  if (!header || !inner.contains(header)) return null;
  if (target.closest(DRAG_EXCLUSION_SELECTOR)) return null;
  return header;
}
function getPanelDragStart(pointerX, pointerY, panel) {
  const rect = panel.getBoundingClientRect();
  return {
    pointerX,
    pointerY,
    elX: rect.left,
    elY: rect.top
  };
}
function getPanelDragOffset(start, pointerX, pointerY) {
  return {
    x: start.elX + pointerX - start.pointerX,
    y: start.elY + pointerY - start.pointerY
  };
}
function hasPanelDragMoved(start, pointerX, pointerY) {
  const dx = pointerX - start.pointerX;
  const dy = pointerY - start.pointerY;
  return Math.hypot(dx, dy) >= PANEL_DRAG_THRESHOLD;
}
function getPanelOriginX(position, offset, viewportWidth = typeof window !== "undefined" ? window.innerWidth : void 0) {
  if (offset && viewportWidth) {
    return offset.x + COLLAPSED_PANEL_SIZE / 2 < viewportWidth / 2 ? "left" : "right";
  }
  return position.endsWith("left") ? "left" : "right";
}
function blockPanelDragClick(handle) {
  const blocker = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };
  handle.addEventListener("click", blocker, { capture: true, once: true });
  window.setTimeout(() => {
    handle.removeEventListener("click", blocker, true);
  }, 0);
}

// src/vue/components/DialRoot.ts
var isDevDefault = typeof process !== "undefined" && process?.env?.NODE_ENV ? process.env.NODE_ENV !== "production" : typeof import.meta !== "undefined" && import.meta.env?.MODE ? import.meta.env.MODE !== "production" : true;
var DialRoot = defineComponent15({
  name: "DialKitDialRoot",
  props: {
    position: {
      type: String,
      default: "top-right"
    },
    defaultOpen: {
      type: Boolean,
      default: true
    },
    mode: {
      type: String,
      default: "popover"
    },
    theme: {
      type: String,
      default: "system"
    },
    productionEnabled: {
      type: Boolean,
      default: isDevDefault
    }
  },
  emits: ["openChange"],
  setup(props, { emit }) {
    const panels = ref13([]);
    const mounted = ref13(false);
    const panelRef = ref13(null);
    const dragOffset = ref13(null);
    const activePosition = ref13(props.position);
    let unsubscribe;
    let observer;
    let lastDragOffset = null;
    let dragging = false;
    let dragStart = null;
    let didDrag = false;
    let dragTarget = null;
    let panelOpenStates = /* @__PURE__ */ new Map();
    let rootOpen;
    const syncPanelOpenStates = () => {
      const fallbackOpen = props.mode === "inline" || props.defaultOpen;
      const nextStates = /* @__PURE__ */ new Map();
      for (const panel of panels.value) {
        nextStates.set(panel.id, panelOpenStates.get(panel.id) ?? fallbackOpen);
      }
      panelOpenStates = nextStates;
      rootOpen = Array.from(nextStates.values()).some(Boolean);
    };
    const connectObserver = () => {
      if (observer || props.mode === "inline" || !panelRef.value) return;
      observer = new MutationObserver(() => {
        const inners = panelRef.value?.querySelectorAll(".dialkit-panel-inner");
        if (!inners || inners.length === 0) return;
        const collapsed = Array.from(inners).every((el) => el.getAttribute("data-collapsed") === "true");
        const currentDragOffset = dragOffset.value;
        if (!collapsed) {
          if (currentDragOffset) {
            lastDragOffset = currentDragOffset;
            const bubbleCenterX = currentDragOffset.x + 21;
            activePosition.value = bubbleCenterX < window.innerWidth / 2 ? "top-left" : "top-right";
          } else {
            activePosition.value = props.position;
          }
          dragOffset.value = null;
        } else if (currentDragOffset) {
          lastDragOffset = currentDragOffset;
        } else if (lastDragOffset) {
          dragOffset.value = lastDragOffset;
        }
      });
      observer.observe(panelRef.value, { subtree: true, attributes: true, attributeFilter: ["data-collapsed"] });
    };
    const handlePointerDown = (event) => {
      const panel = panelRef.value;
      const handle = getPanelDragHandle(event.target, panel);
      if (!panel || !handle) return;
      dragTarget = handle;
      dragStart = getPanelDragStart(event.clientX, event.clientY, panel);
      didDrag = false;
      dragging = true;
      handle.setPointerCapture(event.pointerId);
    };
    const handlePointerMove = (event) => {
      if (!dragging || !dragStart) return;
      if (!didDrag && !hasPanelDragMoved(dragStart, event.clientX, event.clientY)) return;
      didDrag = true;
      dragOffset.value = getPanelDragOffset(dragStart, event.clientX, event.clientY);
    };
    const handlePointerUp = (event) => {
      if (!dragging) return;
      dragging = false;
      dragStart = null;
      const handle = dragTarget;
      if (handle?.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      if (didDrag) {
        event.stopPropagation();
        if (handle) {
          blockPanelDragClick(handle);
        }
      }
      dragTarget = null;
    };
    const handlePanelOpenChange = (panelId, open) => {
      panelOpenStates.set(panelId, open);
      const fallbackOpen = props.mode === "inline" || props.defaultOpen;
      const nextRootOpen = panels.value.some((panel) => panelOpenStates.get(panel.id) ?? fallbackOpen);
      if (rootOpen === nextRootOpen) return;
      rootOpen = nextRootOpen;
      emit("openChange", nextRootOpen);
    };
    const handleRootOpenChange = (open) => {
      if (rootOpen === open) return;
      rootOpen = open;
      emit("openChange", open);
    };
    const getDragStyle = () => dragOffset.value ? {
      top: `${dragOffset.value.y}px`,
      left: `${dragOffset.value.x}px`,
      right: "auto",
      bottom: "auto"
    } : void 0;
    const originX = computed5(() => props.mode === "inline" ? void 0 : getPanelOriginX(activePosition.value, dragOffset.value));
    onMounted10(() => {
      mounted.value = true;
      panels.value = DialStore.getPanels();
      syncPanelOpenStates();
      unsubscribe = DialStore.subscribeGlobal(() => {
        panels.value = DialStore.getPanels();
        syncPanelOpenStates();
      });
      nextTick3(connectObserver);
    });
    onUnmounted9(() => {
      unsubscribe?.();
      observer?.disconnect();
    });
    const renderContent = () => h15(ShortcutListener, null, {
      default: () => h15("div", { class: "dialkit-root", "data-mode": props.mode, "data-theme": props.theme }, [
        h15("div", {
          ref: (el) => {
            panelRef.value = el;
            connectObserver();
          },
          class: "dialkit-panel",
          "data-position": props.mode === "inline" ? void 0 : dragOffset.value ? void 0 : activePosition.value,
          "data-origin-x": originX.value,
          "data-mode": props.mode,
          "data-multiple": panels.value.length > 1 ? "true" : void 0,
          style: getDragStyle(),
          onPointerdown: props.mode === "inline" ? void 0 : handlePointerDown,
          onPointermove: props.mode === "inline" ? void 0 : handlePointerMove,
          onPointerup: props.mode === "inline" ? void 0 : handlePointerUp,
          onPointercancel: props.mode === "inline" ? void 0 : handlePointerUp
        }, panels.value.length > 1 ? [
          h15("div", { class: "dialkit-panel-wrapper" }, [
            h15(Folder, {
              title: "DialKit",
              defaultOpen: props.mode === "inline" || props.defaultOpen,
              isRoot: true,
              inline: props.mode === "inline",
              onOpenChange: handleRootOpenChange,
              panelHeightOffset: 2
            }, {
              default: () => panels.value.map((panel) => h15(Panel, {
                key: panel.id,
                panel,
                defaultOpen: true,
                variant: "section"
              }))
            })
          ])
        ] : panels.value.map((panel) => h15(Panel, {
          key: panel.id,
          panel,
          defaultOpen: props.mode === "inline" || props.defaultOpen,
          inline: props.mode === "inline",
          onOpenChange: (open) => handlePanelOpenChange(panel.id, open)
        })))
      ])
    });
    return () => {
      if (!props.productionEnabled || !mounted.value || typeof window === "undefined" || panels.value.length === 0) {
        return null;
      }
      if (props.mode === "inline") {
        return renderContent();
      }
      return h15(Teleport3, { to: "body" }, renderContent());
    };
  }
});

// src/vue/directives/dialkit.ts
var states = /* @__PURE__ */ new WeakMap();
function normalizeDirectiveValue(value) {
  if (!value) return {};
  if (value === "inline" || value === "popover") {
    return { mode: value };
  }
  return value;
}
function mountDialRoot(el, value) {
  if (typeof window === "undefined") return;
  const host = document.createElement("div");
  el.appendChild(host);
  const props = shallowRef2(normalizeDirectiveValue(value));
  const RootHost = defineComponent16({
    name: "DialKitDirectiveHost",
    setup() {
      return () => h16(DialRoot, props.value);
    }
  });
  const app = createApp(RootHost);
  app.mount(host);
  states.set(el, { app, host, props });
}
function unmountDialRoot(el) {
  const state = states.get(el);
  if (!state) return;
  state.app.unmount();
  state.host.remove();
  states.delete(el);
}
var vDialKit = {
  mounted(el, binding) {
    mountDialRoot(el, binding.value);
  },
  updated(el, binding) {
    const state = states.get(el);
    if (!state) {
      mountDialRoot(el, binding.value);
      return;
    }
    state.props.value = normalizeDirectiveValue(binding.value);
  },
  beforeUnmount(el) {
    unmountDialRoot(el);
  }
};

// src/vue/components/ShortcutsMenu.ts
import { defineComponent as defineComponent17, h as h17, onUnmounted as onUnmounted10, ref as ref14, Teleport as Teleport4 } from "vue";
function formatShortcutKey(sc) {
  if (!sc.key) return "\u2014";
  const mod = sc.modifier === "alt" ? "\u2325" : sc.modifier === "shift" ? "\u21E7" : sc.modifier === "meta" ? "\u2318" : "";
  return `${mod}${sc.key.toUpperCase()}`;
}
function formatInteraction(sc) {
  const interaction = sc.interaction ?? "scroll";
  switch (interaction) {
    case "scroll":
      return sc.key ? "key+scroll" : "scroll";
    case "drag":
      return "key+drag";
    case "move":
      return "key+move";
    case "scroll-only":
      return "scroll";
  }
}
var ShortcutsMenu = defineComponent17({
  name: "DialKitShortcutsMenu",
  props: {
    panelId: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const isOpen = ref14(false);
    const triggerRef = ref14(null);
    const dropdownRef = ref14(null);
    const pos = ref14({ top: 0, right: 0 });
    const open = () => {
      const rect = triggerRef.value?.getBoundingClientRect();
      if (rect) {
        pos.value = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
      }
      isOpen.value = true;
    };
    const close = () => {
      isOpen.value = false;
    };
    const toggle = () => {
      if (isOpen.value) close();
      else open();
    };
    let mousedownHandler = null;
    const addOutsideClickListener = () => {
      mousedownHandler = (e) => {
        const target = e.target;
        if (triggerRef.value?.contains(target) || dropdownRef.value?.contains(target)) return;
        close();
      };
      document.addEventListener("mousedown", mousedownHandler);
    };
    const removeOutsideClickListener = () => {
      if (mousedownHandler) {
        document.removeEventListener("mousedown", mousedownHandler);
        mousedownHandler = null;
      }
    };
    onUnmounted10(() => {
      removeOutsideClickListener();
    });
    return () => {
      const panel = DialStore.getPanel(props.panelId);
      if (!panel) return null;
      const shortcuts = Object.entries(panel.shortcuts);
      if (shortcuts.length === 0) return null;
      const findLabel = (controls, path) => {
        for (const c of controls) {
          if (c.path === path) return c.label;
          if (c.type === "folder" && c.children) {
            const found = findLabel(c.children, path);
            if (found) return found;
          }
        }
        return path;
      };
      const rows = shortcuts.map(([path, shortcut]) => ({
        path,
        shortcut,
        label: findLabel(panel.controls, path)
      }));
      if (isOpen.value) {
        if (!mousedownHandler) addOutsideClickListener();
      } else {
        removeOutsideClickListener();
      }
      return [
        h17("button", {
          ref: triggerRef,
          class: "dialkit-shortcuts-trigger",
          onClick: toggle,
          title: "Keyboard shortcuts"
        }, [
          h17("svg", {
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
          }, [
            h17("rect", { x: "2", y: "6", width: "20", height: "12", rx: "2" }),
            h17("path", { d: "M6 10H6.01" }),
            h17("path", { d: "M10 10H10.01" }),
            h17("path", { d: "M14 10H14.01" }),
            h17("path", { d: "M18 10H18.01" }),
            h17("path", { d: "M8 14H16" })
          ])
        ]),
        isOpen.value ? h17(Teleport4, { to: "body" }, [
          h17("div", {
            ref: dropdownRef,
            class: "dialkit-root dialkit-shortcuts-dropdown",
            style: {
              position: "fixed",
              top: `${pos.value.top}px`,
              right: `${pos.value.right}px`
            }
          }, [
            h17("div", { class: "dialkit-shortcuts-title" }, "Keyboard Shortcuts"),
            h17(
              "div",
              { class: "dialkit-shortcuts-list" },
              rows.map(
                (row) => h17("div", { key: row.path, class: "dialkit-shortcuts-row" }, [
                  h17("span", { class: "dialkit-shortcuts-row-key" }, formatShortcutKey(row.shortcut)),
                  h17("span", { class: "dialkit-shortcuts-row-label" }, row.label),
                  h17("span", { class: "dialkit-shortcuts-row-mode" }, formatInteraction(row.shortcut))
                ])
              )
            ),
            h17("div", { class: "dialkit-shortcuts-hint" }, "See pill badges on controls for keys")
          ])
        ]) : null
      ];
    };
  }
});

// src/vue/components/ButtonGroup.ts
import { defineComponent as defineComponent18, h as h18 } from "vue";
var ButtonGroup = defineComponent18({
  name: "DialKitButtonGroup",
  props: {
    buttons: {
      type: Array,
      required: true
    }
  },
  setup(props) {
    return () => h18(
      "div",
      { class: "dialkit-button-group" },
      props.buttons.map(
        (button) => h18("button", { class: "dialkit-button", onClick: button.onClick }, button.label)
      )
    );
  }
});
export {
  ButtonGroup,
  ColorControl,
  DialRoot,
  DialStore,
  EasingVisualization,
  Folder,
  PresetManager,
  SelectControl,
  ShortcutKey,
  ShortcutListener,
  ShortcutsMenu,
  Slider,
  SpringControl,
  SpringVisualization,
  TextControl,
  Toggle,
  TransitionControl,
  useDialKit,
  useDialKitController,
  useShortcutContext,
  vDialKit
};
//# sourceMappingURL=index.js.map