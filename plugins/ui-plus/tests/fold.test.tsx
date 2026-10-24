import { expect, test } from "claude-code/testing";
import type { Engine } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import {
  ANSWER_TOGGLE_RESERVED,
  QUESTION_TOGGLE_RESERVED,
  displayWidthOf,
} from "../hooks/labelWidth";
import {
  CODE_BLOCK,
  COLUMNS,
  TABLE,
  endTurn,
  nextRequestId,
  question,
  reply,
  startTurn,
  stubWorld,
} from "./helpers";

type Mounted = Awaited<ReturnType<Engine["ui"]["mount"]>>;
type Finder = Pick<Mounted, "find">;

const ANSWER = "結論です\n\n詳細1\n詳細2";
const ENGINE_TEXT = { type: "Text", text: "標準の表示" } as const;

const rawHeadingOf = async (ui: Finder) =>
  ui.find({ type: "Text", text: /^[▶▼]/ });

const headingOf = async (ui: Finder) => {
  const found = await rawHeadingOf(ui);

  return found === undefined
    ? undefined
    : { ...found, text: found.text.trim() };
};

const isBlank = async (ui: Pick<Mounted, "findAll">) =>
  (await ui.findAll({})).every(({ type }) => type === "Box");

const mountAnswer = ($: Engine, text = ANSWER, isSummary = false) =>
  $.ui.mount(reply(text, isSummary ? { isSummary: true } : {}));

test("FLD-1: 直近2ターンの回答は開き、3ターン目が始まると最も古いものだけ閉じる", async ($, on) => {
  stubWorld(on);

  await startTurn($, nextRequestId("turn"));
  const first = await mountAnswer($);
  await startTurn($, nextRequestId("turn"));
  const second = await mountAnswer($);

  expect((await headingOf(first))?.text).toBe("▼ 閉じる");
  expect((await headingOf(second))?.text).toBe("▼ 閉じる");

  await startTurn($, nextRequestId("turn"));
  const third = await mountAnswer($);

  expect((await headingOf(third))?.text).toBe("▼ 閉じる");
  expect((await headingOf(second))?.text).toBe("▼ 閉じる");
  expect((await headingOf(first))?.text).toBe("▶ 結論です");
});

test("FLD-2: 1ターンの複数のブロックは、最初のブロックだけが折りたたみの行を出す", async ($, on) => {
  stubWorld(on);

  await startTurn($, nextRequestId("turn"));
  const firstBlock = await mountAnswer($, "最初です\n詳細");
  const secondBlock = await mountAnswer($, "次です\n詳細");

  await startTurn($, nextRequestId("turn"));
  await startTurn($, nextRequestId("turn"));

  expect((await headingOf(firstBlock))?.text).toBe("▶ 最初です");
  expect(await headingOf(secondBlock)).toBeUndefined();
  expect(await isBlank(secondBlock)).toBe(true);
});

test("FLD-3: 閉じた回答は、1行目を緑で表示する", async ($, on) => {
  stubWorld(on);
  const ui = await mountAnswer($, "## **結論** は `foo` です\n\n詳細");
  const heading = await headingOf(ui);

  expect(heading?.text).toBe("▶ 結論 は foo です");
  expect(heading?.props).toMatchObject({ color: COLOR.green });
});

test("FLD-4: 開いた回答は、橙の閉じるボタンの下に本文を表示する", async ($, on) => {
  stubWorld(on);
  await startTurn($, nextRequestId("turn"));
  const ui = await mountAnswer($);
  const heading = await headingOf(ui);

  expect(heading?.props).toMatchObject({ color: COLOR.orange });
  expect(await ui.find({ type: "Markdown", text: ANSWER })).toBeDefined();
});

test("FLD-5: 押して開いた回答は、次のターンでも開いたままにする", async ($, on) => {
  stubWorld(on);
  const ui = await mountAnswer($);

  expect((await headingOf(ui))?.text).toBe("▶ 結論です");

  await ui.press({ key: "toggle" });
  await startTurn($, nextRequestId("turn"));

  expect((await headingOf(ui))?.text).toBe("▼ 閉じる");

  await ui.press({ key: "toggle" });

  expect((await headingOf(ui))?.text).toBe("▶ 結論です");
});

