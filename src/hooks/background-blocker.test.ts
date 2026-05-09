import { describe, expect, it } from "vitest";
import { hasBackgroundCommand } from "./background-blocker";

describe("hasBackgroundCommand", () => {
  it("detects bash background commands", () => {
    expect(hasBackgroundCommand("npm run dev &")).toBe(true);
    expect(hasBackgroundCommand("nohup npm run dev")).toBe(true);
  });

  it("detects Windows background launchers", () => {
    expect(hasBackgroundCommand("cmd /c start npm run dev")).toBe(true);
    expect(
      hasBackgroundCommand(
        'powershell -NoProfile -Command "Start-Process npm -ArgumentList run,dev"',
      ),
    ).toBe(true);
    expect(hasBackgroundCommand("Start-Job { npm run dev }")).toBe(true);
  });

  it("does not treat npm start as a background launcher", () => {
    expect(hasBackgroundCommand("npm start")).toBe(false);
  });
});
