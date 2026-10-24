import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { padLabelToWidth, getCopyButtonStyle } from "../hooks/copyButton";
import {
  CODE,
  CODE_BLOCK,
  COLUMNS,
  TABLE,
  mountReply,
  reply,
  stubWorld,
} from "./helpers";

const OTHER_TABLE = "| x |\n| - |\n| 1 |";

type Ui = Awaited<ReturnType<typeof mountReply>>["ui"];

const copyButtonsOf = async (ui: Ui) =>
  (await ui.findAll({ type: "Button" })).filter(({ key }) => key !== "toggle");

const labelsOf = async (ui: Ui) =>
  (await copyButtonsOf(ui)).map(({ text }) => text.trim());

const orderOf = async (ui: Ui) =>
  (await ui.findAll({}))
    .filter(
      ({ type, key }) =>
        (type === "Button" && key !== "toggle") || type === "Markdown",
    )
    .map(({ type, text }) => (type === "Button" ? "ボタン" : text));

for (const [result, label, color, hoverColor] of [
  [undefined, "COPY TABLE", "white", "indigo"],
  ["success", "TABLE COPIED", "green", "green"],
  ["failed", "COPY FAILED", "red", "red"],
] as const) {
  test(`LBL-1: ${result ?? "未押下"} は ${label} を ${color} (ポインタが乗ると ${hoverColor}) で表示する`, () => {
    expect(getCopyButtonStyle("table", result)).toEqual({
      label,
      color: COLOR[color],
      hoverColor: COLOR[hoverColor],
    });
  });
}

test("LBL-2: 文言を中央に置き、端末の横幅から余白 6 を引いた幅まで埋める", () => {
  const filled = padLabelToWidth("FAILED", 20);

  expect(filled.length).toBe(14);
  expect(filled.trim()).toBe("FAILED");
  expect(filled.startsWith("\u00a0".repeat(4))).toBe(true);
});

test("LBL-3: 横幅が文言より狭くても、文言を切らない", () => {
  expect(padLabelToWidth("COPY TABLE", 6)).toBe("COPY TABLE");
});

test("LBL-3: 横幅が分からないときは、文言をそのまま返す", () => {
  expect(padLabelToWidth("COPY TABLE", undefined)).toBe("COPY TABLE");
});

test("UI-1: 表がない1行の回答は、ボタンを出さず、文字だけで表示する", async ($, on) => {
  const { ui } = await mountReply($, on, "1行の回答");

  expect(await ui.find({ type: "Text", text: "1行の回答" })).toBeDefined();
  expect(await ui.findAll({ type: "Button" })).toHaveLength(0);
});

test("UI-2: 表の上に COPY TABLE ボタンを表示する", async ($, on) => {
  const { ui } = await mountReply($, on, `前\n\n${TABLE}\n\n後`);

  expect(await orderOf(ui)).toEqual(["前", "ボタン", TABLE, "後"]);
});

test("UI-3: 表を含む回答でも、表以外の文章は表示する", async ($, on) => {
  const { ui } = await mountReply($, on, `前の文章\n\n${TABLE}\n\n後の文章`);

  expect(await ui.find({ type: "Markdown", text: "前の文章" })).toBeDefined();
  expect(await ui.find({ type: "Markdown", text: "後の文章" })).toBeDefined();
});

test("UI-4: 要約の回答は、標準の描画にする", async ($, on) => {
  stubWorld(on);
  const ui = await $.ui.mount(reply(TABLE, { isSummary: true }));

  expect(await ui.find({ type: "Text", text: "標準の表示" })).toBeDefined();
  expect(await ui.findAll({ type: "Button" })).toHaveLength(0);
});

test("UI-5: ボタンの幅は、端末の横幅から余白 6 を引いた幅にそろえる", async ($, on) => {
  const { ui } = await mountReply($, on, TABLE);
  const [button] = await copyButtonsOf(ui);

  expect(button?.text.length).toBe(COLUMNS - 6);
});

test("BTN-1: 押すと、表の Markdown をそのままコピーする", async ($, on) => {
  const { ui, calls } = await mountReply($, on, `前\n\n${TABLE}\n\n後`);
  await ui.press({ key: "copy-table-1" });

  expect(calls.copies).toEqual([{ text: TABLE, surface: "terminal" }]);
});

test("BTN-2: コピーできたら TABLE COPIED を 3 秒間表示して、COPY TABLE に戻る", async ($, on) => {
  const { ui, clock } = await mountReply($, on, TABLE);
  await ui.press({ key: "copy-table-0" });

  expect(await labelsOf(ui)).toEqual(["TABLE COPIED"]);

  await clock.advance(2900);

  expect(await labelsOf(ui)).toEqual(["TABLE COPIED"]);

  await clock.advance(200);

  expect(await labelsOf(ui)).toEqual(["COPY TABLE"]);
});

