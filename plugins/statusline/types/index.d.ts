export type RateLimit = {
  readonly kind: string;
  readonly percentUsed: number;
  readonly resetsAt?: string;
};

export type ReloadStatus = "idle" | "loading" | "done" | "failed";

export type GitStatus = "unpushed" | "uncommitted" | "clean" | "no-git";

export type CtxUsage = { readonly percent?: number };

export type OutputStyle = { readonly name?: string };

export type PullRequestState = "OPEN" | "DRAFT" | "MERGED" | "CLOSED";

export type PullRequest = {
  readonly number: number;
  readonly state: PullRequestState;
  readonly url: string;
};

declare module "claude-code" {
  interface PluginState {
    statusline: {
      readonly reloadStatus: ReloadStatus;
      readonly gitStatus?: GitStatus;
      readonly workingDirectory: string;
      readonly branchName: string;
      readonly nodeVersion: string;
      readonly pythonVersion: string;
      readonly rustVersion: string;
      readonly goVersion: string;
      readonly bunVersion: string;
      readonly terraformVersion: string;
      readonly pullRequests: readonly PullRequest[];
      readonly modelId: string;
      readonly outputStyle: OutputStyle;
      readonly ctx: CtxUsage;
      readonly rateLimits: readonly RateLimit[];
      readonly reviewedCommands: readonly string[];
    };
  }
}
