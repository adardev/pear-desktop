import i18next from 'i18next';

import { setTheme } from 'mdui/functions/setTheme.js';
import 'mdui/mdui.css';
import 'mdui';

import { startingPages } from './providers/extracted-data';
import { setupSongInfo } from './providers/song-info-front';
import {
  createContext,
  forceLoadRendererPlugin,
  forceUnloadRendererPlugin,
  getAllLoadedRendererPlugins,
  getLoadedRendererPlugin,
  loadAllRendererPlugins,
} from './loader/renderer';

import { loadI18n, setLanguage, t as i18t } from '@/i18n';

import {
  defaultTrustedTypePolicy,
  registerWindowDefaultTrustedTypePolicy,
} from '@/utils/trusted-types';

import type { PluginConfig } from '@/types/plugins';
import type { MusicPlayer } from '@/types/music-player';
import type { QueueElement } from '@/types/queue';
import type { QueueResponse } from '@/types/music-player-desktop-internal';
import type { MusicPlayerAppElement } from '@/types/music-player-app-element';
import type { SearchBoxElement } from '@/types/search-box-element';

setTheme('dark');

{
  let osType = 'Unknown';
  if (window.electronIs.osx()) {
    osType = 'Macintosh';
  } else if (window.electronIs.windows()) {
    osType = 'Windows';
  } else if (window.electronIs.linux()) {
    osType = 'Linux';
  }
  if (document.documentElement) {
    document.documentElement.setAttribute('data-os', osType);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.setAttribute('data-os', osType);
    });
  }
}

let api: (Element & MusicPlayer) | null = null;
let isPluginLoaded = false;
let isApiLoaded = false;
let firstDataLoaded = false;

registerWindowDefaultTrustedTypePolicy();

async function listenForApiLoad() {
  if (!isApiLoaded) {
    api = document.querySelector('#movie_player');
    if (api) {
      await onApiLoaded();

      return;
    }
  }
}

