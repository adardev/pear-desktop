import { basename, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFileSync, existsSync } from 'node:fs';
import { globSync } from 'glob';
import { Project, ts } from 'ts-morph';

// HACK: DO NOT USE @ ALIAS IN THIS FILE, IT WILL CAUSE PROBLEMS
import { Platform } from '../src/types/plugins';

const kebabToCamel = (text: string) =>
  text.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

const __dirname = dirname(fileURLToPath(import.meta.url));

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const globalProject = new Project({
  tsConfigFilePath: resolve(__dirname, '..', 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
  skipLoadingLibFiles: true,
  skipFileDependencyResolution: true,
});

function getPropertyByName(objExpr: any, name: string) {
  for (const prop of objExpr.getProperties()) {
    const kind = prop.getKind();
    if (kind === ts.SyntaxKind.PropertyAssignment || kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
      const nameNode = prop.getNameNode();
      let propName = '';
      if (nameNode.getKind() === ts.SyntaxKind.StringLiteral) {
        propName = nameNode.getLiteralText();
      } else {
        propName = nameNode.getText();
      }
      if (propName === name) {
        return prop;
      }
    }
  }
  return undefined;
}

function findExportedDeclaration(file: any, name: string, project: any, filesToCleanup: any[], visited = new Set<string>()): any {
  const filePath = file.getFilePath();
  if (visited.has(filePath)) return undefined;
  visited.add(filePath);

  // 1. Check direct exported declarations
  const exported = file.getExportedDeclarations().get(name);
  if (exported && exported.length > 0) {
    return { decl: exported[0], file };
  }

  // 2. Check variable declarations
  const localDecl = file.getVariableDeclaration(name);
  if (localDecl) {
    return { decl: localDecl, file };
  }

  // 3. Resolve wildcard exports: export * from "..."
  for (const expDecl of file.getExportDeclarations()) {
    if (expDecl.isTypeOnly()) continue;
    const moduleSpecifier = expDecl.getModuleSpecifierValue();
    if (!moduleSpecifier) continue;

    const currentDirPath = dirname(file.getFilePath());
    let resolvedPath = '';
    if (moduleSpecifier.startsWith('.')) {
      resolvedPath = resolve(currentDirPath, moduleSpecifier);
    } else {
      try {
        const resolvedModule = require.resolve(moduleSpecifier, { paths: [currentDirPath] });
        if (existsSync(resolvedModule)) {
          const dtsPath = resolvedModule.replace(/\.[cm]?js$/, '.d.ts');
          resolvedPath = existsSync(dtsPath) ? dtsPath : resolvedModule;
        }
      } catch {}
    }

    if (!resolvedPath) continue;

    let targetFilePath = '';
    if (existsSync(resolvedPath)) {
      targetFilePath = resolvedPath;
    } else {
      const extensions = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '/index.ts', '/index.js', '/index.d.ts'];
      for (const ext of extensions) {
        const pathWithExt = resolvedPath + ext;
        if (existsSync(pathWithExt)) {
          targetFilePath = pathWithExt;
          break;
        }
      }
    }

    if (targetFilePath) {
      try {
        const targetContent = readFileSync(targetFilePath, 'utf8');
        const targetFile = project.createSourceFile(
          resolve(dirname(targetFilePath), '_temp_wildcard_' + visited.size + '_' + basename(targetFilePath)),
          targetContent,
          { overwrite: true },
        );
        filesToCleanup.push(targetFile);

        const result = findExportedDeclaration(targetFile, name, project, filesToCleanup, visited);
        if (result) {
          return result;
        }
      } catch {}
    }
  }

  return undefined;
}

function resolveObjectLiteral(obj: any, currentFile: any, filesToCleanup: any[], depth: number) {
  for (const prop of obj.getProperties()) {
    if (prop.getKind() === ts.SyntaxKind.PropertyAssignment) {
      const propAssign = prop as any;
      const init = propAssign.getInitializer();
      if (init) {
        const resolvedInit = resolveValue(init, currentFile, filesToCleanup, depth + 1);
        if (resolvedInit && resolvedInit !== init) {
          propAssign.setInitializer(resolvedInit.getText());
        }
      }
    }
  }
}

