// Uses node:child_process directly instead of pi.exec() because process
// management requires long-lived streaming processes with stdin/stdout piping
// and detached process groups, which pi.exec() does not support.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { getShellConfig } from "@mariozechner/pi-coding-agent";

interface ResolveShellConfigOptions {
  cwd: string;
  configuredShell?: string;
}

const WINDOWS_CMD_SHIMS = new Set([
  "npm",
  "npx",
  "pnpm",
  "pnpx",
  "yarn",
  "yarnpkg",
]);
const windowsCmdShimCache = new Map<string, boolean>();

function hasWindowsCmdShim(command: string): boolean {
  const cached = windowsCmdShimCache.get(command);
  if (cached !== undefined) {
    return cached;
  }

  const result = spawnSync("where", [`${command}.cmd`], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1000,
  });
  const exists = result.status === 0 && result.stdout.trim().length > 0;
  windowsCmdShimCache.set(command, exists);
  return exists;
}

export function normalizeShellCommandForWindows(
  command: string,
  shell: string,
  hasCmdShim: (command: string) => boolean = hasWindowsCmdShim,
): string {
  if (process.platform !== "win32") {
    return command;
  }

  if (basename(shell).toLowerCase() !== "bash.exe") {
    return command;
  }

  const match = command.match(
    /^((?:(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+))\s+)*)(([^\s]+))(.*)$/,
  );
  if (!match) {
    return command;
  }

  const [, envPrefix, rawCommand, commandName, suffix] = match;
  if (!WINDOWS_CMD_SHIMS.has(commandName)) {
    return command;
  }

  if (!hasCmdShim(commandName)) {
    return command;
  }

  return `${envPrefix}${rawCommand}.cmd${suffix}`;
}

export function resolveShellSpawnConfig({
  cwd: _cwd,
  configuredShell,
}: ResolveShellConfigOptions): { shell: string; args: string[] } {
  if (configuredShell) {
    if (!existsSync(configuredShell)) {
      throw new Error(`Configured shell path not found: ${configuredShell}`);
    }

    return {
      shell: configuredShell,
      args: ["-c"],
    };
  }

  return getShellConfig();
}

export function spawnCommand(
  command: string,
  cwd: string,
  configuredShell?: string,
): ChildProcess {
  const { shell, args } = resolveShellSpawnConfig({
    cwd,
    configuredShell,
  });

  return spawn(
    shell,
    [...args, normalizeShellCommandForWindows(command, shell)],
    {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    },
  );
}
