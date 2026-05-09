/**
 * Blocks shell background commands (e.g. `cmd &`, `nohup cmd`,
 * `cmd /c start`, `Start-Process`) and guides the model to use the process
 * tool instead.
 *
 * Opt-in via config: `interception.blockBackgroundCommands`.
 */

import { parse } from "@aliou/sh";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { walkCommands, wordToString } from "../utils/shell-utils";

const BACKGROUND_CMD_NAMES = new Set(["nohup", "disown", "setsid"]);
const BACKGROUND_PATTERN = /&\s*$/;
const WINDOWS_BACKGROUND_PATTERNS = [
  /(?:^|[;&|]\s*)cmd(?:\.exe)?\s+\/[cq]\s+start\b/i,
  /(?:^|[;&|]\s*)start(?:\s+["'][^"']*["'])?\s+\S/i,
  /(?:^|[;&|]\s*)(?:powershell|pwsh)(?:\.exe)?\b[^\n]*\b(?:Start-Process|Start-Job)\b/i,
  /\b(?:Start-Process|Start-Job)\b/i,
];

export function hasBackgroundCommand(command: string): boolean {
  if (WINDOWS_BACKGROUND_PATTERNS.some((pattern) => pattern.test(command))) {
    return true;
  }

  try {
    const { ast } = parse(command);

    // Check statement-level background flag (cmd &)
    for (const stmt of ast.body) {
      if (stmt.background) {
        return true;
      }
    }

    // Check for nohup/disown/setsid as command names
    let hasBackground = false;
    walkCommands(ast, (cmd) => {
      const name = cmd.words?.[0] ? wordToString(cmd.words[0]) : undefined;
      if (name && BACKGROUND_CMD_NAMES.has(name)) {
        hasBackground = true;
        return true;
      }
      return false;
    });
    return hasBackground;
  } catch {
    // Fallback to regex on parse failure
    return BACKGROUND_PATTERN.test(command);
  }
}

export function setupBackgroundBlocker(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    if (hasBackgroundCommand(command)) {
      ctx.ui?.notify(
        "Blocked background command. Use the process tool instead.",
        "warning",
      );

      return {
        block: true,
        reason:
          "Background commands (&, nohup, disown, setsid, start, Start-Process, Start-Job) are not supported. " +
          'Use the "process" tool with action "start" to run commands in the background. ' +
          'Example: process({ action: "start", name: "my-server", command: "npm run dev" })',
      };
    }

    return;
  });
}