async function onApiLoaded() {
  // Workaround for #2459
  document
    .querySelector('button.video-button.ytmusic-av-toggle')
    ?.addEventListener('click', () =>
      window.dispatchEvent(new Event('resize')),
    );

  window.ipcRenderer.on('peard:previous-video', () => {
    document
      .querySelector<HTMLElement>('.previous-button.ytmusic-player-bar')
      ?.click();
  });
  window.ipcRenderer.on('peard:next-video', () => {
    document
      .querySelector<HTMLElement>('.next-button.ytmusic-player-bar')
      ?.click();
  });
  window.ipcRenderer.on('peard:play', (_) => {
    api?.playVideo();
  });
  window.ipcRenderer.on('peard:pause', (_) => {
    api?.pauseVideo();
  });
  window.ipcRenderer.on('peard:toggle-play', (_) => {
    if (api?.getPlayerState() === 2) api?.playVideo();
    else api?.pauseVideo();
  });
  window.ipcRenderer.on('peard:seek-to', (_, t: number) => api!.seekTo(t));
  window.ipcRenderer.on('peard:seek-by', (_, t: number) => api!.seekBy(t));
  window.ipcRenderer.on('peard:shuffle', () => {
    document
      .querySelector<
        HTMLElement & { queue: { shuffle: () => void } }
      >('ytmusic-player-bar')
      ?.queue.shuffle();
  });

  const isShuffled = () => {
    const isShuffled =
      document
        .querySelector<HTMLElement>('ytmusic-player-bar')
        ?.attributes.getNamedItem('shuffle-on') ?? null;

    return isShuffled !== null;
  };

  window.ipcRenderer.on('peard:get-shuffle', () => {
    window.ipcRenderer.send('peard:get-shuffle-response', isShuffled());
  });

  window.ipcRenderer.on(
    'peard:update-like',
    (_, status: 'LIKE' | 'DISLIKE' = 'LIKE') => {
      document
        .querySelector<
          HTMLElement & { updateLikeStatus: (status: string) => void }
        >('#like-button-renderer')
        ?.updateLikeStatus(status);
    },
  );
  window.ipcRenderer.on('peard:switch-repeat', (_, repeat = 1) => {
    for (let i = 0; i < repeat; i++) {
      document
        .querySelector<
          HTMLElement & { onRepeatButtonClick: () => void }
        >('ytmusic-player-bar')
        ?.onRepeatButtonClick();
    }
  });
  window.ipcRenderer.on('peard:update-volume', (_, volume: number) => {
    document
      .querySelector<
        HTMLElement & { updateVolume: (volume: number) => void }
      >('ytmusic-player-bar')
      ?.updateVolume(volume);
  });

  const isFullscreen = () => {
    const isFullscreen =
      document
        .querySelector<HTMLElement>('ytmusic-player-bar')
        ?.attributes.getNamedItem('player-fullscreened') ?? null;

    return isFullscreen !== null;
  };

  const clickFullscreenButton = (isFullscreenValue: boolean) => {
    const fullscreen = isFullscreen();
    if (isFullscreenValue === fullscreen) {
      return;
    }

    if (fullscreen) {
      document.querySelector<HTMLElement>('.exit-fullscreen-button')?.click();
    } else {
      document.querySelector<HTMLElement>('.fullscreen-button')?.click();
    }
  };

  window.ipcRenderer.on('peard:get-fullscreen', () => {
    window.ipcRenderer.send('peard:set-fullscreen', isFullscreen());
  });

  window.ipcRenderer.on(
    'peard:click-fullscreen-button',
    (_, fullscreen: boolean | undefined) => {
      clickFullscreenButton(fullscreen ?? false);
    },
  );

  window.ipcRenderer.on('peard:toggle-mute', (_) => {
    document
      .querySelector<
        HTMLElement & { onVolumeClick: () => void }
      >('ytmusic-player-bar')
      ?.onVolumeClick();
  });

  window.ipcRenderer.on('peard:get-queue', () => {
    const queue = document.querySelector<QueueElement>('#queue');
    window.ipcRenderer.send('peard:get-queue-response', {
      items: queue?.queue.getItems(),
      autoPlaying: queue?.queue.autoPlaying,
      continuation: queue?.queue.continuation,
    } satisfies QueueResponse);
  });

  window.ipcRenderer.on(
    'peard:add-to-queue',
    (_, videoId: string, queueInsertPosition: string) => {
      const queue = document.querySelector<QueueElement>('#queue');
      const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');
      if (!app) return;

      const store = queue?.queue.store.store;
      if (!store) return;

      app.networkManager
        .fetch('/music/get_queue', {
          queueContextParams: store.getState().queue.queueContextParams,
          queueInsertPosition,
          videoIds: [videoId],
        })
        .then((result) => {
          if (
            result &&
            typeof result === 'object' &&
            'queueDatas' in result &&
            Array.isArray(result.queueDatas)
          ) {
            const queueItems = store.getState().queue.items;
            const queueItemsLength = queueItems.length ?? 0;
            queue?.dispatch({
              type: 'ADD_ITEMS',
              payload: {
                nextQueueItemId: store.getState().queue.nextQueueItemId,
                index:
                  queueInsertPosition === 'INSERT_AFTER_CURRENT_VIDEO'
                    ? queueItems.findIndex(
                        (it) =>
                          (
                            it.playlistPanelVideoRenderer ||
                            it.playlistPanelVideoWrapperRenderer
                              ?.primaryRenderer.playlistPanelVideoRenderer
                          )?.selected,
                      ) + 1 || queueItemsLength
                    : queueItemsLength,
                items: result.queueDatas
                  .map((it) =>
                    typeof it === 'object' && it && 'content' in it
                      ? it.content
                      : null,
                  )
                  .filter(Boolean),
                shuffleEnabled: false,
                shouldAssignIds: true,
              },
            });
          }
        });
    },
  );
  window.ipcRenderer.on(
    'peard:move-in-queue',
    (_, fromIndex: number, toIndex: number) => {
      const queue = document.querySelector<QueueElement>('#queue');
      queue?.dispatch({
        type: 'MOVE_ITEM',
        payload: {
          fromIndex,
          toIndex,
        },
      });
    },
  );
  window.ipcRenderer.on('peard:remove-from-queue', (_, index: number) => {
    const queue = document.querySelector<QueueElement>('#queue');
    queue?.dispatch({
      type: 'REMOVE_ITEM',
      payload: index,
    });
  });
  window.ipcRenderer.on('peard:set-queue-index', (_, index: number) => {
    const queue = document.querySelector<QueueElement>('#queue');
    queue?.dispatch({
      type: 'SET_INDEX',
      payload: index,
    });
  });
  window.ipcRenderer.on('peard:clear-queue', () => {
    const queue = document.querySelector<QueueElement>('#queue');
    queue?.queue.store.store.dispatch({
      type: 'SET_PLAYER_PAGE_INFO',
      payload: { open: false },
    });
    queue?.dispatch({
      type: 'CLEAR',
    });
  });

  window.ipcRenderer.on(
    'peard:search',
    async (_, query: string, params?: string, continuation?: string) => {
      const app = document.querySelector<MusicPlayerAppElement>('ytmusic-app');
      const searchBox =
        document.querySelector<SearchBoxElement>('ytmusic-search-box');

      if (!app || !searchBox) return;

      const result = await app.networkManager.fetch<
        unknown,
        {
          query: string;
          params?: string;
          continuation?: string;
          suggestStats?: unknown;
        }
      >('/search', {
        query,
        params,
        continuation,
        suggestStats: searchBox.getSearchboxStats(),
      });

      window.ipcRenderer.send('peard:search-results', result);
    },
  );

  const video = document.querySelector('video')!;
  const audioContext = new AudioContext();
  const audioSource = audioContext.createMediaElementSource(video);
  audioSource.connect(audioContext.destination);

  for (const [id, plugin] of Object.entries(getAllLoadedRendererPlugins())) {
    if (typeof plugin.renderer !== 'function') {
      await plugin.renderer?.onPlayerApiReady?.call(
        plugin.renderer,
        api!,
        createContext(id),
      );
    }
  }

  if (firstDataLoaded) {
    document.dispatchEvent(
      new CustomEvent('videodatachange', { detail: { name: 'dataloaded' } }),
    );
  }

  const audioCanPlayEventDispatcher = () => {
    document.dispatchEvent(
      new CustomEvent('peard:audio-can-play', {
        detail: {
          audioContext,
          audioSource,
        },
      }),
    );
  };

  const loadstartListener = () => {
    // Emit "audioCanPlay" for each video
    video.addEventListener('canplaythrough', audioCanPlayEventDispatcher, {
      once: true,
    });
  };

  if (video.readyState === 4 /* HAVE_ENOUGH_DATA (loaded) */) {
    audioCanPlayEventDispatcher();
  }

  video.addEventListener('loadstart', loadstartListener, { passive: true });

  // Force scroll to top on page navigation
  const forceScrollToTop = () => {
    const appLayout = document.querySelector<HTMLElement>('ytmusic-app-layout');
    const content = document.querySelector<HTMLElement>('#content');
    const scrollContainer = document.querySelector<HTMLElement>('#scroll-container');
    if (appLayout) appLayout.scrollTop = 0;
    if (content) content.scrollTop = 0;
    if (scrollContainer) scrollContainer.scrollTop = 0;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  window.navigation.addEventListener('navigate', () => {
    requestAnimationFrame(() => {
      forceScrollToTop();
      setTimeout(forceScrollToTop, 100);
      setTimeout(forceScrollToTop, 300);
    });
  });

  // Also force scroll on URL changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      requestAnimationFrame(() => {
        forceScrollToTop();
        setTimeout(forceScrollToTop, 100);
        setTimeout(forceScrollToTop, 300);
      });
    }
  }).observe(document, { subtree: true, childList: true });


  // Navigate to "Starting page"
  const startingPage: string = window.mainConfig.get('options.startingPage');
  if (startingPage && startingPages[startingPage]) {
    document
      .querySelector<MusicPlayerAppElement>('ytmusic-app')
      ?.navigate(startingPages[startingPage]);
  }

  // Remove upgrade button
  if (window.mainConfig.get('options.removeUpgradeButton')) {
    const itemsSelector = 'ytmusic-guide-section-renderer #items';
    let selector = 'ytmusic-guide-entry-renderer:last-child';

    const upgradeBtnIcon = document.querySelector<SVGGElement>(
      'iron-iconset-svg[name="yt-sys-icons"] #\u0079\u006f\u0075\u0074\u0075\u0062\u0065_music_monochrome',
    );
    if (upgradeBtnIcon) {
      const path = upgradeBtnIcon.firstChild as SVGPathElement;
      const data = path.getAttribute('d')!.substring(0, 15);
      selector = `ytmusic-guide-entry-renderer:has(> tp-yt-paper-item > yt-icon path[d^="${data}"])`;
    }

    const styles = document.createElement('style');
    styles.textContent = `${itemsSelector} ${selector} { display: none; }`;

    document.head.appendChild(styles);
  }

  // Hide / Force show like buttons
  const likeButtonsOptions: string = window.mainConfig.get(
    'options.likeButtons',
  );
  if (likeButtonsOptions) {
    const style = document.createElement('style');
    style.textContent = `
      ytmusic-player-bar[is-mweb-player-bar-modernization-enabled] .middle-controls-buttons.ytmusic-player-bar, #like-button-renderer {
        display: ${
          likeButtonsOptions === 'hide' ? 'none' : 'inherit'
        } !important;
      }
      ytmusic-player-bar[is-mweb-player-bar-modernization-enabled] .middle-controls.ytmusic-player-bar {
        justify-content: ${
          likeButtonsOptions === 'hide' ? 'flex-start' : 'space-between'
        } !important;
      }`;

    document.head.appendChild(style);
  }

  // Swap like button order
  if (window.mainConfig.get('options.swapLikeButtonsOrder')) {
    const style = document.createElement('style');
    style.textContent = `
      #like-button-renderer {
        display: inline-flex;
        flex-direction: row-reverse;
      }`;

    document.head.appendChild(style);
  }
}