test("FLD-6: 直近の回答でも、押して閉じたら閉じたままにする", async ($, on) => {
  stubWorld(on);
  await startTurn($, nextRequestId("turn"));
  const ui = await mountAnswer($);

  await ui.press({ key: "toggle" });
  await startTurn($, nextRequestId("turn"));
  await endTurn($, "ended");

  expect((await headingOf(ui))?.text).toBe("▶ 結論です");
});

test("FLD-7: 1行の回答は、折りたたまず緑の文字で表示し、要約の回答は標準の描画にする", async ($, on) => {
  stubWorld(on);
  const oneLine = await mountAnswer($, "1行の回答");
  const summary = await mountAnswer($, ANSWER, true);

  expect(
    (await oneLine.find({ type: "Text", text: "1行の回答" }))?.props,
  ).toMatchObject({
    color: COLOR.green,
  });
  expect(await headingOf(oneLine)).toBeUndefined();
  expect(await summary.find(ENGINE_TEXT)).toBeDefined();
  expect(await headingOf(summary)).toBeUndefined();
});

test("FLD-8: 閉じた回答は、表とコードブロックのコピーボタンを表示しない", async ($, on) => {
  stubWorld(on);
  const ui = await mountAnswer($, `前\n\n${TABLE}\n\n${CODE_BLOCK}`);

  expect((await headingOf(ui))?.text).toBe("▶ 前");
  expect(await ui.findAll({ type: "Button" })).toHaveLength(1);
});

test("FLD-9: 最後に表示した質問2件だけ開き、それより前の質問は青い1行目で閉じる", async ($, on) => {
  stubWorld(on);
  const text = "質問です\n詳細";
  const first = await $.ui.mount(question(text));
  const second = await $.ui.mount(question(text));
  const third = await $.ui.mount(question(text));

  expect((await headingOf(first))?.text).toBe("▶ 質問です");
  expect((await headingOf(first))?.props).toMatchObject({ color: COLOR.blue });
  expect((await headingOf(second))?.text).toBe("▼ 閉じる");
  expect((await headingOf(third))?.text).toBe("▼ 閉じる");
  expect(await second.find(ENGINE_TEXT)).toBeDefined();
});

test("FLD-10: 押して開いた質問は、新しい質問が増えても開いたままにする", async ($, on) => {
  stubWorld(on);
  const text = "質問です\n詳細";
  const first = await $.ui.mount(question(text));

  await $.ui.mount(question(text));
  await $.ui.mount(question(text));
  await first.press({ key: "toggle" });
  await $.ui.mount(question(text));

  expect((await headingOf(first))?.text).toBe("▼ 閉じる");
});

test("FLD-11: 入力欄以外の質問と全体表示の質問は、折りたたまず標準の描画にする", async ($, on) => {
  stubWorld(on);
  const notice = await $.ui.mount(
    question("質問です\n詳細", { origin: { kind: "unclassified" } }),
  );
  const expanded = await $.ui.mount(
    question("質問です\n詳細", { isExpanded: true }),
  );

  for (const ui of [notice, expanded]) {
    expect(await ui.find(ENGINE_TEXT)).toBeDefined();
    expect(await headingOf(ui)).toBeUndefined();
  }
});

test("FLD-12: 質問の開閉は、回答の開閉と連動しない", async ($, on) => {
  stubWorld(on);
  const answer = await mountAnswer($);
  const ask = await $.ui.mount(question("質問です\n詳細"));

  await ask.press({ key: "toggle" });

  expect((await headingOf(answer))?.text).toBe("▶ 結論です");
  expect((await headingOf(ask))?.text).toBe("▶ 質問です");
});

test("FLD-13: 開いたチャットは、閉じるボタン1つの下に、全ブロックの本文を順に表示する", async ($, on) => {
  stubWorld(on);

  await startTurn($, nextRequestId("turn"));
  const firstBlock = await mountAnswer($, "最初です\n詳細");
  const secondBlock = await mountAnswer($, "次です\n詳細");

  expect((await headingOf(firstBlock))?.text).toBe("▼ 閉じる");
  expect(await headingOf(secondBlock)).toBeUndefined();
  expect(
    await firstBlock.find({ type: "Markdown", text: "最初です\n詳細" }),
  ).toBeDefined();
  expect(
    await secondBlock.find({ type: "Markdown", text: "次です\n詳細" }),
  ).toBeDefined();
});

