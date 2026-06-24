export interface WindowSizeConfig {
  width: number;
  height: number;
}

export interface WindowPositionConfig {
  x: number;
  y: number;
}

export interface DefaultConfig {
  'window-size': WindowSizeConfig;
  'window-maximized': boolean;
  'window-position': WindowPositionConfig;
  'url': string;
  'options': {
    language?: string;
    tray: boolean;
    appVisible: boolean;
    autoUpdates: boolean;
    alwaysOnTop: boolean;
    hideMenu: boolean;
    hideMenuWarned: boolean;
    startAtLogin: boolean;
    disableHardwareAcceleration: boolean;
    removeUpgradeButton: boolean;
    restartOnConfigChanges: boolean;
    trayClickPlayPause: boolean;
    autoResetAppCache: boolean;
    resumeOnStart: boolean;
    likeButtons: string;
    swapLikeButtonsOrder: boolean;
    proxy: string;
    startingPage: string;
    backgroundMaterial?: 'none' | 'mica' | 'acrylic' | 'tabbed';
    overrideUserAgent: boolean;
    usePodcastParticipantAsArtist: boolean;
    themes: string[];
    customWindowTitle?: string;
  };
  'plugins': Record<string, unknown>;
}

export const defaultConfig: DefaultConfig = {
  'window-size': {
    width: 990,
    height: 800,
  },
  'window-maximized': false,
  'window-position': {
    x: -1,
    y: -1,
  },
  'url': 'https://music.\u0079\u006f\u0075\u0074\u0075\u0062\u0065.com',
  'options': {
    tray: true,
    appVisible: true,
    autoUpdates: false,
    alwaysOnTop: false,
    hideMenu: false,
    hideMenuWarned: true,
    startAtLogin: false,
    disableHardwareAcceleration: false,
    removeUpgradeButton: false,
    restartOnConfigChanges: false,
    trayClickPlayPause: false,
    autoResetAppCache: false,
    resumeOnStart: false,
    likeButtons: 'hide',
    swapLikeButtonsOrder: false,
    proxy: '',
    startingPage: 'Home',
    overrideUserAgent: false,
    usePodcastParticipantAsArtist: false,
    themes: ['C:\\Users\\adarlpz\\Downloads\\custom.css'],
  },
  'plugins': {
    notifications: {},
    'video-toggle': {
      enabled: false,
      hideVideo: false,
      mode: 'native',
      forceHide: false,
      align: 'middle',
    },
    'precise-volume': {
      enabled: false,
      steps: 1,
      arrowsShortcut: true,
      globalShortcuts: {
        volumeUp: '',
        volumeDown: '',
      },
      savedVolume: 100,
    },
    discord: {
      listenAlong: true,
      enabled: false,
    },
    'album-color-theme': {
      enabled: true,
      ratio: 0.5,
      enableSeekbar: false,
    },
    'album-actions': {
      enabled: false,
    },
    amuse: {
      enabled: false,
    },
    'compact-sidebar': {
      enabled: false,
    },
    'custom-output-device': {
      enabled: true,
      output: 'default',
      devices: {
        default:
          'Default - Altavoces (Intel\u00ae Smart Sound Technology for I2S Audio)',
        communications:
          'Communications - Altavoces (Intel\u00ae Smart Sound Technology for I2S Audio)',
        '015da4b3567009921d93bb21ea20a748f3f4e0dc421a3d6344d1d8e6fdc9b5d3':
          'Altavoces (Intel\u00ae Smart Sound Technology for I2S Audio)',
        d8b0a32ae4278aaadbd717e82ac148ad351c07c5cc80f16477d7185badb3b4d8:
          'Headphones (WF-C710N) (Bluetooth)',
        '75fd8a17c2a4e7d66b4d608f322ec6c3960ecff97bece9ba0f3ba46651866274':
          'Headphones (2- MOMENTUM 4) (3542:1000)',
        '8089dbb1875b5fa927049f1d8097572e75249eb83b278465e95a0d82f0fd3958':
          'Altavoces (USBMIC1) (5678:1234)',
        ec8ab4f57504376c2d7cc3b398752a77b08e4eb08288b4c34a84d6bd10afb2cc:
          'H/K AV AMP (HD Audio Driver for Display Audio)',
      },
    },
    'skip-silences': {
      enabled: true,
    },
    'synced-lyrics': {
      enabled: true,
      preciseTiming: true,
      showLyricsEvenIfInexact: true,
      showTimeCodes: false,
      defaultTextString: '\u266a',
      lineEffect: 'fancy',
      romanization: false,
      preferredProvider: 'YTMusic',
    },
    visualizer: {
      enabled: false,
    },
    'blur-nav-bar': {
      enabled: true,
    },
    adblocker: {
      enabled: false,
    },
    'ambient-mode': {
      enabled: false,
    },
    downloader: {
      enabled: false,
      downloadOnFinish: {
        enabled: false,
        seconds: 20,
        percent: 10,
        mode: 'seconds',
      },
      selectedPreset: 'Source',
      customPresetSetting: {
        extension: 'mp3',
        ffmpegArgs: ['-b:a', '256k'],
      },
      skipExisting: false,
    },
    'music-together': {
      enabled: false,
    },
    navigation: {
      enabled: false,
    },
    shortcuts: {
      enabled: false,
      overrideMediaKeys: true,
      global: {
        previous: 'Left',
        playPause: '',
        next: 'Right',
      },
      local: {
        previous: '',
        playPause: '',
        next: '',
      },
    },
    'taskbar-mediacontrol': {
      enabled: false,
    },
    'transparent-player': {
      enabled: false,
      opacity: 0.5,
      type: 'mica',
    },
    'quality-changer': {
      enabled: true,
    },
    'in-app-menu': {
      enabled: true,
    },
    sponsorblock: {
      enabled: true,
    },
  },
};