const definePearTransElements = () => {
  customElements.define(
    'pear-trans',
    class extends HTMLElement {
      connectedCallback() {
        const key = this.getAttribute('key');
        if (key) {
          const targetHtml = i18t(key);
          (this.innerHTML as string | TrustedHTML) = defaultTrustedTypePolicy
            ? defaultTrustedTypePolicy.createHTML(targetHtml)
            : targetHtml;
        }
      }
    },
  );
};

const preload = async () => {
  await loadI18n();
  await setLanguage(window.mainConfig.get('options.language') ?? 'en');
  window.i18n = {
    t: i18t.bind(i18next),
  };
  definePearTransElements();
  if (document.body?.dataset?.os) {
    document.body.dataset.os = navigator.userAgent;
  }
};

const main = async () => {
  await loadAllRendererPlugins();
  isPluginLoaded = true;

  window.ipcRenderer.on('plugin:unload', async (_event, id: string) => {
    await forceUnloadRendererPlugin(id);
  });
  window.ipcRenderer.on('plugin:enable', async (_event, id: string) => {
    await forceLoadRendererPlugin(id);
    if (api) {
      const plugin = getLoadedRendererPlugin(id);
      if (plugin && typeof plugin.renderer !== 'function') {
        await plugin.renderer?.onPlayerApiReady?.call(
          plugin.renderer,
          api,
          createContext(id),
        );
      }
    }
  });

  window.ipcRenderer.on(
    'config-changed',
    (_event, id: string, newConfig: PluginConfig) => {
      const plugin = getAllLoadedRendererPlugins()[id];
      if (plugin && typeof plugin.renderer !== 'function') {
        plugin.renderer?.onConfigChange?.call(plugin.renderer, newConfig);
      }
    },
  );

  // Wait for complete load of the api
  await listenForApiLoad();

  // Blocks the "Are You Still There?" popup by setting the last active time to Date.now every 15min
  setInterval(() => (window._lact = Date.now()), 900_000);

  // Wait for the custom title bar buttons to be injected
  const waitForTitleBar = () => {
    return new Promise<void>((resolve) => {
      let checkCount = 0;
      const check = () => {
        const navBar = document.querySelector('ytmusic-nav-bar');
        const container = navBar?.shadowRoot?.querySelector('#custom-title-bar-element') || navBar?.querySelector('#custom-title-bar-element');
        
        window.ipcRenderer.invoke('peard:get-config', 'in-app-menu').then((config: any) => {
          const inAppMenuEnabled = !!(config && config.enabled);
          if (!inAppMenuEnabled || container || checkCount > 40 || !window.electronIs.windows()) {
            resolve();
          } else {
            checkCount++;
            setTimeout(check, 50);
          }
        }).catch(() => {
          resolve();
        });
      };
      check();
    });
  };

  await waitForTitleBar();

  // Wait one frame to let styling settle
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // Now notify the main process to show the window
  window.ipcRenderer.send('peard:player-api-loaded');
};

