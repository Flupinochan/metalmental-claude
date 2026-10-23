// snap や版管理ツールの shim 経由の go などは起動に 0.4 秒以上かかり、500ms では打ち切られたため
export const VERSION_COMMAND_TIMEOUT_MS = 3000;
