import type { ControlMeta, DialValue } from './DialStore';
import { DialStore } from './DialStore';
import type { ElementInfo } from '../utils/dom-inspect';

export interface DevNote {
  id: string;
  createdAt: string;
  updatedAt: string;
  comment: string;
  status: 'open' | 'done';
  pagePath: string;
  pageUrl: string;
  selector?: string;
  element?: string;
  reactComponent?: string | null;
  reactStack?: string[];
  panelId?: string;
  panelName?: string;
  dialSnapshot?: Record<string, DialValue>;
  exportedAt?: string | null;
}

export interface DialChangeEntry {
  id: string;
  at: string;
  panelId: string;
  panelName: string;
  path: string;
  label: string;
  value: DialValue;
  exportedAt?: string | null;
}

interface DevSessionState {
  version: 1;
  projectKey: string;
  notes: DevNote[];
  changes: DialChangeEntry[];
}

type Listener = () => void;

const STORAGE_VERSION = 1;

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function storageKey(projectKey: string): string {
  return `dialkit:dev-session:v${STORAGE_VERSION}:${projectKey}`;
}

class DevSessionStoreImpl {
  private projectKey = 'default';
  private enabled = false;
  private notes: DevNote[] = [];
  private changes: DialChangeEntry[] = [];
  private notesSnapshot: DevNote[] = [];
  private pendingChangesSnapshot: DialChangeEntry[] = [];
  private listeners = new Set<Listener>();
  private unsubscribeDial: (() => void) | null = null;

  configure(projectKey = 'default'): void {
    if (this.projectKey === projectKey && this.enabled) return;
    this.projectKey = projectKey;
    this.load();
    this.enable();
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.unsubscribeDial?.();
    this.unsubscribeDial = DialStore.subscribeChanges((event) => {
      const panel = DialStore.getPanels().find((p) => p.id === event.panelId);
      const control = panel?.controls.find((c) => c.path === event.path)
        ?? this.findControl(panel?.controls ?? [], event.path);
      this.logChange({
        panelId: event.panelId,
        panelName: panel?.name ?? event.panelId,
        path: event.path,
        label: control?.label ?? event.path,
        value: event.value,
      });
    });
    this.notify();
  }