const setupCustomTitleBar = async () => {
  if (!window.electronIs.windows()) {
    return;
  }

  let inAppMenuEnabled = false;
  try {
    const inAppMenuConfig = await window.ipcRenderer.invoke('peard:get-config', 'in-app-menu') as { enabled?: boolean } | null;
    inAppMenuEnabled = !!(inAppMenuConfig && inAppMenuConfig.enabled);
  } catch (e) {
  }

  if (!inAppMenuEnabled) {
    return;
  }

  const makeBtn = (cls: string, label: string, glyph: string, ipcEvent: string) => {
    const btn = document.createElement('button') as HTMLButtonElement;
    btn.type = 'button';
    btn.className = `wv2app-control-button ${cls}`;
    btn.setAttribute('aria-label', label);
    btn.textContent = glyph;
    btn.addEventListener('click', () => {
      window.ipcRenderer.invoke(ipcEvent).catch(() => {
        window.ipcRenderer.send(ipcEvent);
      });
    });
    return btn;
  };

  let maxBtn: HTMLButtonElement | null = null;

  const styleNavBar = () => {
    const navBar = document.querySelector('ytmusic-nav-bar');
    if (navBar) {
      const styleId = 'custom-navbar-shadow-style';
      const styleContent = `
        ytmusic-nav-bar #right-content, #right-content.ytmusic-nav-bar {
          padding-right: 140px !important;
          box-sizing: border-box !important;
          position: relative !important;
        }
        ytmusic-nav-bar[is-search-page] #right-content,
        ytmusic-nav-bar[is-search-page] #right-content.ytmusic-nav-bar {
          position: absolute !important;
          right: 0px !important;
        }
        ytmusic-nav-bar[is-search-page] ytmusic-search-box {
          max-width: 480px !important;
          margin-left: auto !important;
          margin-right: auto !important;
          left: 0 !important;
          right: 0 !important;
          transform: translateX(-64px) !important;
        }
        @media (display-mode: fullscreen) {
          ytmusic-nav-bar #right-content, #right-content.ytmusic-nav-bar {
            padding-right: 0 !important;
          }
          #custom-title-bar-element {
            display: none !important;
          }
        }
        #custom-title-bar-element {
          position: absolute !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          right: 10px !important;
          height: 30px !important;
          display: flex !important;
          align-items: center !important;
          gap: 2px !important;
          z-index: 2147483647 !important;
          pointer-events: none !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        #custom-title-bar-element .wv2app-control-button {
          width: 34px !important;
          height: 30px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets", sans-serif !important;
          font-size: 10px !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          border-radius: 4px !important;
          background: transparent !important;
          user-select: none !important;
          line-height: 1 !important;
          font-weight: normal !important;
          transition: background-color .12s ease, color .12s ease, transform .08s ease !important;
          border: none !important;
          outline: none !important;
          padding: 0 !important;
          pointer-events: auto !important;
          opacity: 1 !important;
        }
        #custom-title-bar-element .wv2app-control-button:hover {
          background: rgba(255, 255, 255, 0.12) !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }
        #custom-title-bar-element .wv2app-control-button:active {
          transform: scale(.96) !important;
        }
        #custom-title-bar-element .wv2app-control-button.wv2app-close:hover {
          background: #e81123 !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }
      `;

      if (navBar.shadowRoot) {
        if (!navBar.shadowRoot.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = styleContent;
          navBar.shadowRoot.appendChild(style);
        }
      }

      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = styleContent;
        document.head.appendChild(style);
      }
    }
  };

  const injectButtons = () => {
    const navBar = document.querySelector('ytmusic-nav-bar');
    if (!navBar) {
      setTimeout(injectButtons, 50);
      return;
    }

    const host = (navBar.shadowRoot?.querySelector('#right-content') || navBar.querySelector('#right-content')) as HTMLElement | null;

    if (!host) {
      setTimeout(injectButtons, 50);
      return;
    }

    let container = navBar.shadowRoot?.querySelector('#custom-title-bar-element') || navBar.querySelector('#custom-title-bar-element');
    if (container) {
      if (container.parentElement !== host) {
        host.appendChild(container);
      }
      return;
    }

    container = document.createElement('div');
    container.id = 'custom-title-bar-element';

    const minBtn = makeBtn('minimize', 'Minimize', '\uE921', 'window-minimize');
    maxBtn = makeBtn('maximize', 'Maximize', '\uE922', 'window-maximize');
    const closeBtn = makeBtn('wv2app-close', 'Close', '\uE8BB', 'window-close');

    container.appendChild(minBtn);
    container.appendChild(maxBtn);
    container.appendChild(closeBtn);

    host.appendChild(container);
    styleNavBar();
  };

  injectButtons();

  // Robust checks using MutationObserver to ensure buttons are present inside shadowRoot or light DOM
  const observer = new MutationObserver(() => {
    const navBar = document.querySelector('ytmusic-nav-bar');
    const container = navBar?.shadowRoot?.querySelector('#custom-title-bar-element') || navBar?.querySelector('#custom-title-bar-element');
    const host = (navBar?.shadowRoot?.querySelector('#right-content') || navBar?.querySelector('#right-content')) as HTMLElement | null;
    if (!container || container.parentElement !== host) {
      injectButtons();
      // Sync maximize state if recreated
      window.ipcRenderer.invoke('window-is-maximized').then((isMax) => {
        if (maxBtn) maxBtn.textContent = isMax ? '\uE923' : '\uE922';
      }).catch(() => {});
    }
    styleNavBar();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const updateMaxButton = (maximized: boolean) => {
    if (maxBtn) {
      maxBtn.textContent = maximized ? '\uE923' : '\uE922';
    }
  };

  try {
    const isMax = await window.ipcRenderer.invoke('window-is-maximized') as boolean;
    updateMaxButton(!!isMax);
  } catch (e) {}

  window.ipcRenderer.on('window-maximize', () => updateMaxButton(true));
  window.ipcRenderer.on('window-unmaximize', () => updateMaxButton(false));

  // Alt held → show in-app menu as overlay; released → hide it.
  // We use keydown to react immediately when Alt is pressed (not after release).
  let altMenuShowing = false;

  const showAltMenu = () => {
    if (altMenuShowing) return;
    altMenuShowing = true;
    document.body.classList.add('alt-menu-visible');
  };

  const hideAltMenu = () => {
    if (!altMenuShowing) return;
    altMenuShowing = false;
    document.body.classList.remove('alt-menu-visible');
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      showAltMenu();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      e.preventDefault();
      hideAltMenu();
    }
  });

  // Safety: hide if window loses focus while Alt is held
  window.addEventListener('blur', hideAltMenu);
};

