#!/bin/bash
log_dir="${CLAUDE_PLUGIN_DATA}/logs"
mkdir -p "$log_dir"
jq -c . >> "$log_dir/$(date +%Y%m%d).log"