test("FLD-14: チャット全体で2行以上になれば、1行のブロックも含めて折りたたむ", async ($, on) => {
  stubWorld(on);

  await startTurn($, nextRequestId("turn"));
  const first = await mountAnswer($, "1行の前置き");

  expect(await first.find({ type: "Text", text: "1行の前置き" })).toBeDefined();
  expect(await headingOf(first)).toBeUndefined();

  const second = await mountAnswer($, "1行の続き");

  await startTurn($, nextRequestId("turn"));
  await startTurn($, nextRequestId("turn"));

  expect((await headingOf(first))?.text).toBe("▶ 1行の前置き");
  expect(await isBlank(second)).toBe(true);
});

test("FLD-15: 押すと、チャットの全ブロックをまとめて開閉する", async ($, on) => {
  stubWorld(on);

  await startTurn($, nextRequestId("turn"));
  const firstBlock = await mountAnswer($, "最初です\n詳細");
  const secondBlock = await mountAnswer($, "次です\n詳細");

  await startTurn($, nextRequestId("turn"));
  await startTurn($, nextRequestId("turn"));

  expect(await isBlank(secondBlock)).toBe(true);

  await firstBlock.press({ key: "toggle" });

  expect((await headingOf(firstBlock))?.text).toBe("▼ 閉じる");
  expect(
    await secondBlock.find({ type: "Markdown", text: "次です\n詳細" }),
  ).toBeDefined();
});

test("FLD-16: 直近2チャットの回答は、複数のブロックがあってもまとめて数える", async ($, on) => {
  stubWorld(on);

  await startTurn($, nextRequestId("turn"));
  const oldest = await mountAnswer($, "古いです\n詳細");
  await mountAnswer($, "古い続きです\n詳細");
  await startTurn($, nextRequestId("turn"));
  const second = await mountAnswer($, "2番目です\n詳細");
  await startTurn($, nextRequestId("turn"));
  const third = await mountAnswer($, "3番目です\n詳細");

  expect((await headingOf(oldest))?.text).toBe("▶ 古いです");
  expect((await headingOf(second))?.text).toBe("▼ 閉じる");
  expect((await headingOf(third))?.text).toBe("▼ 閉じる");
});

test("FLD-17: ターンが分からない回答のブロックは、ブロックごとに折りたたむ", async ($, on) => {
  stubWorld(on);
  const first = await mountAnswer($, "最初です\n詳細");
  const second = await mountAnswer($, "次です\n詳細");

  expect((await headingOf(first))?.text).toBe("▶ 最初です");
  expect((await headingOf(second))?.text).toBe("▶ 次です");
});

test("FLD-18: 1行の質問は、折りたたまず青の文字で表示する", async ($, on) => {
  stubWorld(on);
  const ui = await $.ui.mount(question("1行の質問"));

  expect(
    (await ui.find({ type: "Text", text: "1行の質問" }))?.props,
  ).toMatchObject({
    color: COLOR.blue,
  });
  expect(await headingOf(ui)).toBeUndefined();
});

test("FLD-19: 閉じた回答、閉じた質問、閉じるボタンは、横幅いっぱいまで文字を埋めて、余白も押せるようにする", async ($, on) => {
  stubWorld(on);
  const closedAnswer = await mountAnswer($, "結論です\n詳細");
  const closedQuestion = await $.ui.mount(question("質問です\n詳細"));
  await startTurn($, nextRequestId("turn"));
  const openAnswer = await mountAnswer($);
  const openQuestion = await $.ui.mount(question("質問です\n詳細"));
  const widthOf = async (ui: Finder) =>
    displayWidthOf((await rawHeadingOf(ui))?.text ?? "");

  expect(await widthOf(closedAnswer)).toBe(COLUMNS - ANSWER_TOGGLE_RESERVED);
  expect(await widthOf(openAnswer)).toBe(COLUMNS - ANSWER_TOGGLE_RESERVED);
  expect(await widthOf(closedQuestion)).toBe(
    COLUMNS - QUESTION_TOGGLE_RESERVED,
  );
  expect(await widthOf(openQuestion)).toBe(COLUMNS - QUESTION_TOGGLE_RESERVED);
});
