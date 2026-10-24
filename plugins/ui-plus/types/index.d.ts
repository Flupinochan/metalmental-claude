export type TableCopyResult = "success" | "failed";

declare module "claude-code" {
  interface PluginState {
    "ui-plus": {
      readonly tableCopyResults: Readonly<Record<string, TableCopyResult>>;
    };
  }
}