const setupNavigationDrawerToggle = () => {
  // CSS handles the overlay via ytmusic-navigation-drawer[opened] selector.
  // We only need to ensure the drawer is closed on page load if YTMusic opens it by default.
  const closeDrawerIfOpenByDefault = () => {
    const drawer = document.querySelector('ytmusic-navigation-drawer') as HTMLElement & { close?: () => void };
    if (!drawer) return false;

    if (drawer.hasAttribute('opened')) {
      if (typeof drawer.close === 'function') {
        drawer.close();
      } else {
        drawer.removeAttribute('opened');
      }
    }
    return true;
  };

  if (!closeDrawerIfOpenByDefault()) {
    const retryObserver = new MutationObserver(() => {
      if (closeDrawerIfOpenByDefault()) retryObserver.disconnect();
    });
    retryObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => retryObserver.disconnect(), 10_000);
  }
};

const moveLibraryIconToNavbar = () => {
  const tryMoveIcon = () => {
    try {
      // Check if icon already exists
      const leftContent = document.querySelector('ytmusic-nav-bar > .left-content') as HTMLElement;
      if (!leftContent) {
        return false;
      }

      const existingIcon = leftContent.querySelector('yt-icon[icon="yt-icons:bookmark"]');
      if (existingIcon) {
        return true;
      }

      // Find library icon in guide sidebar
      const guideEntries = document.querySelectorAll('ytmusic-guide-entry-renderer');
      
      let libraryEntry: HTMLElement | null = null;

      for (const entry of guideEntries) {
        const text = entry.textContent?.toLowerCase() || '';
        if (text.includes('library')) {
          libraryEntry = entry as HTMLElement;
          break;
        }
      }

      if (!libraryEntry) {
        return false;
      }

      // Find ytmusic-logo
      const ytmusicLogo = leftContent.querySelector('ytmusic-logo');

      if (!ytmusicLogo) {
        return false;
      }

      // Create a new yt-icon element with the library icon
      const clonedIcon = document.createElement('yt-icon') as HTMLElement;
      clonedIcon.setAttribute('icon', 'yt-icons:bookmark');
      clonedIcon.style.cssText = 'margin-left: 24px; margin-right: 0px; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; color: white; fill: white;';
      
      // Add click handler to click the original entry
      clonedIcon.addEventListener('click', () => {
        const paperItem = libraryEntry.querySelector('tp-yt-paper-item') as HTMLElement;
        if (paperItem) {
          paperItem.click();
        }
      });

      // Insert AFTER the ytmusic-logo in left-content (to the right of the logo)
      ytmusicLogo.after(clonedIcon);

      return true;
    } catch (e) {
      // Silent error
      return false;
    }
  };

  // Try immediately with a MutationObserver as backup
  if (!tryMoveIcon()) {
    const observer = new MutationObserver(() => {
      if (tryMoveIcon()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000);
  }
};

const initObserver = async () => {
  // check document.documentElement is ready
  await new Promise<void>((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve(), {
        once: true,
      });
    } else {
      resolve();
    }
  });

  setupCustomTitleBar();
  setupNavigationDrawerToggle();
  moveLibraryIconToNavbar();

  const observer = new MutationObserver(() => {
    const playerApi = document.querySelector<Element & MusicPlayer>(
      '#movie_player',
    );
    if (playerApi) {
      observer.disconnect();

      // Inject song-info provider
      setupSongInfo(playerApi);
      const dataLoadedListener = (name: string) => {
        if (!firstDataLoaded && name === 'dataloaded') {
          firstDataLoaded = true;
          playerApi.removeEventListener('videodatachange', dataLoadedListener);
        }
      };
      playerApi.addEventListener('videodatachange', dataLoadedListener);

      if (isPluginLoaded && !isApiLoaded) {
        api = playerApi;
        isApiLoaded = true;

        onApiLoaded();
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

initObserver().then(preload).then(main);