function resolveValue(node: any, currentFile: any, filesToCleanup: any[], depth: number): any {
  if (depth > 10) return node;

  while (true) {
    if (
      node.getKind() === ts.SyntaxKind.AsExpression ||
      node.getKindName() === 'SatisfiesExpression'
    ) {
      node = (node as any).getExpression();
    } else if (node.getKind() === ts.SyntaxKind.Identifier) {
      const name = node.getText();
      // 1. Check local variable declarations
      const localDecl = currentFile.getVariableDeclaration(name);
      if (localDecl) {
        const init = localDecl.getInitializer();
        if (init) {
          node = init;
          continue;
        }
      }

      // 2. Check local imports
      const importSpec = currentFile.getImportDeclarations()
        .flatMap((id) => id.getNamedImports())
        .find((spec) => spec.getName() === name);

      if (importSpec) {
        const importDecl = importSpec.getImportDeclaration();
        const moduleSpecifier = importDecl.getModuleSpecifierValue();
        const currentDirPath = dirname(currentFile.getFilePath());
        
        let resolvedPath = '';
        if (moduleSpecifier.startsWith('.')) {
          resolvedPath = resolve(currentDirPath, moduleSpecifier);
        } else if (moduleSpecifier.startsWith('@/')) {
          resolvedPath = resolve(__dirname, '..', 'src', moduleSpecifier.slice(2));
        } else {
          try {
            const resolvedModule = require.resolve(moduleSpecifier, { paths: [currentDirPath] });
            if (existsSync(resolvedModule)) {
              const dtsPath = resolvedModule.replace(/\.[cm]?js$/, '.d.ts');
              resolvedPath = existsSync(dtsPath) ? dtsPath : resolvedModule;
            }
          } catch {}
        }
        
        if (resolvedPath) {
          let targetFilePath = '';
          if (existsSync(resolvedPath)) {
            targetFilePath = resolvedPath;
          } else {
            const extensions = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '/index.ts', '/index.js', '/index.d.ts'];
            for (const ext of extensions) {
              const pathWithExt = resolvedPath + ext;
              if (existsSync(pathWithExt)) {
                targetFilePath = pathWithExt;
                break;
              }
            }
          }
          
          if (targetFilePath) {
            try {
              const targetContent = readFileSync(targetFilePath, 'utf8');
              const targetFile = globalProject.createSourceFile(
                resolve(dirname(targetFilePath), '_temp_imp_resolved_' + depth + '_' + basename(targetFilePath)),
                targetContent,
                { overwrite: true },
              );
              filesToCleanup.push(targetFile);
              
              const found = findExportedDeclaration(targetFile, name, globalProject, filesToCleanup);
              if (found) {
                if (found.decl.getKind() === ts.SyntaxKind.VariableDeclaration) {
                  const init = (found.decl as any).getInitializer();
                  if (init) {
                    currentFile = found.file;
                    node = init;
                    continue;
                  }
                } else if (found.decl.getKind() === ts.SyntaxKind.EnumDeclaration) {
                  currentFile = found.file;
                  node = found.decl;
                  break;
                }
              }
            } catch {}
          }
        }
      }
      break;
    } else if (node.getKind() === ts.SyntaxKind.PropertyAccessExpression) {
      const propAccess = node;
      const expression = propAccess.getExpression();
      const nameNode = propAccess.getNameNode();
      const memberName = nameNode.getText();

      if (expression.getKind() === ts.SyntaxKind.Identifier) {
        const enumName = expression.getText();
        let enumDecl = currentFile.getEnum(enumName);
        if (!enumDecl) {
          const importSpec = currentFile.getImportDeclarations()
            .flatMap((id) => id.getNamedImports())
            .find((spec) => spec.getName() === enumName);

          if (importSpec) {
            const importDecl = importSpec.getImportDeclaration();
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            const currentDirPath = dirname(currentFile.getFilePath());
            
            let resolvedPath = '';
            if (moduleSpecifier.startsWith('.')) {
              resolvedPath = resolve(currentDirPath, moduleSpecifier);
            } else if (moduleSpecifier.startsWith('@/')) {
              resolvedPath = resolve(__dirname, '..', 'src', moduleSpecifier.slice(2));
            } else {
              try {
                const resolvedModule = require.resolve(moduleSpecifier, { paths: [currentDirPath] });
                if (existsSync(resolvedModule)) {
                  const dtsPath = resolvedModule.replace(/\.[cm]?js$/, '.d.ts');
                  resolvedPath = existsSync(dtsPath) ? dtsPath : resolvedModule;
                }
              } catch {}
            }
            
            if (resolvedPath) {
              let targetFilePath = '';
              if (existsSync(resolvedPath)) {
                targetFilePath = resolvedPath;
              } else {
                const extensions = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '/index.ts', '/index.js', '/index.d.ts'];
                for (const ext of extensions) {
                  const pathWithExt = resolvedPath + ext;
                  if (existsSync(pathWithExt)) {
                    targetFilePath = pathWithExt;
                    break;
                  }
                }
              }
              
              if (targetFilePath) {
                try {
                  const targetContent = readFileSync(targetFilePath, 'utf8');
                  const targetFile = globalProject.createSourceFile(
                    resolve(dirname(targetFilePath), '_temp_enum_' + depth + '_' + basename(targetFilePath)),
                    targetContent,
                    { overwrite: true },
                  );
                  filesToCleanup.push(targetFile);
                  
                  const found = findExportedDeclaration(targetFile, enumName, globalProject, filesToCleanup);
                  if (found && found.decl.getKind() === ts.SyntaxKind.EnumDeclaration) {
                    enumDecl = found.decl;
                  }
                } catch {}
              }
            }
          }
        }

        if (enumDecl) {
          const member = enumDecl.getMember(memberName);
          if (member) {
            const init = member.getInitializer();
            if (init) {
              node = init;
              continue;
            } else {
              const index = enumDecl.getMembers().indexOf(member);
              const tempFile = globalProject.createSourceFile('_temp_literal_' + depth, index.toString());
              filesToCleanup.push(tempFile);
              return tempFile.getStatements()[0].getFirstChild();
            }
          }
        } else {
          const resolvedBase = resolveValue(expression, currentFile, filesToCleanup, depth + 1);
          if (resolvedBase && resolvedBase.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
            const prop = getPropertyByName(resolvedBase, memberName);
            if (prop && prop.getKind() === ts.SyntaxKind.PropertyAssignment) {
              const init = (prop as any).getInitializer();
              if (init) {
                node = init;
                continue;
              }
            }
          }
        }
      }
      break;
    } else if (node.getKind() === ts.SyntaxKind.ElementAccessExpression) {
      const elemAccess = node;
      const expression = elemAccess.getExpression();
      const argExpr = elemAccess.getArgumentExpression();

      if (expression.getKind() === ts.SyntaxKind.Identifier && argExpr) {
        const name = expression.getText();
        let propName = '';
        if (argExpr.getKind() === ts.SyntaxKind.StringLiteral) {
          propName = (argExpr as any).getLiteralText();
        } else {
          propName = argExpr.getText();
        }

        const resolvedBase = resolveValue(expression, currentFile, filesToCleanup, depth + 1);
        if (resolvedBase && resolvedBase.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
          const prop = getPropertyByName(resolvedBase, propName);
          if (prop && prop.getKind() === ts.SyntaxKind.PropertyAssignment) {
            const init = (prop as any).getInitializer();
            if (init) {
              node = init;
              continue;
            }
          }
        }
      }
      break;
    } else if (node.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
      resolveObjectLiteral(node, currentFile, filesToCleanup, depth);
      break;
    } else {
      break;
    }
  }

  return node;
}

