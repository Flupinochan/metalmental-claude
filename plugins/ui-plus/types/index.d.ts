export type CopyResult = "success" | "failed";

declare module "claude-code" {
  interface PluginState {
    "ui-plus": {
      readonly copyResults: Readonly<Record<string, CopyResult>>;
    };
  }
}
