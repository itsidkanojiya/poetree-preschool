import type { GamesAdmin } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { LiveSwitch } from '@/components/ui/live-switch';
import { setGameActiveAction, setGamesEnabledAction } from './actions';

/**
 * The games module, for every school at once: whether the app shows Games at
 * all, and which of the five games it offers.
 */
export default async function GamesPage() {
  const view = await apiFetch<GamesAdmin>('/publication/games');

  return (
    <>
      <PageHeader
        title="Games"
        description="Five learning games in the app — in English, Hindi and Gujarati."
      />

      <Card className="mb-5">
        <LiveSwitch
          on={view.enabled}
          action={setGamesEnabledAction.bind(null, !view.enabled)}
          label={view.enabled ? 'Turn games off' : 'Turn games on'}
          onTitle="Games are on in every school’s app"
          offTitle="Games are off"
          onNote="The Games banner shows on the app’s home screen, with every game switched on below."
          offNote="The Games banner is gone from every school’s app and the games cannot be opened. Nothing is deleted — every child’s scores are kept for when it is switched back on."
        />
      </Card>

      <Card
        title="Each game"
        description="Switch a single game off without touching the others. The counts are rounds played in every school."
      >
        <ul className="divide-y divide-navy-950/[0.06]">
          {view.games.map((game) => (
            <li key={game.key} className="py-4 first:pt-0 last:pb-0">
              <LiveSwitch
                on={game.isActive}
                action={setGameActiveAction.bind(null, game.key, !game.isActive)}
                label={game.isActive ? `Hide ${game.name}` : `Offer ${game.name}`}
                onTitle={`${game.name} — on`}
                offTitle={`${game.name} — off`}
                onNote={`${game.sessions.toLocaleString('en-IN')} rounds played so far.`}
                offNote="Hidden from children. Their past scores are kept."
              />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