function getPluginDefaultConfig(filePath: string) {
  const fileContent = readFileSync(filePath, 'utf8');
  const src = globalProject.createSourceFile(
    resolve(dirname(filePath), '_temp_imp_' + basename(filePath)),
    fileContent,
    { overwrite: true },
  );

  let objExpr: any;

  // Check for `export default ...`
  const defaultExportAssignment = src.getExportAssignment(
    (ea) => !ea.isExportEquals(),
  );

  if (defaultExportAssignment) {
    const expression = defaultExportAssignment.getExpression();
    if (expression.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
      objExpr = expression;
    } else if (expression.getKind() === ts.SyntaxKind.CallExpression) {
      const callExpr = expression.asKindOrThrow(ts.SyntaxKind.CallExpression);
      if (
        callExpr.getArguments().length === 1 &&
        callExpr.getExpression().getText() === 'createPlugin'
      ) {
        const arg = callExpr.getArguments()[0];
        if (arg.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
          objExpr = arg;
        }
      }
    }
  }

  // If not found via `export default`, check for a named export aliased as 'default'
  if (!objExpr) {
    const defaultExportDeclaration = src.getExportedDeclarations().get('default');
    if (defaultExportDeclaration && defaultExportDeclaration.length > 0) {
      const expr = defaultExportDeclaration[0];
      if (expr.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
        objExpr = expr;
      } else if (expr.getKind() === ts.SyntaxKind.CallExpression) {
        const callExpr = expr.asKindOrThrow(ts.SyntaxKind.CallExpression);
        if (
          callExpr.getArguments().length === 1 &&
          callExpr.getExpression().getText() === 'createPlugin'
        ) {
          const arg = callExpr.getArguments()[0];
          if (arg.getKind() === ts.SyntaxKind.ObjectLiteralExpression) {
            objExpr = arg;
          }
        }
      }
    }
  }

  let result = 'undefined';
  if (objExpr) {
    const configProp = objExpr.getProperty('config');
    if (configProp) {
      let initializer: any;
      if (configProp.getKind() === ts.SyntaxKind.PropertyAssignment) {
        initializer = (configProp as any).getInitializer();
      } else if (configProp.getKind() === ts.SyntaxKind.ShorthandPropertyAssignment) {
        initializer = (configProp as any).getNameNode();
      }

      if (initializer) {
        const filesToCleanup = [src];
        const resolvedInit = resolveValue(initializer, src, filesToCleanup, 0);
        result = resolvedInit.getText();
        for (const file of filesToCleanup) {
          globalProject.removeSourceFile(file);
        }
      }
    }
  }

  return result;
}

