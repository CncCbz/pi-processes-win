import type * as nodeFs from "node:fs";
import { existsSync } from "node:fs";
import { getShellConfig } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { resolveShellSpawnConfig } from "./command-executor";

vi.mock("@mariozechner/pi-coding-agent", () => ({
  getShellConfig: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  return { ...actual, existsSync: vi.fn() };
});

const existsSyncMock = vi.mocked(existsSync);
const getShellConfigMock = vi.mocked(getShellConfig);

describe("resolveShellSpawnConfig", () => {
  it("prefers the extension shell override over Pi auto shell resolution", () => {
    existsSyncMock.mockReturnValue(true);
    getShellConfigMock.mockReturnValue({
      shell: "C:/Pi/Git/bin/bash.exe",
      args: ["-c"],
    });

    const resolved = resolveShellSpawnConfig({
      cwd: "D:/work/project",
      configuredShell: "C:/ext/bash.exe",
    });

    expect(getShellConfigMock).not.toHaveBeenCalled();
    expect(resolved).toEqual({
      shell: "C:/ext/bash.exe",
      args: ["-c"],
    });
  });

  it("throws when the extension shell override does not exist", () => {
    existsSyncMock.mockReturnValue(false);

    expect(() =>
      resolveShellSpawnConfig({
        cwd: "D:/work/project",
        configuredShell: "C:/missing/bash.exe",
      }),
    ).toThrow(/Configured shell path not found/i);
  });

  it("delegates auto shell resolution to Pi when no override is set", () => {
    getShellConfigMock.mockReturnValue({
      shell: "C:/Pi/Git/bin/bash.exe",
      args: ["-c"],
    });

    const resolved = resolveShellSpawnConfig({
      cwd: "D:/work/project",
    });

    expect(getShellConfigMock).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual({
      shell: "C:/Pi/Git/bin/bash.exe",
      args: ["-c"],
    });
  });
});
