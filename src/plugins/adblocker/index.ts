import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';

import { createPlugin } from '@/utils';
import { t } from '@/i18n';

export type AdblockerPluginConfig = {
  enabled: boolean;
  cache: boolean;
  additionalBlockLists: string[];
};

export default createPlugin<
  unknown,
  unknown,
  unknown,
  AdblockerPluginConfig
>({
  name: () => t('plugins.adblocker.name'),
  description: () => t('plugins.adblocker.description'),
  restartNeeded: true,
  config: {
    enabled: true,
    cache: true,
    additionalBlockLists: [],
  },
  async backend({ getConfig, window }) {
    const config = await getConfig();
    if (!config.enabled) return;

    const session = window.webContents.session;
    const cachePath = join(app.getPath('userData'), 'adblocker-cache.bin');

    try {
      let blocker: ElectronBlocker;
      if (config.cache) {
        try {
          const buffer = await fs.readFile(cachePath);
          blocker = ElectronBlocker.deserialize(buffer);
        } catch {
          blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
          const buffer = blocker.serialize();
          await fs.writeFile(cachePath, buffer);
        }
      } else {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
      }

      if (config.additionalBlockLists && config.additionalBlockLists.length > 0) {
        blocker.appendConfigurations(
          config.additionalBlockLists.map((list) => ({
            url: list,
          })),
        );
      }

      blocker.enableBlockingInSession(session);
      console.log('Adblocker plugin initialized and enabled in session successfully.');
    } catch (err) {
      console.error('Failed to initialize Adblocker:', err);
    }
  },
});
