import { useDialKit, useDialKitController } from './useDialKit';
import type { UseDialOptions } from './useDialKit';
import type { DialConfig, ResolvedValues } from '../store/DialStore';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'panel';
}

export function useDevDialKit<T extends DialConfig>(
  name: string,
  config: T,
  options?: Omit<UseDialOptions, 'persist'> & { id?: string; persist?: UseDialOptions['persist'] }
): ResolvedValues<T> {
  return useDevDialKitController(name, config, options).values;
}

export function useDevDialKitController<T extends DialConfig>(
  name: string,
  config: T,
  options?: Omit<UseDialOptions, 'persist'> & { id?: string; persist?: UseDialOptions['persist'] }
) {
  const stableId = options?.id ?? slugify(name);
  return useDialKitController(name, config, {
    ...options,
    id: stableId,
    persist: options?.persist ?? {
      key: `dialkit:dev:${stableId}`,
      storage: 'localStorage',
      presets: true,
    },
  });
}
