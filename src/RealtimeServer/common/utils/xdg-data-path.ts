import * as path from 'path';

/**
 * Resolves a path used for diagnostic output (activity logs, resource reports). The path can be overridden by an
 * environment variable; otherwise it falls back to the XDG Base Directory data location, then $HOME/.local/share,
 * then the current working directory.
 *
 * @param overrideEnvVarName Name of an environment variable that, if set to a non-empty value, is used as the
 * resolved path directly.
 * @param fallbackName Directory or file name joined onto the XDG_DATA_HOME/HOME/cwd fallback locations.
 */
export function resolveXdgDataPath(overrideEnvVarName: string, fallbackName: string): string {
  const requestedPath: string | undefined = process.env[overrideEnvVarName];
  if (isStringPopulated(requestedPath)) return requestedPath;

  const xdgDataDir: string | undefined = process.env['XDG_DATA_HOME'];
  if (isStringPopulated(xdgDataDir)) return path.join(xdgDataDir, fallbackName);

  const home: string | undefined = process.env['HOME'];
  if (isStringPopulated(home)) return path.join(home, '.local', 'share', fallbackName);

  return path.join(process.cwd(), fallbackName);
}

export function isStringPopulated(value: string | undefined): value is string {
  return value != null && value !== '';
}