  disable(): void {
    this.enabled = false;
    this.unsubscribeDial?.();
    this.unsubscribeDial = null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getProjectKey(): string {
    return this.projectKey;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getNotes(): DevNote[] {
    return this.notesSnapshot;
  }

  getOpenNotes(): DevNote[] {
    return this.notesSnapshot.filter((n) => n.status === 'open' && !n.exportedAt);
  }

  getChanges(): DialChangeEntry[] {
    return [...this.changes].sort((a, b) => b.at.localeCompare(a.at));
  }

  getPendingChanges(): DialChangeEntry[] {
    return this.pendingChangesSnapshot;
  }

  addNote(input: {
    comment: string;
    target?: ElementInfo | null;
    panelId?: string;
    panelName?: string;
    dialSnapshot?: Record<string, DialValue>;
  }): DevNote {
    const now = new Date().toISOString();
    const note: DevNote = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      comment: input.comment.trim(),
      status: 'open',
      pagePath: typeof location !== 'undefined' ? location.pathname : '',
      pageUrl: typeof location !== 'undefined' ? location.href : '',
      selector: input.target?.selector,
      element: input.target?.element,
      reactComponent: input.target?.reactComponent ?? null,
      reactStack: input.target?.reactStack,
      panelId: input.panelId,
      panelName: input.panelName,
      dialSnapshot: input.dialSnapshot,
      exportedAt: null,
    };
    this.notes.unshift(note);
    this.save();
    this.notify();
    return note;
  }

  updateNote(id: string, patch: Partial<Pick<DevNote, 'comment' | 'status'>>): void {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;
    if (patch.comment !== undefined) note.comment = patch.comment.trim();
    if (patch.status !== undefined) note.status = patch.status;
    note.updatedAt = new Date().toISOString();
    this.save();
    this.notify();
  }

  deleteNote(id: string): void {
    this.notes = this.notes.filter((n) => n.id !== id);
    this.save();
    this.notify();
  }

  clearExported(): void {
    this.notes = this.notes.filter((n) => n.status === 'open' && !n.exportedAt);
    this.changes = this.changes.filter((c) => !c.exportedAt);
    this.save();
    this.notify();
  }

  resetSession(): void {
    this.notes = [];
    this.changes = [];
    this.save();
    this.notify();
  }

  buildAgentReport(options?: { includeDoneNotes?: boolean }): string {
    const includeDone = options?.includeDoneNotes ?? false;
    const notes = this.getNotes().filter((n) => !n.exportedAt && (includeDone || n.status === 'open'));
    const changes = this.getPendingChanges();
    const panels = DialStore.getPanels();

    const lines: string[] = ['# DialKit dev session', ''];
    lines.push(`**Project:** ${this.projectKey}`);
    lines.push(`**Page:** ${typeof location !== 'undefined' ? location.href : ''}`);
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push('');

    if (notes.length) {
      lines.push('## Notes');
      lines.push('');
      for (const note of notes) {
        lines.push(`### ${note.reactComponent ?? note.element ?? 'UI note'} (${note.status})`);
        if (note.selector) lines.push(`- **Selector:** \`${note.selector}\``);
        if (note.reactComponent) lines.push(`- **React:** \`${note.reactComponent}\``);
        if (note.reactStack?.length) {
          lines.push(`- **Stack:** ${note.reactStack.map((n) => `\`${n}\``).join(' → ')}`);
        }
        if (note.panelName) lines.push(`- **Dial panel:** ${note.panelName}`);
        lines.push('');
        lines.push(note.comment || '(no comment)');
        lines.push('');
      }
    }

    if (changes.length) {
      lines.push('## Parameter changes');
      lines.push('');
      const byPanel = new Map<string, DialChangeEntry[]>();
      for (const change of changes) {
        const list = byPanel.get(change.panelName) ?? [];
        list.push(change);
        byPanel.set(change.panelName, list);
      }
      for (const [panelName, panelChanges] of byPanel) {
        lines.push(`### ${panelName}`);
        const latestByPath = new Map<string, DialChangeEntry>();
        for (const c of panelChanges) latestByPath.set(c.path, c);
        for (const c of latestByPath.values()) {
          lines.push(`- **${c.label}** (\`${c.path}\`): \`${JSON.stringify(c.value)}\``);
        }
        lines.push('');
      }
    }

    if (panels.length) {
      lines.push('## Current dial values');
      lines.push('');
      for (const panel of panels) {
        const values = DialStore.getValues(panel.id);
        lines.push(`### ${panel.name}`);
        lines.push('```json');
        lines.push(JSON.stringify(values, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    if (!notes.length && !changes.length) {
      lines.push('_No pending notes or parameter changes._');
    }

    return lines.join('\n');
  }

  async copyAgentReport(): Promise<boolean> {
    const report = this.buildAgentReport();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
      this.markExported();
      return true;
    }
    return false;
  }

  markExported(): void {
    const now = new Date().toISOString();
    for (const note of this.notes) {
      if (note.status === 'open' && !note.exportedAt) note.exportedAt = now;
    }
    for (const change of this.changes) {
      if (!change.exportedAt) change.exportedAt = now;
    }
    this.save();
    this.notify();
  }

  private logChange(input: Omit<DialChangeEntry, 'id' | 'at' | 'exportedAt'>): void {
    if (!this.enabled) return;
    const entry: DialChangeEntry = {
      id: uid(),
      at: new Date().toISOString(),
      exportedAt: null,
      ...input,
    };
    this.changes.unshift(entry);
    if (this.changes.length > 500) this.changes.length = 500;
    this.save();
    this.notify();
  }

  private findControl(controls: ControlMeta[], path: string): ControlMeta | null {
    for (const c of controls) {
      if (c.path === path) return c;
      if (c.children) {
        const found = this.findControl(c.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  private load(): void {
    const storage = this.getStorage();
    if (!storage) {
      this.notes = [];
      this.changes = [];
      this.rebuildSnapshots();
      return;
    }
    try {
      const raw = storage.getItem(storageKey(this.projectKey));
      if (!raw) {
        this.notes = [];
        this.changes = [];
        this.rebuildSnapshots();
        return;
      }
      const parsed = JSON.parse(raw) as DevSessionState;
      if (parsed?.version !== STORAGE_VERSION) {
        this.notes = [];
        this.changes = [];
        this.rebuildSnapshots();
        return;
      }
      this.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      this.changes = Array.isArray(parsed.changes) ? parsed.changes : [];
    } catch {
      this.notes = [];
      this.changes = [];
    }
    this.rebuildSnapshots();
  }

  private save(): void {
    const storage = this.getStorage();
    if (!storage) return;
    const state: DevSessionState = {
      version: STORAGE_VERSION,
      projectKey: this.projectKey,
      notes: this.notes,
      changes: this.changes,
    };
    try {
      storage.setItem(storageKey(this.projectKey), JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }

  private getStorage(): Storage | null {
    if (typeof globalThis === 'undefined' || !('window' in globalThis)) return null;
    try {
      return globalThis.window?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private notify(): void {
    this.rebuildSnapshots();
    this.listeners.forEach((fn) => fn());
  }

  private rebuildSnapshots(): void {
    this.notesSnapshot = [...this.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.pendingChangesSnapshot = [...this.changes]
      .filter((c) => !c.exportedAt)
      .sort((a, b) => b.at.localeCompare(a.at));
  }
}

export const DevSessionStore = new DevSessionStoreImpl();
