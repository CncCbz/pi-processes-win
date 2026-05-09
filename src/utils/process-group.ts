import { spawnSync } from "node:child_process";

interface WindowsProcessRow {
  pid: number;
  parentPid: number;
}

const windowsDescendantCache = new Map<number, Set<number>>();

function isWindowsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function getWindowsProcessRows(): WindowsProcessRow[] {
  const script =
    'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId)" }';
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, parentPid] = line.split(",").map((value) => Number(value));
      return { pid, parentPid };
    })
    .filter(
      (row) =>
        Number.isInteger(row.pid) &&
        row.pid > 0 &&
        Number.isInteger(row.parentPid),
    );
}

function getWindowsDescendantPids(pid: number): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const row of getWindowsProcessRows()) {
    const children = childrenByParent.get(row.parentPid) ?? [];
    children.push(row.pid);
    childrenByParent.set(row.parentPid, children);
  }

  const descendants: number[] = [];
  const seen = new Set<number>([pid]);
  const queue = [pid];

  while (queue.length > 0) {
    const current = queue.shift() ?? -1;
    for (const childPid of childrenByParent.get(current) ?? []) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      descendants.push(childPid);
      queue.push(childPid);
    }
  }

  return descendants;
}

function rememberWindowsDescendants(pid: number, descendants: number[]): void {
  if (descendants.length === 0) return;
  const cached = windowsDescendantCache.get(pid) ?? new Set<number>();
  for (const descendantPid of descendants) {
    cached.add(descendantPid);
  }
  windowsDescendantCache.set(pid, cached);
}

function getCachedAliveWindowsDescendants(pid: number): number[] {
  const cached = windowsDescendantCache.get(pid);
  if (!cached) return [];

  const alive = [...cached].filter((descendantPid) =>
    isWindowsPidAlive(descendantPid),
  );
  if (alive.length === 0) {
    windowsDescendantCache.delete(pid);
  } else {
    windowsDescendantCache.set(pid, new Set(alive));
  }
  return alive;
}

function runWindowsTaskkill(pid: number, signal: NodeJS.Signals) {
  const args =
    signal === "SIGKILL"
      ? ["/F", "/T", "/PID", String(pid)]
      : ["/T", "/PID", String(pid)];

  return spawnSync("taskkill", args, {
    stdio: "ignore",
    windowsHide: true,
  });
}

/**
 * Check if a managed process is still alive.
 *
 * - Unix: the detached child PID is also the process-group leader, so probe the
 *   whole group first and fall back to the direct PID when needed.
 * - Windows: probe the root process PID, then descendants observed under that
 *   root. The descendant cache covers shells that exit before their child does.
 */
export function isProcessAlive(pid: number): boolean {
  if (process.platform === "win32") {
    const directAlive = isWindowsPidAlive(pid);
    const cachedAlive = getCachedAliveWindowsDescendants(pid);

    if (directAlive) {
      rememberWindowsDescendants(pid, getWindowsDescendantPids(pid));
      return true;
    }

    if (cachedAlive.length > 0) {
      return true;
    }

    const descendants = getWindowsDescendantPids(pid);
    rememberWindowsDescendants(pid, descendants);
    return descendants.some((descendantPid) =>
      isWindowsPidAlive(descendantPid),
    );
  }

  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "ESRCH") {
      try {
        process.kill(pid, 0);
        return true;
      } catch (directError) {
        return (directError as NodeJS.ErrnoException).code === "EPERM";
      }
    }

    // EPERM: exists, but we can't signal it.
    return err.code === "EPERM";
  }
}

/**
 * Terminate a managed process and its descendants.
 *
 * - Unix: signals the detached process group.
 * - Windows: uses taskkill to terminate the process tree. SIGTERM is attempted
 *   without /F so processes get a chance to exit before the caller escalates to
 *   SIGKILL.
 */
export function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    const descendantsBefore = getWindowsDescendantPids(pid);
    rememberWindowsDescendants(pid, descendantsBefore);

    const result = runWindowsTaskkill(pid, signal);
    if (result.error) {
      throw result.error;
    }

    const descendantPids = new Set([
      ...descendantsBefore,
      ...getCachedAliveWindowsDescendants(pid),
      ...getWindowsDescendantPids(pid),
    ]);

    for (const descendantPid of [...descendantPids].reverse()) {
      const childResult = runWindowsTaskkill(descendantPid, signal);
      if (childResult.error) {
        throw childResult.error;
      }
    }

    if (signal === "SIGKILL") {
      const stillAlive =
        isWindowsPidAlive(pid) ||
        getCachedAliveWindowsDescendants(pid).some((descendantPid) =>
          isWindowsPidAlive(descendantPid),
        );
      if (stillAlive) {
        throw new Error(`taskkill failed with exit code ${result.status}`);
      }
      windowsDescendantCache.delete(pid);
    }

    return;
  }

  try {
    process.kill(-pid, signal);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ESRCH") {
      throw err;
    }

    process.kill(pid, signal);
  }
}
