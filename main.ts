import { Plugin } from "obsidian";

export default class PluginExperiment extends Plugin {
  onload(): void {
    console.log("Plugin Experiment loaded");
  }

  onunload(): void {
    console.log("Plugin Experiment unloaded");
  }
}