test("BTN-3: コピーに失敗したら COPY FAILED を 3 秒間表示して、デバッグログに残す", async ($, on) => {
  const { ui, calls, clock } = await mountReply($, on, TABLE, {
    copy: { isCopied: false, reason: "refused" },
  });
  await ui.press({ key: "copy-table-0" });

  expect(await labelsOf(ui)).toEqual(["COPY FAILED"]);
  expect(calls.logs).toEqual(["copy failed: refused"]);

  await clock.advance(3100);

  expect(await labelsOf(ui)).toEqual(["COPY TABLE"]);
});

test("BTN-4: コピーが例外で失敗しても COPY FAILED を表示して、デバッグログに残す", async ($, on) => {
  const { ui, calls } = await mountReply($, on, TABLE, { copyFails: true });
  await ui.press({ key: "copy-table-0" });

  expect(await labelsOf(ui)).toEqual(["COPY FAILED"]);
  expect(calls.logs).toHaveLength(1);
  expect(calls.logs[0]).toMatch(/^copy failed: /);
});

test("BTN-5: 表ごとに結果を表示する", async ($, on) => {
  const { ui } = await mountReply($, on, `${TABLE}\n\n間\n\n${OTHER_TABLE}`);
  await ui.press({ key: "copy-table-2" });

  expect(await labelsOf(ui)).toEqual(["COPY TABLE", "TABLE COPIED"]);
});

test("BTN-6: 結果の表示中にもう一度押すと、表示の時間を数え直す", async ($, on) => {
  const { ui, clock } = await mountReply($, on, TABLE);
  await ui.press({ key: "copy-table-0" });
  await clock.advance(2000);
  await ui.press({ key: "copy-table-0" });
  await clock.advance(2000);

  expect(await labelsOf(ui)).toEqual(["TABLE COPIED"]);

  await clock.advance(1100);

  expect(await labelsOf(ui)).toEqual(["COPY TABLE"]);
});

test("CODE-1: コードブロックの上に COPY CODE ボタンを表示し、コードブロックはそのまま表示する", async ($, on) => {
  const { ui } = await mountReply($, on, `前\n\n${CODE_BLOCK}\n\n後`);

  expect(await orderOf(ui)).toEqual(["前", "ボタン", CODE_BLOCK, "後"]);
  expect(await labelsOf(ui)).toEqual(["COPY CODE"]);
});

test("CODE-2: 押すと、フェンス行を除いたコードをコピーする", async ($, on) => {
  const { ui, calls } = await mountReply($, on, CODE_BLOCK);
  await ui.press({ key: "copy-code-0" });

  expect(calls.copies).toEqual([{ text: CODE, surface: "terminal" }]);
});

test("CODE-3: コピーできたら CODE COPIED を 3 秒間表示して、COPY CODE に戻る", async ($, on) => {
  const { ui, clock } = await mountReply($, on, CODE_BLOCK);
  await ui.press({ key: "copy-code-0" });

  expect(await labelsOf(ui)).toEqual(["CODE COPIED"]);

  await clock.advance(3100);

  expect(await labelsOf(ui)).toEqual(["COPY CODE"]);
});

test("CODE-4: コピーに失敗したら COPY FAILED を表示する", async ($, on) => {
  const { ui } = await mountReply($, on, CODE_BLOCK, {
    copy: { isCopied: false, reason: "refused" },
  });
  await ui.press({ key: "copy-code-0" });

  expect(await labelsOf(ui)).toEqual(["COPY FAILED"]);
});

test("CODE-5: 表とコードの結果は、別々に表示する", async ($, on) => {
  const { ui } = await mountReply($, on, `${TABLE}\n\n${CODE_BLOCK}`);
  await ui.press({ key: "copy-code-1" });

  expect(await labelsOf(ui)).toEqual(["COPY TABLE", "CODE COPIED"]);
});

test("CODE-6: 言語によらず、コードブロックの上にボタンを表示する", async ($, on) => {
  const { ui } = await mountReply($, on, "```ts\nconst a = 1;\n```");

  expect(await labelsOf(ui)).toEqual(["COPY CODE"]);
});

test("CODE-7: コードブロックを、ボタンと同じ色の枠線で囲む", async ($, on) => {
  const { ui } = await mountReply($, on, CODE_BLOCK);
  const frame = await ui.find({ key: "code-frame-0" });

  expect(frame?.props).toMatchObject({
    borderStyle: "round",
    borderColor: COLOR.white,
  });
  expect(await ui.find({ type: "Markdown", text: CODE_BLOCK })).toBeDefined();

  await ui.press({ key: "copy-code-0" });

  expect((await ui.find({ key: "code-frame-0" }))?.props).toMatchObject({
    borderColor: COLOR.green,
  });
});

test("CODE-8: 表は、枠線で囲まない", async ($, on) => {
  const { ui } = await mountReply($, on, TABLE);

  expect(await ui.find({ key: "code-frame-0" })).toBeUndefined();
});
