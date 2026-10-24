import { expect, test } from "claude-code/testing";

import {
  agentRow,
  callTool,
  commandOutputRow,
  endTurn,
  infoNoticeRow,
  question,
  startTurn,
  stubWorld,
  toolGroupRow,
  toolProgressRow,
  toolResultRow,
  toolUseRow,
  turnDurationRow,
} from "./helpers";

const ENGINE_TEXT = /^標準の表示$/;

test("HID-1: 回答中は、今の回答のツールの行を表示する", async ($, on) => {
  const { calls } = stubWorld(on);

  await startTurn($, "t1");
  const id = await callTool($, calls);
  const ui = await $.ui.mount(toolUseRow(id));

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  await ui.unmount();
});

test("HID-2: 回答の終了後は、ツールの行を非表示にする", async ($, on) => {
  const { calls } = stubWorld(on);

  await startTurn($, "t1");
  const id = await callTool($, calls);
  const ui = await $.ui.mount(toolUseRow(id));

  await endTurn($, "t1");

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
  await ui.unmount();
});

test("HID-3: 次の回答が始まっても、前の回答のツールの行は表示に戻らない", async ($, on) => {
  const { calls } = stubWorld(on);

  await startTurn($, "t1");
  const oldId = await callTool($, calls);
  await endTurn($, "t1");
  await startTurn($, "t2");
  const newId = await callTool($, calls);

  const oldUi = await $.ui.mount(toolUseRow(oldId));
  const newUi = await $.ui.mount(toolUseRow(newId));

  expect(await oldUi.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
  expect(await newUi.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  await oldUi.unmount();
  await newUi.unmount();
});

test("HID-4: ツールの結果の行も、回答中は表示し、回答の終了後は非表示にする", async ($, on) => {
  const { calls } = stubWorld(on);

  await startTurn($, "t1");
  const id = await callTool($, calls);
  const ui = await $.ui.mount(toolResultRow(id));

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();

  await endTurn($, "t1");

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
  await ui.unmount();
});

test("HID-5: ツールのまとめの行は、今の回答のツールを含む間だけ表示する", async ($, on) => {
  const { calls } = stubWorld(on);

  await startTurn($, "t1");
  const id = await callTool($, calls);
  const ui = await $.ui.mount(toolGroupRow(["other", id]));
  const others = await $.ui.mount(toolGroupRow(["other"], "group-other"));

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  expect(
    await others.find({ type: "Text", text: ENGINE_TEXT }),
  ).toBeUndefined();

  await endTurn($, "t1");

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
  await ui.unmount();
  await others.unmount();
});

test("HID-6: 回答の所要時間の行は、常に非表示にする", async ($, on) => {
  stubWorld(on);

  await startTurn($, "t1");
  const ui = await $.ui.mount(turnDurationRow());

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
  await ui.unmount();
});

test("HID-7: ツールの進行の行は、今の回答のツールの間だけ表示する", async ($, on) => {
  const { calls } = stubWorld(on);

  await startTurn($, "t1");
  const id = await callTool($, calls);
  const ui = await $.ui.mount(toolProgressRow(id));

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();

  await endTurn($, "t1");

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
  await ui.unmount();
});

test("HID-8: 起動時のお知らせは、最初の回答が終わるまで表示し、終わると非表示にする", async ($, on) => {
  stubWorld(on);

  const ui = await $.ui.mount(infoNoticeRow());

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();

  await startTurn($, "t1");
  await endTurn($, "t1");

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();

  await startTurn($, "t2");

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  await ui.unmount();
});

test("HID-9: 全体表示 (ctrl+o) のときは、非表示の対象も表示する", async ($, on) => {
  const { calls } = stubWorld(on);

  await startTurn($, "t1");
  const id = await callTool($, calls);
  await endTurn($, "t1");

  const toolUse = await $.ui.mount(toolUseRow(id, true));
  const duration = await $.ui.mount(turnDurationRow(true));

  expect(await toolUse.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  expect(
    await duration.find({ type: "Text", text: ENGINE_TEXT }),
  ).toBeDefined();
  await toolUse.unmount();
  await duration.unmount();
});

test("HID-10: サブエージェントの回答の開始と終了では、メインの回答中の状態を変えない", async ($, on) => {
  const { calls } = stubWorld(on);

  await startTurn($, "main");
  const id = await callTool($, calls);
  const ui = await $.ui.mount(toolUseRow(id));

  await startTurn($, "sub", "agent-1");
  await endTurn($, "sub", { agentId: "agent-1" });

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  await ui.unmount();
});

test("HID-11: 中断やエラーで終わった回答のツールの行も、非表示にする", async ($, on) => {
  const { calls } = stubWorld(on);

  for (const reason of ["aborted", "error"] as const) {
    await startTurn($, `t-${reason}`);
    const id = await callTool($, calls);
    const ui = await $.ui.mount(toolUseRow(id));

    await endTurn($, `t-${reason}`, { reason });

    expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
    await ui.unmount();
  }
});

test("HID-12: スラッシュコマンドの出力の行は、回答の終了後も表示する", async ($, on) => {
  stubWorld(on);

  await startTurn($, "t1");
  await endTurn($, "t1");
  const ui = await $.ui.mount(commandOutputRow());

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  await ui.unmount();
});

test("HID-13: サブエージェントのメッセージと通知の行は、回答中は表示し、回答の終了後は非表示にする", async ($, on) => {
  stubWorld(on);

  for (const kind of ["message", "notification"] as const) {
    await startTurn($, `t-${kind}`);
    const ui = await $.ui.mount(agentRow(kind));

    expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();

    await endTurn($, `t-${kind}`);

    expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
    await ui.unmount();
  }
});

test("HID-14: 回答の開始前に描画した行も、その回答が始まれば表示する", async ($, on) => {
  stubWorld(on);

  const ui = await $.ui.mount(agentRow("notification"));

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();

  await startTurn($, "t1");

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  await ui.unmount();
});

test("HID-15: 次の回答が始まっても、前の回答までに描画した行は表示に戻らない", async ($, on) => {
  stubWorld(on);

  await startTurn($, "t1");
  const oldRow = await $.ui.mount(agentRow("message"));
  await endTurn($, "t1");
  await startTurn($, "t2");
  const newRow = await $.ui.mount(agentRow("message"));

  expect(await oldRow.find({ type: "Text", text: ENGINE_TEXT })).toBeUndefined();
  expect(await newRow.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  await oldRow.unmount();
  await newRow.unmount();
});

test("HID-16: サブエージェントの行も、全体表示 (ctrl+o) のときは表示する", async ($, on) => {
  stubWorld(on);

  await startTurn($, "t1");
  await endTurn($, "t1");

  for (const kind of ["message", "notification"] as const) {
    const ui = await $.ui.mount(agentRow(kind, { isExpanded: true }));

    expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
    await ui.unmount();
  }
});

test("HID-17: from と task がない、入力欄以外の行は、回答の終了後も表示する", async ($, on) => {
  stubWorld(on);

  await startTurn($, "t1");
  await endTurn($, "t1");
  const ui = await $.ui.mount(question("入力", { origin: { kind: "unclassified" } }));

  expect(await ui.find({ type: "Text", text: ENGINE_TEXT })).toBeDefined();
  await ui.unmount();
});
