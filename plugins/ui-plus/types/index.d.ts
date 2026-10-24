export type CopyResult = "success" | "failed";

export interface TurnState {
  readonly isRunning: boolean;
  readonly hasEnded: boolean;
  readonly toolUseIds: readonly string[];
}

declare module "claude-code" {
  interface PluginState {
    "ui-plus": {
      readonly copyResults: Readonly<Record<string, CopyResult>>;
      readonly turn: TurnState;
      readonly foldOverrides: Readonly<Record<string, boolean>>;
    };
  }
}
