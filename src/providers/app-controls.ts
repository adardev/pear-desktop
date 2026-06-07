import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';

import * as config from '@/config';

export const restart = () => restartInternal();

export const setupAppControls = (win: BrowserWindow) => {
  ipcMain.off('peard:restart', restart);
  ipcMain.on('peard:restart', restart);

  ipcMain.removeHandler('peard:get-downloads-folder');
  ipcMain.handle('peard:get-downloads-folder', () => app.getPath('downloads'));

  ipcMain.removeAllListeners('peard:reload');
  ipcMain.on('peard:reload', () =>
    win.webContents.loadURL(config.get('url')),
  );

  ipcMain.removeHandler('peard:get-path');
  ipcMain.handle('peard:get-path', (_, ...args: string[]) =>
    path.join(...args),
  );

  // Global window controls
  ipcMain.removeAllListeners('window-minimize');
  ipcMain.on('window-minimize', () => {
    win.minimize();
  });

  ipcMain.removeAllListeners('window-maximize');
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.removeAllListeners('window-close');
  ipcMain.on('window-close', () => {
    win.close();
  });

  ipcMain.removeAllListeners('toggle-in-app-menu');
  ipcMain.on('toggle-in-app-menu', (event) => {
    event.sender.send('toggle-in-app-menu');
  });
};

function restartInternal() {
  app.relaunch({ execPath: process.env.PORTABLE_EXECUTABLE_FILE });
  // ExecPath will be undefined if not running portable app, resulting in default behavior
  app.quit();
}

function sendToFrontInternal(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

export const sendToFront =
  process.type === 'browser'
    ? sendToFrontInternal
    : () => {
        console.error('sendToFront called from renderer');
      };
