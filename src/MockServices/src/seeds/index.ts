import { state } from '../state.js';
import { applyDefaultSeed } from './default.js';

const seeds: Record<string, () => Promise<void>> = {
  default: applyDefaultSeed,
  empty: async () => {}
};

export function seedNames(): string[] {
  return Object.keys(seeds);
}

export async function applySeed(name: string): Promise<void> {
  const apply = seeds[name];
  if (!apply) throw new Error(`unknown seed "${name}"; available: ${seedNames().join(', ')}`);
  state.clear();
  await apply();
  state.seedName = name;
  state.save();
}
