export const meta = {
  name: 'web-search-workflow',
  description:
    'クエリを分類してcontext7またはWebSearchで候補を集め、URLごとに完全なdocumentを取得・判定し、優先順位を選定した上で上位候補を独立に敵対的検証する。見つからない場合は無理に回答せず事実を伝える',
  phases: [
    { title: 'Search', detail: 'クエリを分類し、context7またはWebSearchで候補を得る' },
    { title: 'Fetch', detail: 'URLごとに完全なdocumentを取得し質問との一致を判定' },
    { title: 'Select', detail: '判定根拠から候補の優先順位を決める' },
    { title: 'Verify', detail: '上位候補を独立に再取得し敵対的に再検証' },
  ],
}

const { query, maxUrls, maxVerifyAttempts } = args ?? {}
if (!query) {
  return { found: false, message: 'query が指定されていない' }
}

const DEFAULT_MAX_URLS = 5
const parsedMaxUrls = Number.parseInt(maxUrls, 10)
const MAX_URLS = Number.isInteger(parsedMaxUrls) && parsedMaxUrls >= 1 ? parsedMaxUrls : DEFAULT_MAX_URLS

const DEFAULT_MAX_VERIFY_ATTEMPTS = 3
const parsedMaxVerifyAttempts = Number.parseInt(maxVerifyAttempts, 10)
const MAX_VERIFY_ATTEMPTS =
  Number.isInteger(parsedMaxVerifyAttempts) && parsedMaxVerifyAttempts >= 1
    ? parsedMaxVerifyAttempts
    : DEFAULT_MAX_VERIFY_ATTEMPTS

// ─── Search ───
const SEARCH_SCHEMA = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: {
      type: 'string',
      enum: ['library', 'web'],
      description: '分類結果。ライブラリ/API/フレームワークに関する質問ならlibrary、それ以外はweb',
    },
    libraryId: { type: 'string', description: 'kind=library時のみ。context7で解決したライブラリID。例: /vercel/next.js' },
    libraryContent: { type: 'string', description: 'kind=library時のみ。context7から取得したドキュメント本文' },
    urls: { type: 'array', items: { type: 'string' }, description: 'kind=web時のみ。WebSearchで得た候補URL一覧' },
  },
}

phase('Search')
const searchResult = await agent(
  `質問: ${query}\n\nこの質問を分類し、ライブラリ/APIに関する質問であればcontext7でドキュメントを取得し、それ以外であればWebSearchで候補URLを取得してください。`,
  { agentType: 'verified-web-search:web-search-scout', phase: 'Search', label: 'scout', schema: SEARCH_SCHEMA },
)
if (!searchResult) {
  return { found: false, message: '検索の初期段階に失敗しました' }
}

if (searchResult.kind === 'library') {
  return {
    found: true,
    url: null,
    content: searchResult.libraryContent,
    verificationReason: 'context7のライブラリドキュメントを直接取得したもの (URL単位の再検証は行っていない)',
    otherCandidates: [],
  }
}

const urls = (searchResult.urls || []).slice(0, MAX_URLS)
if (urls.length === 0) {
  return { found: false, message: '検索結果が得られませんでした', checkedUrls: [] }
}
log(urls.length + ' 件のURLを対象にfetcherを起動')

// ─── Fetch ───
const FETCH_SCHEMA = {
  type: 'object',
  required: ['url', 'answersQuestion', 'judgementReason'],
  properties: {
    url: { type: 'string', description: '判定対象のURL' },
    answersQuestion: { type: 'boolean', description: '質問への回答として適切ならtrue' },
    judgementReason: {
      type: 'string',
      description: '判定根拠を3行程度で。要約ではなく、質問のどの部分にどう答えているかの根拠',
    },
  },
}

phase('Fetch')
const fetchResults = (
  await parallel(
    urls.map((url) => () =>
      agent(`質問: ${query}\n\n以下のURLを取得し、この質問への回答として適切かを判定してください: ${url}`, {
        agentType: 'verified-web-search:web-search-fetcher',
        phase: 'Fetch',
        label: 'fetch:' + url,
        schema: FETCH_SCHEMA,
      }),
    ),
  )
).filter(Boolean)

const checkedUrls = fetchResults.map((r) => ({ url: r.url, judgementReason: r.judgementReason }))
const candidates = fetchResults.filter((r) => r.answersQuestion)

if (candidates.length === 0) {
  return { found: false, message: '質問に回答できる情報源が見つかりませんでした', checkedUrls }
}
log(candidates.length + ' 件の候補が質問に回答していると判定された')

// ─── Select ───
const SELECT_SCHEMA = {
  type: 'object',
  required: ['rankedUrls'],
  properties: {
    rankedUrls: { type: 'array', items: { type: 'string' }, description: '優先度の高い順に並べたURL一覧' },
    rankingReason: { type: 'string', description: 'この順位にした理由' },
  },
}

phase('Select')
const selection = await agent(
  `質問: ${query}\n\n以下は各URLが質問に回答していると判定された根拠です。最も優れている順に並べてください。\n${JSON.stringify(
    candidates.map((c) => ({ url: c.url, judgementReason: c.judgementReason })),
  )}`,
  { agentType: 'verified-web-search:web-search-selector', phase: 'Select', label: 'selector', schema: SELECT_SCHEMA },
)
const rankedUrls =
  selection && selection.rankedUrls && selection.rankedUrls.length > 0
    ? selection.rankedUrls
    : candidates.map((c) => c.url)

// ─── Verify ───
// 逐次実行 (parallelにしない)。完全なdocumentが同時にcontextへ乗るのを最大1件に抑えるため、
// 合格したURLが見つかった時点でループを打ち切る
const VERIFY_SCHEMA = {
  type: 'object',
  required: ['url', 'verified', 'verificationReason'],
  properties: {
    url: { type: 'string', description: '検証対象のURL' },
    verified: { type: 'boolean', description: '質問への回答として妥当と再確認できたらtrue' },
    verificationReason: { type: 'string', description: '検証の根拠。不合格なら何が欠けていたか' },
    fullContent: { type: 'string', description: 'verified: true の場合のみ。取得した完全な文書の原文' },
  },
}

phase('Verify')
for (const url of rankedUrls.slice(0, MAX_VERIFY_ATTEMPTS)) {
  const result = await agent(
    `質問: ${query}\n\n以下のURLを独立に再取得し、質問への回答として本当に妥当か敵対的に検証してください: ${url}`,
    { agentType: 'verified-web-search:web-search-verifier', phase: 'Verify', label: 'verify:' + url, schema: VERIFY_SCHEMA },
  )

  if (result && result.verified) {
    return {
      found: true,
      url,
      content: result.fullContent,
      verificationReason: result.verificationReason,
      otherCandidates: checkedUrls.filter((c) => c.url !== url),
    }
  }
  log(url + ' は検証で不合格、次点を試す')
}

return { found: false, message: '検証を通過する情報源が見つかりませんでした', checkedUrls }
