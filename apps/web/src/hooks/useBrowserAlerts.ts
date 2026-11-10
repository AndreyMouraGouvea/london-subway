import { useEffect, useRef } from 'react';
import { LINE_BRANDING_BY_ID, type StatusBand } from '@ldt/shared';
import { useAuth } from './useAuth';
import { useAlertSubscriptions, type AlertBand } from './useAccount';
import { useDisruptions } from './useOperations';

const RANK: Record<StatusBand, number> = {
  normal: 0,
  unknown: 0,
  attention: 1,
  severe: 2,
  closure: 3,
};

const BAND_LABELS: Record<AlertBand, string> = {
  attention: 'atenção',
  severe: 'severa',
  closure: 'fecho',
};

/**
 * Notificações do browser enquanto a aplicação está aberta. Não é push:
 * não há service worker nem envio server-side.
 */
export function useBrowserAlerts(): void {
  const { user } = useAuth();
  const subscriptions = useAlertSubscriptions();
  const disruptions = useDisruptions();
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (!user || subscriptions.subscriptions.length === 0) return;
    if (Notification.permission !== 'granted') return;
    const rows = disruptions.data?.data;
    if (!rows) return;

    const enabled = new Map(
      subscriptions.subscriptions
        .filter((subscription) => subscription.browser_notifications)
        .map((subscription) => [subscription.line_id, subscription.min_band]),
    );

    if (!initialized.current) {
      for (const disruption of rows) seen.current.add(disruption.id);
      initialized.current = true;
      return;
    }

    for (const disruption of rows) {
      if (seen.current.has(disruption.id)) continue;
      seen.current.add(disruption.id);
      if (!disruption.lineId) continue;
      const threshold = enabled.get(disruption.lineId);
      if (!threshold) continue;
      if (RANK[disruption.band] < RANK[threshold]) continue;
      const lineName = LINE_BRANDING_BY_ID[disruption.lineId]?.name ?? disruption.lineId;
      new Notification(`London Digital Twin · ${lineName}`, {
        body: `${BAND_LABELS[threshold]} · ${
          disruption.description ?? disruption.summary ?? 'Nova disrupção'
        }`,
        tag: disruption.id,
      });
    }
  }, [disruptions.data, subscriptions.subscriptions, user]);
}
