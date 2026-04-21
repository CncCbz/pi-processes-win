import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupProcessesCommands } from "./commands";
import { registerProcessesSettings } from "./commands/settings";
import { configLoader } from "./config";
import { setupProcessesHooks } from "./hooks";
import { ProcessManager } from "./manager";
import { setupProcessesTools } from "./tools";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  const manager = new ProcessManager({
    getConfiguredShellPath: () => configLoader.getConfig().execution.shellPath,
  });

  const config = configLoader.getConfig();

  const { update: updateWidget, dockActions } = setupProcessesHooks(
    pi,
    manager,
    config,
  );
  setupProcessesCommands(pi, manager, dockActions);
  setupProcessesTools(pi, manager);
  registerProcessesSettings(pi, () => {
    updateWidget();
  });
}
