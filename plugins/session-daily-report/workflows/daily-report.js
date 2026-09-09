export const meta = {
  name: "daily-report-workflow",
  description:
    "全プロジェクトのセッション履歴JSONLを指定日(JST)で走査し、プロジェクトごとに要約した後、1本のタイムラインに集約する",
  phases: [
    { title: "Discover", detail: "対象となるセッションJSONLファイルを列挙" },
    { title: "Summarize", detail: "ファイルごとに対象日(JST)の活動を要約" },
    { title: "Aggregate", detail: "全プロジェクトの要約を1本のタイムラインに集約" },
  ],
};

const { date, concurrency, minFileSize } = args ?? {};
if (!date) {
  return { date: null, entries: [], error: "date (YYYY-MM-DD, JST基準) が指定されていない" };
}

const DEFAULT_CONCURRENCY = 10;
const parsedConcurrency = Number.parseInt(concurrency, 10);
const CONCURRENCY = Number.isInteger(parsedConcurrency) && parsedConcurrency >= 1 ? parsedConcurrency : DEFAULT_CONCURRENCY;

const DEFAULT_MIN_FILE_SIZE = 30000;
const parsedMinFileSize = Number.parseInt(minFileSize, 10);
const MIN_FILE_SIZE = Number.isInteger(parsedMinFileSize) && parsedMinFileSize >= 0 ? parsedMinFileSize : DEFAULT_MIN_FILE_SIZE;

const startUtc = new Date(date + "T00:00:00.000+09:00");
if (Number.isNaN(startUtc.getTime())) {
  return { date, entries: [], error: "date の形式が不正 (YYYY-MM-DD で指定すること)" };
}
const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
const startUtcIso = startUtc.toISOString();
const endUtcIso = endUtc.toISOString();
const startEpochSeconds = Math.floor(startUtc.getTime() / 1000);

// ─── Discover ───
const DISCOVER_SCHEMA = {
  type: "object",
  required: ["files"],
  properties: {
    files: {
      type: "array",
      description: "条件Aと条件Bの両方を満たすsessionファイルの絶対パス一覧",
      items: { type: "string", description: "sessionファイルの絶対パス。例えば/home/metalmental/.claude/projects/-home-metalmental-metalmental-claude/8b1996a2-4158-4515-9385-08e90b914e29.jsonl" },
    },
  },
};

// 列0開始必須。インデントを付けるとPythonの構文が壊れる
const DISCOVER_SCRIPT = `import os
import json

ROOT = os.path.expanduser("~/.claude/projects")
MIN_FILE_SIZE = ${MIN_FILE_SIZE}
START_UTC_ISO = ${JSON.stringify(startUtcIso)}
END_UTC_ISO = ${JSON.stringify(endUtcIso)}
START_EPOCH = ${startEpochSeconds}

def is_real_user_line(obj):
    if obj.get("type") != "user":
        return False
    message = obj.get("message")
    if not isinstance(message, dict):
        return False
    if not isinstance(message.get("content"), str):
        return False
    origin = obj.get("origin")
    if not isinstance(origin, dict) or origin.get("kind") != "human":
        return False
    if obj.get("promptSource") != "typed":
        return False
    return True

def is_real_assistant_line(obj):
    if obj.get("type") != "assistant":
        return False
    message = obj.get("message")
    if not isinstance(message, dict):
        return False
    content = message.get("content")
    if not isinstance(content, list):
        return False
    for item in content:
        if isinstance(item, dict) and item.get("type") in ("text", "tool_use"):
            return True
    return False

qualified = []

try:
    project_names = os.listdir(ROOT)
except OSError:
    project_names = []

for project_name in project_names:
    project_path = os.path.join(ROOT, project_name)
    try:
        if not os.path.isdir(project_path):
            continue
        entry_names = os.listdir(project_path)
    except OSError:
        continue
    for entry_name in entry_names:
        if not entry_name.endswith(".jsonl"):
            continue
        file_path = os.path.join(project_path, entry_name)
        try:
            st = os.stat(file_path)
        except OSError:
            continue
        if not os.path.isfile(file_path):
            continue
        if st.st_mtime < START_EPOCH:
            continue
        if st.st_size < MIN_FILE_SIZE:
            continue

        found_a = False
        found_b = False
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    if found_a and found_b:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(obj, dict):
                        continue
                    ts = obj.get("timestamp")
                    if not isinstance(ts, str):
                        continue
                    if not (START_UTC_ISO <= ts < END_UTC_ISO):
                        continue
                    if not found_a and is_real_user_line(obj):
                        found_a = True
                    if not found_b and is_real_assistant_line(obj):
                        found_b = True
        except OSError:
            continue

        if found_a and found_b:
            qualified.append(file_path)

print(json.dumps({"files": qualified}))
`;

