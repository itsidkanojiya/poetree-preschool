'use server';

import { revalidatePath } from 'next/cache';
import type { GameKey } from '@poetree/shared';
import { apiFetch } from '@/lib/api';

/** On or off in every school's app. */
export async function setGamesEnabledAction(enabled: boolean): Promise<void> {
  await apiFetch('/publication/games/settings', { method: 'PUT', body: { enabled } });
  revalidatePath('/publication/games');
}

/** One game on or off, everywhere. */
export async function setGameActiveAction(key: GameKey, isActive: boolean): Promise<void> {
  await apiFetch(`/publication/games/${key}`, { method: 'PATCH', body: { isActive } });
  revalidatePath('/publication/games');
}
