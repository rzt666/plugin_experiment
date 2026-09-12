import { Plugin } from "obsidian";

export default class PluginExperiment extends Plugin {
  onload(): void {
    console.log("Find, Don't Search — loaded");
  }

  onunload(): void {
    console.log("Find, Don't Search — unloaded");
  }
}
