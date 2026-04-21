import { spawnSync } from "node:child_process";

/**
 * Check if a managed process is still alive.
 *
 * - Unix: the detached child PID is also the process-group leader, so probe the
 *   whole group first and fall back to the direct PID when needed.
 * - Windows: probe the root process PID directly.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      process.kill(pid, 0);
      return true;
    }

    process.kill(-pid, 0);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (process.platform === "win32") {
      return err.code === "EPERM";
    }

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
 * - Windows: uses taskkill to reliably terminate the process tree.
 */
export function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
      stdio: "ignore",
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0 && isProcessAlive(pid)) {
      throw new Error(`taskkill failed with exit code ${result.status}`);
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