export const pluginVirtualModuleGenerator = (
  mode: 'main' | 'preload' | 'renderer',
) => {
  const srcPath = resolve(__dirname, '..', 'src');
  const plugins = globSync([
    'src/plugins/*/index.{js,ts,jsx,tsx}',
    'src/plugins/*.{js,ts,jsx,tsx}',
    '!src/plugins/utils/**/*',
    '!src/plugins/utils/*',
  ]).map((path) => {
    let name = basename(path);
    if (
      name === 'index.ts' ||
      name === 'index.js' ||
      name === 'index.jsx' ||
      name === 'index.tsx'
    ) {
      name = basename(resolve(path, '..'));
    }

    name = name.replace(extname(name), '');

    return { name, path };
  });

  const src = globalProject.createSourceFile(
    'vm:pluginIndexes',
    (writer) => {
      for (const { name, path } of plugins) {
        const absolutePath = resolve(srcPath, '..', path).replace(/\\/g, '/');
        if (mode === 'main') {
          // dynamic import (for main)
          writer.writeLine(
            `const ${kebabToCamel(name)}PluginImport = () => import('${absolutePath}');`,
          );
          writer.writeLine(
            `const ${kebabToCamel(name)}Plugin = async () => (await ${kebabToCamel(name)}PluginImport()).default;`,
          );
          writer.writeLine(
            `const ${kebabToCamel(name)}PluginStub = async () => (await ${kebabToCamel(name)}PluginImport()).pluginStub;`,
          );
        } else {
          // static import (preload does not support dynamic import)
          writer.writeLine(
            `import ${kebabToCamel(name)}PluginImport, { pluginStub as ${kebabToCamel(name)}PluginStubImport } from "${absolutePath}";`,
          );
          writer.writeLine(
            `const ${kebabToCamel(name)}Plugin = () => Promise.resolve(${kebabToCamel(name)}PluginImport);`,
          );
          writer.writeLine(
            `const ${kebabToCamel(name)}PluginStub = () => Promise.resolve(${kebabToCamel(name)}PluginStubImport);`,
          );
        }
      }

      writer.blankLine();
      if (mode === 'main' || mode === 'preload') {
        writer.writeLine("import is from 'electron-is';");
        writer.writeLine('globalThis.electronIs = is;');
      }
      writer.write(supportsPlatform.toString());
      writer.blankLine();

      // Context-specific exports
      writer.writeLine(`let ${mode}PluginsCache = null;`);
      writer.writeLine(`export const ${mode}Plugins = async () => {`);
      writer.writeLine(
        `  if (${mode}PluginsCache) return await ${mode}PluginsCache;`,
      );
      writer.writeLine(
        '  const { promise, resolve } = Promise.withResolvers();',
      );
      writer.writeLine('  ' + `${mode}PluginsCache = promise;`);
      writer.writeLine('  const pluginEntries = await Promise.all([');
      for (const { name } of plugins) {
        const checkMode = mode === 'main' ? 'backend' : mode;
        // HACK: To avoid situation like importing renderer plugins in main
        writer.writeLine(
          `    ${kebabToCamel(name)}Plugin().then((plg) => plg['${checkMode}'] ? ["${name}", plg] : null),`,
        );
      }
      writer.writeLine('  ]);');
      writer.writeLine(
        '  resolve(pluginEntries.filter((entry) => entry && supportsPlatform(entry[1])).reduce((acc, [name, plg]) => { acc[name] = plg; return acc; }, {}));',
      );
      writer.writeLine(`  return await ${mode}PluginsCache;`);
      writer.writeLine('};');
      writer.blankLine();

      // All plugins export (stub only) // Omit<Plugin, 'backend' | 'preload' | 'renderer'>
      writer.writeLine('let allPluginsCache = null;');
      writer.writeLine('export const allPlugins = async () => {');
      writer.writeLine('  if (allPluginsCache) return await allPluginsCache;');
      writer.writeLine(
        '  const { promise, resolve } = Promise.withResolvers();',
      );
      writer.writeLine('  allPluginsCache = promise;');
      writer.writeLine('  const stubEntries = await Promise.all([');
      for (const { name } of plugins) {
        writer.writeLine(
          `    ${kebabToCamel(name)}PluginStub().then((stub) => ["${name}", stub]),`,
        );
      }
      writer.writeLine('  ]);');
      writer.writeLine(
        '  resolve(stubEntries.filter(entry => entry && supportsPlatform(entry[1])).reduce((acc, [name, plg]) => { acc[name] = plg; return acc; }, {}));',
      );
      writer.writeLine('  return await promise;');
      writer.writeLine('};');
      writer.blankLine();

      writer.writeLine('export const pluginDefaults = {');
      for (const { name, path } of plugins) {
        const configText = getPluginDefaultConfig(resolve(srcPath, '..', path));
        writer.writeLine(`  "${name}": ${configText},`);
      }
      writer.writeLine('};');
      writer.blankLine();
    },
    { overwrite: true },
  );

  return src.getText();
};

function supportsPlatform({ platform }: { platform: string }) {
  if (typeof platform !== 'number') return true;

  const is = globalThis.electronIs;

  if (is.windows()) return (platform & Platform.Windows) !== 0;
  if (is.macOS()) return (platform & Platform.macOS) !== 0;
  if (is.linux()) return (platform & Platform.Linux) !== 0;
  if (is.freebsd()) return (platform & Platform.Freebsd) !== 0;

  // unknown platform
  return false;
}