const DISCOVER_PROMPT =
  "以下のPythonスクリプトをBashで一字一句そのまま実行し、標準出力に出力されたJSON1行をそのまま構造化出力として返す。\n" +
  "スクリプトの内容を書き換えたり、独自のフィルタリングロジックを書いたりしないこと。ファイルの中身を直接Readしないこと。\n\n" +
  "実行コマンド (シングルクォートのヒアドキュメント終端子 'PYEOF' を使い、シェル変数展開が起きないようにすること):\n\n" +
  "```\n" +
  "python3 <<'PYEOF'\n" +
  DISCOVER_SCRIPT +
  "PYEOF\n" +
  "```\n\n" +
  "このスクリプトは ~/.claude/projects/ 配下の2階層目にある *.jsonl ファイルを列挙し、\n" +
  "更新日時(mtime)が対象UTC範囲より前のファイル、サイズが小さいファイルを除外したうえで、\n" +
  "残ったファイルの中身を1行ずつJSONとして解析し、対象UTC範囲内に人間が実際に入力したメッセージ(条件A)と\n" +
  "assistantの実際の返信(条件B)が両方存在するファイルのみを抽出し、\n" +
  '標準出力に {"files": [絶対パス, ...]} の1行JSONを出力する。\n\n' +
  "標準出力のJSONをそのまま files として返すこと。\n\n" +
  "Structured output only.";

phase("Discover");
const discovery = await agent(DISCOVER_PROMPT, {
  label: "discover",
  phase: "Discover",
  schema: DISCOVER_SCHEMA,
  model: "haiku",
});
if (!discovery) {
  return { date, entries: [], error: "ファイル一覧の取得に失敗した" };
}
const files = discovery.files || [];
if (files.length === 0) {
  return { date, entries: [] };
}
log(files.length + " 件のセッションファイルを検出");

// ─── Summarize ───
const SUMMARY_SCHEMA = {
  type: "object",
  required: ["file", "project", "startTimeUtc", "endTimeUtc", "summary"],
  properties: {
    file: { type: "string", description: "対象ファイルの絶対パス、フルパスをそのまま返す" },
    project: { type: "string", description: "cwd フィールドの値からパス末尾のディレクトリ名を取ったプロジェクト名。例えばcwdが/home/metalmental/metalmental-claudeならmetalmental-claudeとなる" },
    startTimeUtc: { type: "string", description: "該当行のうち最も早いtimestampの値、UTC ISO8601文字列のまま返す。例えば2026-08-15T11:38:18.394Z" },
    endTimeUtc: { type: "string", description: "該当行のうち最も遅いtimestampの値、UTC ISO8601文字列のまま返す。例えば2026-08-15T13:04:22.100Z" },
    summary: { type: "string", description: "作業内容から経過、結果までが伝わる2〜3行の日本語要約。例えばsession-daily-reportについて修正。並列数の設定で手間どったが修正が完了した" },
  },
};

const SUMMARIZE_PROMPT = (file) =>
  "対象ファイル: " +
  file +
  "\n" +
  "対象時刻範囲 (UTC, ISO8601): " +
  startUtcIso +
  " 以上 " +
  endUtcIso +
  " 未満\n" +
  "対象日(JST, 参考情報): " +
  date +
  "\n\n" +
  "このファイルは、対象時刻範囲内に人間が実際に入力したメッセージとassistantの実際の返信の両方が存在することが\n" +
  "Discover段階で既に確認済みである。以下の手順でその内容を抽出し要約する。\n\n" +
  "## 手順\n" +
  "1. ファイルを1行1JSONとして扱う。大きいファイルはBashのgrep等で `\"type\":\"user\"` または `\"type\":\"assistant\"` を含む行に絞り込んでから読み、ファイル全体を無条件にReadしない\n" +
  "2. 各行の timestamp フィールド (ISO8601文字列) が上記の対象時刻範囲に入っているかを判定する。ISO8601は文字列としての大小比較がそのまま時刻順になるため、文字列比較のみで判定すること。過去に datetime のtz-aware/naive比較エラーで失敗した実績があるため、日時ライブラリでのパースやタイムゾーン変換は一切行わない (不要かつ禁止)\n" +
  "3. 残った行のうち、以下に一致する行のみを実際の活動として抽出する\n" +
  '   - type:"user" かつ message.content が文字列型、かつ origin.kind=="human" かつ promptSource=="typed" (<local-command-...> 等の注入文言は除外)\n' +
  '   - type:"assistant" の message.content[] にある type:"text" 要素の .text (type:"thinking" は無視)\n' +
  '   - type:"assistant" の message.content[] にある type:"tool_use" 要素の .name と主要な .input は「何をしたか」の軽い手がかりとして参照してよい。tool_result の生出力は読まない\n' +
  "4. file (対象ファイルのパス、上記の値をそのまま)、cwd から取ったプロジェクト名 (パス末尾のディレクトリ名)、抽出した行のうち最も早いtimestampと最も遅いtimestampの値をUTCのISO8601文字列のまま (変換・整形せず) startTimeUtc/endTimeUtcとして返し、何をして何が起きたかを2~3行の日本語 (作業内容→経過→結果の順) で要約する。時刻の変換は呼び出し元が行うため、ここでの時刻計算・タイムゾーン変換は一切不要かつ禁止\n" +
  "5. JSONとして壊れている行はスキップする\n\n" +
  "Structured output only.";

