// Uses node:child_process directly instead of pi.exec() because process
// management requires long-lived streaming processes with stdin/stdout piping
// and detached process groups, which pi.exec() does not support.

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { getShellConfig } from "@mariozechner/pi-coding-agent";

interface ResolveShellConfigOptions {
  cwd: string;
  configuredShell?: string;
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

  return spawn(shell, [...args, command], {
    cwd,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });
}
