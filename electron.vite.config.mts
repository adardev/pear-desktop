import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'electron-vite';
import builtinModules from 'builtin-modules';

import Inspect from 'vite-plugin-inspect';
import solidPlugin from 'vite-plugin-solid';
import viteResolve from 'vite-plugin-resolve';

import { withFilter, type UserConfig } from 'vite';

import { pluginVirtualModuleGenerator } from './vite-plugins/plugin-importer.mjs';
import pluginLoader from './vite-plugins/plugin-loader.mjs';
import { i18nImporter } from './vite-plugins/i18n-importer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const resolveAlias = {
  '@': resolve(__dirname, './src'),
  '@assets': resolve(__dirname, './assets'),
};

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  const mainConfig: UserConfig = {
    plugins: [
      pluginLoader('backend'),
      viteResolve({
        'virtual:i18n': i18nImporter(),
        'virtual:plugins': pluginVirtualModuleGenerator('main'),
      }),
    ],
    publicDir: 'assets',
    build: {
      externalizeDeps: false,
      lib: {
        entry: 'src/index.ts',
        formats: ['cjs'],
      },
      outDir: 'dist/main',
      rollupOptions: {
        external: [
          'electron',
          'custom-electron-prompt',
          'electron-unhandled',
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
        ],
        input: './src/index.ts',
      },
      minify: !isDev,
      cssMinify: !isDev,
      sourcemap: isDev ? 'inline' : undefined,
    },
    resolve: {
      alias: resolveAlias,
    },
  };

  const preloadConfig: UserConfig = {
    plugins: [
      pluginLoader('preload'),
      viteResolve({
        'virtual:i18n': i18nImporter(),
        'virtual:plugins': pluginVirtualModuleGenerator('preload'),
      }),
    ],
    build: {
      externalizeDeps: false,
      lib: {
        entry: 'src/preload.ts',
        formats: ['cjs'],
      },
      outDir: 'dist/preload',
      commonjsOptions: {
        ignoreDynamicRequires: true,
      },
      rollupOptions: {
        external: [
          'electron',
          'custom-electron-prompt',
          'electron-unhandled',
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
        ],
        input: './src/preload.ts',
      },
      minify: !isDev,
      cssMinify: !isDev,
      sourcemap: isDev ? 'inline' : undefined,
    },
    resolve: {
      alias: resolveAlias,
    },
  };

  const rendererConfig: UserConfig = {
    plugins: [
      pluginLoader('renderer'),
      viteResolve({
        'virtual:i18n': i18nImporter(),
        'virtual:plugins': pluginVirtualModuleGenerator('renderer'),
      }),
      withFilter(solidPlugin(), {
        load: { id: [/\.(tsx|jsx)$/, '/@solid-refresh'] },
      }),
    ],
    root: './src/',
    build: {
      lib: {
        entry: 'src/index.html',
        formats: ['iife'],
        name: 'renderer',
      },
      outDir: 'dist/renderer',
      rollupOptions: {
        external: ['electron', ...builtinModules],
        input: './src/index.html',
      },
      minify: !isDev,
      cssMinify: !isDev,
      sourcemap: isDev ? 'inline' : undefined,
    },
    resolve: {
      alias: resolveAlias,
    },
    server: {
      cors: {
        origin: 'https://music.\u0079\u006f\u0075\u0074\u0075\u0062\u0065.com',
      },
    },
  };

  if (isDev) {
    mainConfig.plugins?.push(
      Inspect({
        build: true,
        outputDir: join(__dirname, '.vite-inspect/backend'),
      }),
    );
    preloadConfig.plugins?.push(
      Inspect({
        build: true,
        outputDir: join(__dirname, '.vite-inspect/preload'),
      }),
    );
    rendererConfig.plugins?.push(
      Inspect({
        build: true,
        outputDir: join(__dirname, '.vite-inspect/renderer'),
      }),
    );
  }

  return {
    main: mainConfig,
    preload: preloadConfig,
    renderer: rendererConfig,
  };
});
