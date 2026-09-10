# Claude Code Plugin

## Install

```bash
# Launch Claude
claude

# Add this marketplace
/plugin marketplace add https://github.com/Flupinochan/metalmental-claude

# Reload plugins
/reload-plugins
```

## Plugins

### git-github-workflow

```bash
/plugin install git-github-workflow@metalmental-plugins-official
/git-github-workflow:commit-enforce
/git-github-workflow:create-worktree-and-branch
/git-github-workflow:create-pull-request
```

### verified-web-search

```bash
/plugin install verified-web-search@metalmental-plugins-official
/verified-web-search:web-search <query>
```

### tool-failure-log

```bash
/plugin install tool-failure-log@metalmental-plugins-official
/tool-failure-log:clear-tool-failure-logs
/tool-failure-log:analyze-tool-failures
```

### session-daily-report

```bash
/plugin install session-daily-report@metalmental-plugins-official
/session-daily-report:daily-report [YYYY-MM-DD]
```

### local-doc-search

```bash
/plugin install local-doc-search@metalmental-plugins-official
/local-doc-search:local-search-setup
/local-doc-search:local-search <query>
```

### sandbox-enforce

```bash
/plugin install sandbox-enforce@metalmental-plugins-official
/sandbox-enforce:enable-sandbox-everywhere
```

### ask-user-question-enforce

```bash
/plugin install ask-user-question-enforce@metalmental-plugins-official
/ask-user-question-enforce:ask-user-question-enforce
```

### career-transition-support

```bash
/plugin install career-transition-support@metalmental-plugins-official
/career-transition-support:jp-resume-writer
/career-transition-support:jp-job-posting-analyzer
/career-transition-support:jp-portfolio-case-study
```

## develop

```bash
claude --plugin-dir ./plugins/session-daily-report
```
