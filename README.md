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

### claude-only-commit-workflow-plugin

```bash
/plugin install claude-only-commit-workflow-plugin@metalmental-plugins-official
/commit
```

### web-search-plugin

```bash
/plugin install web-search-plugin@metalmental-plugins-official
/web-search-plugin:web-search <query>
```

### tool-failure-logger-plugin

```bash
/plugin install tool-failure-logger-plugin@metalmental-plugins-official
/tool-failure-logger-plugin:clear-tool-failure-logs
/tool-failure-logger-plugin:analyze-tool-failures
```

### daily-report-plugin

```bash
/plugin install daily-report-plugin@metalmental-plugins-official
/daily-report-plugin:daily-report [YYYY-MM-DD]
```

### local-search-plugin

```bash
/plugin install local-search-plugin@metalmental-plugins-official
/local-search-plugin:local-search-setup
/local-search-plugin:local-search <query>
```

## develop

```bash
claude --plugin-dir ./plugins/daily-report-plugin
```