phase("Summarize");
log(CONCURRENCY + " 件ずつのチャンクで処理する");
const summaries = [];
for (let i = 0; i < files.length; i += CONCURRENCY) {
  const chunk = files.slice(i, i + CONCURRENCY);
  const chunkResults = await parallel(
    chunk.map((file) => () =>
      agent(SUMMARIZE_PROMPT(file), {
        label: "summarize:" + file.split("/").pop(),
        phase: "Summarize",
        schema: SUMMARY_SCHEMA,
        model: "haiku",
      }),
    ),
  );
  summaries.push(...chunkResults);
  log(Math.min(i + CONCURRENCY, files.length) + "/" + files.length + " 件処理完了");
}

const toJstHHMM = (isoUtc) => {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return isoUtc;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return hh + ":" + mm;
};

const activeSummaries = summaries.filter(Boolean).map((s) => ({
  project: s.project,
  startTime: toJstHHMM(s.startTimeUtc),
  endTime: toJstHHMM(s.endTimeUtc),
  summary: s.summary,
}));
if (activeSummaries.length === 0) {
  return { date, entries: [] };
}
log(activeSummaries.length + " 件のプロジェクトの要約が完了");

// ─── Aggregate ───
const REPORT_SCHEMA = {
  type: "object",
  required: ["entries"],
  properties: {
    entries: {
      type: "array",
      description: "時系列順に集約された日報のタイムライン",
      items: {
        type: "object",
        required: ["startTime", "endTime", "summary"],
        properties: {
          startTime: { type: "string", description: "JSTのHH:MM形式で表す活動開始時刻。例えば09:15" },
          endTime: { type: "string", description: "JSTのHH:MM形式で表す活動終了時刻。例えば10:30" },
          summary: { type: "string", description: "作業内容から経過、結果までが伝わる日本語要約。例えばsession-daily-reportについて修正。並列数の設定で手間どったが修正が完了した" },
        },
      },
    },
  },
};

phase("Aggregate");
const aggregated = await agent(
  "対象日(JST): " +
    date +
    "\n" +
    "以下は各プロジェクトの要約結果(JSON配列)である。時系列で1本のタイムラインに集約する。\n\n" +
    JSON.stringify(activeSummaries) +
    "\n\n" +
    "## 集約ルール\n" +
    "1. startTimeの昇順に並べる\n" +
    "2. 時間帯が隣接・重複し同一プロジェクト・同一トピックとみなせるエントリはまとめる(開始は最早、終了は最遅を採用し、要約は自然な日本語に書き直す)\n" +
    "3. 異なるプロジェクトの活動が時間的に重なる場合はまとめず別エントリのまま残す\n" +
    "4. 各エントリのsummaryは「〜について修正。〜に手間どったが修正が完了した」のように作業内容→経過→結果が伝わる日本語にする\n\n" +
    "## 出力の表記ルール\n" +
    "半角括弧のみ使用し全角括弧は使わない、理由は「〜のため、xxxする」の形で前置する、Markdownの水平線や見出し記号は使わない、文末に「。」を付けない\n\n" +
    "Structured output only.",
  { label: "aggregate", phase: "Aggregate", schema: REPORT_SCHEMA },
);
if (!aggregated) {
  return { date, entries: [], error: "集約エージェントが結果を返さなかった" };
}

return { date, entries: aggregated.entries };
