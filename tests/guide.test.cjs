const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");
const ROOT = path.resolve(__dirname, "..");

function setup(options = {}) {
  const { document, window: dom } = parseHTML(
    fs.readFileSync(path.join(ROOT, "index.html"), "utf8"),
  );
  const data = options.data || new Map();
  const storage = {
    failRead: false,
    failWrite: false,
    getItem(k) {
      if (this.failRead) throw new Error("SecurityError");
      return data.get(k) ?? null;
    },
    setItem(k, v) {
      if (this.failWrite) throw new Error("QuotaExceededError");
      data.set(k, v);
    },
    removeItem(k) {
      if (this.failWrite) throw new Error("SecurityError");
      data.delete(k);
    },
  };
  const listeners = {};
  const context = vm.createContext({
    document,
    localStorage: storage,
    console,
    Blob,
    URL,
    setTimeout: () => 1,
    clearTimeout() {},
    scrollTo() {},
    print() {},
    location: { reload() {} },
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
  });
  context.window = context;
  const dialog = document.getElementById("dialog");
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
  };
  for (const file of ["data.js", "kb.js", "storage.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, {
      filename: file,
    });
  const start = () =>
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, "app.js"), "utf8"),
      context,
      { filename: "app.js" },
    );
  const click = (selector) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Element exists: ${selector}`);
    element.dispatchEvent(new dom.Event("click", { bubbles: true }));
  };
  const change = (selector, value, type = "change", valid = true) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Element exists: ${selector}`);
    Object.defineProperty(element, "value", {
      configurable: true,
      value: String(value),
      writable: true,
    });
    Object.defineProperty(element, "validity", {
      configurable: true,
      value: { valid },
    });
    element.dispatchEvent(new dom.Event(type, { bubbles: true }));
  };
  return {
    context,
    document,
    data,
    storage,
    listeners,
    start,
    click,
    change,
    dom,
    saved: () => JSON.parse(data.get(context.GuideStore.key)),
  };
}
const sample = () => ({
  monthly: 5000,
  cash: 80000,
  price: 150000,
  down: 50000,
  tax: 13000,
  insurance: 5000,
  registration: 500,
  extras: 0,
  rate: 5,
  operating: "",
  band: "13-18",
  payment: "loan",
  method: "apr",
  months: 36,
});

test("source data has seven needs, seven criteria and 30 unique checklist items", () => {
  const { context: c } = setup();
  assert.equal(c.GuideData.needs.length, 7);
  assert.equal(c.GuideData.criteria.length, 7);
  const ids = c.GuideData.checklists.flatMap((g) =>
    g.groups.flatMap((s) => s[1].map((i) => i[0])),
  );
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(c.GuideData.source.author, "所长Wy");
});

test("knowledge base has 5-7 big steps with unique ids and complete details", () => {
  const { context: c } = setup();
  const steps = c.GuideKB.steps;
  assert.ok(steps.length >= 5 && steps.length <= 7);
  const stepIds = steps.map((s) => s.id);
  assert.equal(new Set(stepIds).size, stepIds.length);
  const itemIds = [];
  for (const step of steps) {
    assert.ok(step.num && step.title && step.tagline && step.summary);
    assert.ok(step.groups.length > 0);
    for (const group of step.groups) {
      assert.ok(group.id && group.title && group.stage);
      assert.ok(group.items.length > 0);
      for (const item of group.items) {
        const [id, title, todos, done] = item;
        assert.ok(id && title && done, `complete item in ${group.id}`);
        assert.ok(
          Array.isArray(todos) && todos.every((t) => t.length > 0),
          `todos for ${id}`,
        );
        itemIds.push(`${step.id}/${group.id}/${id}`);
      }
    }
  }
  assert.equal(new Set(itemIds).size, itemIds.length);
});

test("guide page renders every step and persists the selected step", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="guide"]');
  for (let i = 0; i < h.context.GuideKB.steps.length; i++) {
    h.click(`#step-tab-${i}`);
    assert.equal(h.saved().guideStep, i);
    assert.equal(h.saved().page, "guide");
    assert.ok(h.document.querySelector(".kb-group h2"));
    assert.ok(h.document.querySelector(".kb-item .kb-todo"));
    assert.ok(
      h.document
        .querySelector("h1")
        .textContent.includes(h.context.GuideKB.steps[i].title),
    );
  }
  const reloaded = setup({ data: h.data });
  reloaded.start();
  assert.ok(
    reloaded.document
      .querySelector("h1")
      .textContent.includes(
        h.context.GuideKB.steps[h.context.GuideKB.steps.length - 1].title,
      ),
  );
});

test("legacy saves without guideStep migrate instead of being treated as corrupt", () => {
  const h = setup();
  const legacy = h.context.GuideStore.defaults();
  delete legacy.guideStep;
  h.data.set(h.context.GuideStore.key, JSON.stringify(legacy));
  h.start();
  assert.equal(h.context.GuideStore.message, "");
  assert.equal(h.document.getElementById("storage-warning").textContent, "");
  assert.equal(h.context.GuideStore.validate(legacy).guideStep, 0);
  assert.throws(() =>
    h.context.GuideStore.validate({ ...legacy, guideStep: 99 }),
  );
});

test("default state validates and backup round-trips without PII", () => {
  const { context: c } = setup();
  const state = c.GuideStore.defaults();
  state.needs.values = ["safety", "economy"];
  state.priorities["values:safety"] = 3;
  state.checks["delivery-charge"] = "na";
  state.budget = sample();
  assert.equal(
    JSON.stringify(c.GuideStore.decode(c.GuideStore.encode(state))),
    JSON.stringify(c.GuideStore.validate(state)),
  );
});

test("invalid and future backups are rejected, not trusted or merged", () => {
  const { context: c } = setup();
  for (const mutate of [
    (s) => (s.version = 2),
    (s) => (s.budget.price = -10),
    (s) => (s.budget.rate = 101),
    (s) => (s.budget.price = "123"),
    (s) => (s.budget.price = Infinity),
    (s) => (s.needIndex = 1.5),
    (s) => (s.needs.values = ["safety", "safety"]),
    (s) => (s.needs.values = ["safety", "design", "smart", "brand"]),
    (s) => (s.needs.policy = ["<img src=x onerror=alert(1)>"]),
    (s) => (s.cars = []),
    (s) => (s.updatedAt = "invalid"),
    (s) => (s.checks["drive-route"] = true),
    (s) => (s.cars[0].ratings.safety = 6),
  ]) {
    const state = c.GuideStore.defaults();
    mutate(state);
    assert.throws(() => c.GuideStore.validate(state));
  }
  assert.throws(() => c.GuideStore.decode("{"));
  assert.throws(() => c.GuideStore.decode("x".repeat(100001)));
  assert.throws(() =>
    c.GuideStore.decode(
      JSON.stringify({
        format: "other",
        version: 1,
        state: c.GuideStore.defaults(),
      }),
    ),
  );
});

test("unknown fields are dropped, prototype keys cannot become app state", () => {
  const { context: c } = setup();
  const state = c.GuideStore.defaults();
  state.nickname = "<script>alert(1)</script>";
  state.checks.random = "done";
  const validated = c.GuideStore.validate(state);
  assert.equal(validated.nickname, undefined);
  assert.equal(validated.checks.random, undefined);
  assert.equal(Object.keys(validated.checks).length, 0);
});

test("loan math: interest-free, APR, flat rate and tiny rates remain finite", () => {
  const { context: c } = setup();
  assert.equal(c.GuideMath.loan(120000, 0, 24, "apr").monthly, 5000);
  assert.equal(c.GuideMath.loan(0, 5, 60, "flat").monthly, 0);
  const apr = c.GuideMath.loan(150000, 5, 60, "apr");
  assert.ok(Math.abs(apr.monthly - 2830.685) < 0.01);
  assert.ok(Math.abs(apr.interest - 19841.1) < 0.1);
  const flat = c.GuideMath.loan(150000, 5, 60, "flat");
  assert.equal(flat.monthly, 3125);
  assert.equal(flat.interest, 37500);
  assert.ok(
    Number.isFinite(c.GuideMath.loan(100000, 1e-14, 36, "apr").monthly),
  );
  assert.throws(() => c.GuideMath.loan(1, 5, 0, "apr"));
  assert.throws(() => c.GuideMath.loan(-1, 5, 60, "apr"));
});

test("budget handles cash, loans, missing fields, zero costs and negative cash flow", () => {
  const { context: c } = setup();
  assert.equal(c.GuideMath.budget(c.GuideStore.defaults().budget).ready, false);
  const b = sample();
  const r = c.GuideMath.budget(b);
  assert.equal(r.upfront, 68500);
  assert.equal(r.cashLeft, 11500);
  assert.equal(r.operating, 1700);
  assert.ok(Math.abs(r.monthlyLeft - (5000 - 1700 - r.monthly)) < 0.001);
  assert.equal(c.GuideMath.budget({ ...b, down: 150001 }).ready, false);
  assert.equal(c.GuideMath.budget({ ...b, price: 0 }).ready, false);
  const cash = c.GuideMath.budget({
    ...b,
    payment: "cash",
    down: "",
    rate: "",
  });
  assert.equal(cash.monthly, 0);
  assert.equal(cash.interest, 0);
  assert.equal(cash.upfront, 168500);
  assert.equal(cash.cashLeft, -88500);
  assert.equal(c.GuideMath.budget({ ...b, monthly: 0 }).monthlyLeft < 0, true);
  assert.equal(c.GuideMath.budget({ ...b, operating: 0 }).operating, 0);
  assert.equal(c.GuideMath.budget({ ...b, price: 999999 }).outsideBand, true);
  assert.equal(
    c.GuideMath.budget({ ...b, price: 999999, operating: 2000 }).outsideBand,
    false,
  );
});

test("hard requirements gate weighted candidate scores", () => {
  const { context: c } = setup();
  const s = c.GuideStore.defaults(),
    car = s.cars[0];
  assert.equal(c.GuideMath.score(car, s.weights), null);
  car.active = true;
  car.hard = "yes";
  assert.equal(c.GuideMath.score(car, s.weights), null);
  for (const [id] of c.GuideData.criteria) car.ratings[id] = 4;
  assert.equal(c.GuideMath.score(car, s.weights), 4);
  car.hard = "no";
  assert.equal(c.GuideMath.score(car, s.weights), null);
});

test("corrupt persisted saves are preserved until explicit replacement", () => {
  const h = setup(),
    s = h.context.GuideStore;
  h.data.set(s.key, "broken");
  assert.equal(s.load().page, "home");
  assert.equal(s.save(s.defaults()), false);
  assert.equal(h.data.get(s.key), "broken");
  assert.ok(s.message);
  assert.equal(s.replace(s.defaults()), true);
  assert.equal(s.message, "");
  assert.equal(s.save(s.defaults()), true);
});

test("storage failure preserves old backup and reset only touches owned key", () => {
  const h = setup(),
    s = h.context.GuideStore;
  s.save(s.defaults());
  const old = h.data.get(s.key);
  h.data.set("unrelated-app", "keep");
  h.storage.failWrite = true;
  assert.equal(s.replace(s.defaults()), false);
  assert.equal(h.data.get(s.key), old);
  assert.equal(s.reset(), false);
  h.storage.failWrite = false;
  assert.equal(s.reset(), true);
  assert.equal(h.data.get("unrelated-app"), "keep");
});

test("storage denied on startup does not crash the UI", () => {
  const h = setup();
  h.storage.failRead = true;
  h.start();
  assert.match(h.document.querySelector("main").textContent, /你好/);
  assert.ok(
    h.document.getElementById("storage-warning").textContent.length > 0,
  );
});

test("all pages render, static inputs have labels, source and emergency remain reachable", () => {
  const h = setup();
  h.start();
  for (const [page] of h.context.GuideData.pages) {
    h.click(`[data-action="nav"][data-value="${page}"]`);
    assert.ok(h.document.querySelector("h1"));
    assert.equal(h.saved().page, page);
    for (const element of h.document.querySelectorAll("select,input")) {
      assert.ok(
        element.getAttribute("aria-label") ||
          h.document.querySelector(`label[for="${element.id}"]`),
        `Label for ${element.id}`,
      );
    }
    const ids = [...h.document.querySelectorAll("[id]")].map((el) => el.id);
    assert.equal(ids.length, new Set(ids).size, `Unique IDs on ${page}`);
    assert.ok(h.document.querySelector('footer [data-action="about"]'));
    assert.ok(h.document.querySelector('footer [data-action="emergency"]'));
  }
});

test("questionnaire enforces value limit, supports priorities and restores progress", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="needs"]');
  h.click("#option-open");
  h.change('[data-priority="policy:open"]', 3);
  h.click("#question-6");
  for (const id of ["safety", "design", "smart", "brand"])
    h.click(`#option-${id}`);
  assert.equal(h.saved().needs.values.length, 3);
  assert.equal(h.saved().priorities["policy:open"], 3);
  h.click("#option-safety");
  h.click("#option-brand");
  assert.ok(h.saved().needs.values.includes("brand"));
  const reloaded = setup({ data: h.data });
  reloaded.start();
  assert.match(
    reloaded.document.querySelector(".question-panel h2").textContent,
    /最在意/,
  );
  assert.equal(
    reloaded.document
      .querySelector("#option-brand")
      .getAttribute("aria-pressed"),
    "true",
  );
});

test("budget sample is explicit; invalid edits cannot reuse stale results", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="budget"]');
  h.click('[data-action="sample"]');
  assert.equal(h.saved().budget.price, "");
  h.click('[data-action="sample-confirm"]');
  assert.equal(h.saved().budget.price, 150000);
  assert.ok(h.document.querySelector(".big-money"));
  h.change("#budget-monthly", -1, "input", false);
  assert.equal(h.saved().budget.monthly, "");
  assert.equal(h.document.querySelector(".big-money"), null);
  h.change("#budget-cash", 90000, "input");
  assert.equal(h.document.querySelector(".big-money"), null);
  h.change("#budget-monthly", 5000, "input");
  assert.ok(h.document.querySelector(".big-money"));
});

test("candidate scores, checklist done and N/A flow persist", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="compare"]');
  h.click('[data-action="car-active"][data-value="0"]');
  h.change("#car-0-hard", "yes");
  for (const [id] of h.context.GuideData.criteria)
    h.change(`#rating-0-${id}`, 5);
  assert.match(
    h.document.querySelector(".candidate-score").textContent,
    /5.00/,
  );
  h.change("#car-0-hard", "no");
  assert.match(
    h.document.querySelector(".candidate-score").textContent,
    /未通过/,
  );
  h.click('[data-action="nav"][data-value="checklist"]');
  const check = h.document.querySelector("#check-0-drive-route");
  check.checked = true;
  check.dispatchEvent(new h.dom.Event("change", { bubbles: true }));
  assert.equal(h.saved().checks["0:drive-route"], "done");
  assert.ok(h.document.querySelector(".check-row.status-done"));
  h.click("#na-0-drive-route");
  assert.equal(h.saved().checks["0:drive-route"], "na");
  assert.ok(h.document.querySelector(".check-row.status-na"));
  assert.match(h.document.querySelector("#na-0-drive-route").textContent, /⚠/);
  h.click("#na-0-drive-route");
  assert.equal(h.saved().checks["0:drive-route"], undefined);
});

test("drive and deal checklists are bound per candidate and legacy keys migrate", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="compare"]');
  h.click('[data-action="car-active"][data-value="0"]');
  h.click('[data-action="car-active"][data-value="1"]');
  h.click('[data-action="nav"][data-value="checklist"]');
  assert.ok(h.document.querySelector("#pick-car-0.active"));
  const checkA = h.document.querySelector("#check-0-drive-route");
  checkA.checked = true;
  checkA.dispatchEvent(new h.dom.Event("change", { bubbles: true }));
  assert.equal(h.saved().checks["0:drive-route"], "done");
  h.click("#pick-car-1");
  assert.equal(h.saved().checklistCar, 1);
  assert.ok(!h.document.querySelector("#check-1-drive-route").checked);
  assert.equal(h.saved().checks["1:drive-route"], undefined);
  // 验车 / 提车清单不按候选车分开，无选择器。
  h.click('[data-action="checklist-tab"][data-value="delivery"]');
  assert.equal(h.document.querySelector(".car-picker"), null);
  assert.ok(h.document.querySelector("#check-delivery-vin"));
  // 旧存档裸键迁移到候选 A，不视为损坏。
  const legacy = h.context.GuideStore.defaults();
  legacy.checks["drive-route"] = "na";
  legacy.checks["deal-price"] = "done";
  legacy.checks["delivery-vin"] = "done";
  const migrated = h.context.GuideStore.validate(legacy);
  assert.equal(migrated.checks["0:drive-route"], "na");
  assert.equal(migrated.checks["0:deal-price"], "done");
  assert.equal(migrated.checks["drive-route"], undefined);
  assert.equal(migrated.checks["delivery-vin"], "done");
  assert.equal(migrated.checklistCar, 0);
  assert.throws(() =>
    h.context.GuideStore.validate({ ...legacy, checklistCar: 3 }),
  );
});

test("dimension guide answers persist, toggle off and reject invalid values", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="compare"]');
  const guide = h.context.GuideData.criteriaGuide;
  assert.equal(Object.keys(guide).length, 7);
  for (const [id] of h.context.GuideData.criteria)
    assert.ok(guide[id] && guide[id].length > 0, `guide for ${id}`);
  h.click("#chip-energy-charge-home");
  assert.equal(h.saved().dimAnswers["energy:charge"], "home");
  assert.ok(h.document.querySelector(".chip-hint"));
  h.click("#chip-energy-charge-no");
  assert.equal(h.saved().dimAnswers["energy:charge"], "no");
  h.click("#chip-energy-charge-no");
  assert.equal(h.saved().dimAnswers["energy:charge"], undefined);
  const reloaded = setup({ data: h.data });
  reloaded.start();
  assert.ok(reloaded.document.querySelector("#dim-energy"));
  const bad = h.context.GuideStore.defaults();
  bad.dimAnswers["energy:charge"] = "hack";
  assert.throws(() => h.context.GuideStore.validate(bad));
  const legacy = h.context.GuideStore.defaults();
  delete legacy.dimAnswers;
  delete legacy.checklistCar;
  assert.equal(h.context.GuideStore.validate(legacy).checklistCar, 0);
});

test("compare table echoes the picked dimension answers", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="compare"]');
  const echo = h.document.getElementById("echo-power");
  assert.ok(echo, "every dimension row has an echo box");
  assert.ok(echo.classList.contains("empty"));
  assert.match(echo.textContent, /还没答/);
  // 未答时给一个回到答题区的入口，点了会展开该维度
  h.click('#echo-space [data-action="dim-open"]');
  assert.equal(h.document.getElementById("dim-space").open, true);
  h.click("#chip-power-need-enough");
  const after = h.document.getElementById("echo-power");
  assert.ok(!after.classList.contains("empty"));
  assert.match(after.textContent, /够用、平顺就好/);
  assert.match(after.textContent, /还有 1 题没答/);
  h.click("#chip-power-load-yes");
  assert.match(h.document.getElementById("echo-power").textContent, /经常满载/);
  assert.doesNotMatch(
    h.document.getElementById("echo-power").textContent,
    /还有 1 题没答/,
  );
});

test("tapping a dimension chip updates that question without repainting", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="compare"]');
  const block = h.document.getElementById("dim-power");
  block.open = true;
  const chip = h.document.getElementById("chip-power-need-enough");
  assert.equal(
    h.document.getElementById("hint-power-need").hasAttribute("hidden"),
    true,
  );
  h.click("#chip-power-need-enough");
  // 同一批节点仍在：说明没有整页重绘，手机端不会被滚动甩到候选车卡片
  assert.equal(h.document.getElementById("dim-power"), block);
  assert.equal(h.document.getElementById("chip-power-need-enough"), chip);
  assert.equal(block.open, true);
  assert.ok(chip.classList.contains("selected"));
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  const hint = h.document.getElementById("hint-power-need");
  assert.equal(hint.hasAttribute("hidden"), false);
  assert.match(hint.textContent, /感受起步与刹车线性/);
  assert.equal(
    h.document.getElementById("dim-count-power").textContent,
    "1 / 2",
  );
  assert.match(
    h.document.getElementById("dim-total").textContent,
    /已答 1 \/ 14 题/,
  );
  assert.equal(h.saved().dimAnswers["power:need"], "enough");
  // 再点一次取消：选中态与提示一起撤回
  h.click("#chip-power-need-enough");
  assert.equal(chip.classList.contains("selected"), false);
  assert.equal(chip.getAttribute("aria-pressed"), "false");
  assert.equal(
    h.document.getElementById("hint-power-need").hasAttribute("hidden"),
    true,
  );
  assert.equal(
    h.document.getElementById("dim-count-power").textContent,
    "0 / 2",
  );
});

test("external changes pause writes rather than silently overwriting another tab", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="needs"]');
  const original = h.data.get(h.context.GuideStore.key);
  h.listeners.storage({ key: h.context.GuideStore.key });
  h.click("#option-open");
  assert.equal(h.data.get(h.context.GuideStore.key), original);
  assert.match(
    h.document.getElementById("storage-warning").textContent,
    /暂停保存/,
  );
});

test("reset requires confirmation; cancel retains state", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="needs"]');
  h.click("#option-open");
  h.click("#save-status");
  h.click('[data-action="reset-confirm"]');
  h.click('[data-action="close"]');
  assert.equal(h.saved().needs.policy[0], "open");
  h.click("#save-status");
  h.click('[data-action="reset-confirm"]');
  h.click('[data-action="reset"]');
  assert.equal(h.data.has(h.context.GuideStore.key), false);
  assert.match(h.document.querySelector("h1").textContent, /你好/);
});

async function importFile(h, text) {
  h.click("#save-status");
  const input = h.document.getElementById("import-file");
  Object.defineProperty(input, "files", {
    value: [{ size: text.length, text: async () => text }],
  });
  input.dispatchEvent(new h.dom.Event("change", { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));
}

test("backup import waits for confirmation and restores the complete plan", async () => {
  const h = setup();
  h.start();
  const state = h.context.GuideStore.defaults();
  state.page = "report";
  state.budget = sample();
  state.needs.policy = ["open"];
  state.checks["delivery-charge"] = "na";
  await importFile(h, h.context.GuideStore.encode(state));
  assert.equal(h.data.has(h.context.GuideStore.key), false);
  h.click("#confirm-import");
  assert.equal(h.saved().page, "report");
  assert.equal(h.saved().budget.price, 150000);
  assert.equal(h.saved().checks["delivery-charge"], "na");
  assert.ok(h.document.querySelector(".report-cover"));
});

test("invalid import reports inside the modal and leaves data unchanged", async () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="needs"]');
  h.click("#option-open");
  const old = h.data.get(h.context.GuideStore.key);
  await importFile(h, "{broken");
  assert.equal(h.data.get(h.context.GuideStore.key), old);
  assert.match(
    h.document.querySelector("#dialog-status").textContent,
    /无法导入/,
  );
});

test("failed import storage write never deletes the previous valid save", async () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="needs"]');
  h.click("#option-open");
  const old = h.data.get(h.context.GuideStore.key);
  await importFile(
    h,
    h.context.GuideStore.encode(h.context.GuideStore.defaults()),
  );
  h.storage.failWrite = true;
  h.click("#confirm-import");
  assert.equal(h.data.get(h.context.GuideStore.key), old);
  assert.match(
    h.document.querySelector("#dialog-status").textContent,
    /原存档未主动删除/,
  );
});

test("candidate landing price persists, migrates and rejects invalid values", () => {
  const h = setup(),
    s = h.context.GuideStore;
  assert.equal(s.defaults().cars[0].price, "");
  const state = s.defaults();
  state.cars[0].price = 168000;
  assert.equal(s.validate(state).cars[0].price, 168000);
  const legacy = s.defaults();
  delete legacy.cars[0].price;
  assert.equal(s.validate(legacy).cars[0].price, "");
  for (const bad of [-1, "123", Infinity, 100000001])
    assert.throws(() => {
      const draft = s.defaults();
      draft.cars[0].price = bad;
      s.validate(draft);
    });
  // 第 8 步（优先级）合法，越界仍然拒绝。
  const step8 = s.defaults();
  step8.needIndex = h.context.GuideData.needs.length;
  assert.equal(s.validate(step8).needIndex, 7);
  assert.throws(() => {
    const draft = s.defaults();
    draft.needIndex = h.context.GuideData.needs.length + 1;
    s.validate(draft);
  });
});

test("priority step is reachable, saves levels and drives the compare gate", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="compare"]');
  // 没有必须满足项时，对比页给出直达优先级的入口。
  assert.ok(
    h.document.querySelector('details.compact [data-action="priorities"]'),
  );
  h.click('[data-action="priorities"]');
  assert.equal(h.saved().page, "needs");
  assert.equal(h.saved().needIndex, h.context.GuideData.needs.length);
  assert.ok(h.document.querySelector(".priority-panel"));
  h.click('[data-action="question"][data-value="0"]');
  h.click("#option-open");
  h.click('[data-action="priorities"]');
  assert.equal(h.document.querySelectorAll(".prio-row").length, 1);
  h.click('[data-action="priority"][data-value="policy:open:3"]');
  assert.equal(h.saved().priorities["policy:open"], 3);
  assert.match(
    h.document.getElementById("prio-summary").textContent,
    /必须满足 1 条/,
  );
  h.click('[data-action="nav"][data-value="compare"]');
  assert.ok(h.document.querySelector("details.compact ul li"));
  assert.equal(
    h.document.querySelector('details.compact [data-action="priorities"]'),
    null,
  );
});

test("candidate landing price compares to the budget and fills back", () => {
  const h = setup();
  const state = h.context.GuideStore.defaults();
  state.budget = sample();
  state.page = "compare";
  state.cars[0].active = true;
  h.context.GuideStore.save(state);
  h.start();
  // 落地价基准 = 裸车价 + 购置税 + 保险 + 上牌 + 其他 = 168,500。
  assert.match(h.document.querySelector(".budget-cap").textContent, /168,500/);
  h.change("#car-0-price", 160000, "input");
  assert.equal(h.saved().cars[0].price, 160000);
  assert.match(h.document.getElementById("afford-0").textContent, /预算内/);
  h.change("#car-0-price", 180000, "input");
  assert.match(h.document.getElementById("afford-0").textContent, /超出预算/);
  h.change("#car-0-price", -1, "input", false);
  assert.equal(h.saved().cars[0].price, "");
  h.change("#car-0-price", 168500, "input");
  h.click('[data-action="car-to-budget"]');
  h.click('[data-action="car-to-budget-confirm"]');
  assert.equal(h.saved().budget.price, 150000);
  assert.equal(h.saved().page, "budget");
});

test("progress dots distinguish skipped questions from answered ones", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="needs"]');
  assert.ok(h.document.getElementById("question-priority"));
  h.click('[data-action="question"][data-value="1"]');
  assert.ok(h.document.querySelector("#question-0.skipped"));
  h.click('[data-action="question"][data-value="0"]');
  h.click("#option-open");
  assert.ok(h.document.querySelector("#question-0.answered"));
  assert.equal(h.document.querySelector("#question-0.skipped"), null);
  assert.match(
    h.document.querySelector(".question-note").textContent,
    /还有 6 题未回答/,
  );
});

test("cross-tab warning offers export and reload actions", () => {
  const h = setup();
  h.start();
  assert.equal(h.document.getElementById("storage-warning").textContent, "");
  h.listeners.storage({ key: h.context.GuideStore.key });
  const warning = h.document.getElementById("storage-warning");
  assert.match(warning.textContent, /暂停保存/);
  assert.ok(warning.querySelector('[data-action="export"]'));
  assert.ok(warning.querySelector('[data-action="reload"]'));
});

test("fully filled report reaches 100 percent without asserting purchase suitability", () => {
  const h = setup();
  const state = h.context.GuideStore.defaults();
  for (const need of h.context.GuideData.needs)
    state.needs[need.id] = [need.options[0][0]];
  state.budget = sample();
  state.page = "report";
  state.cars[0].active = true;
  state.cars[0].hard = "yes";
  for (const [id] of h.context.GuideData.criteria)
    state.cars[0].ratings[id] = 3;
  for (const group of h.context.GuideData.checklists)
    for (const [, rows] of group.groups)
      for (const [id] of rows)
        state.checks[group.perCar ? `0:${id}` : id] = "done";
  h.context.GuideStore.save(state);
  h.start();
  assert.match(h.document.querySelector(".report-percent").textContent, /100/);
  assert.match(
    h.document.querySelector(".report-disclaimer").textContent,
    /不构成/,
  );
});

test("runtime entry only references local assets and no unsolicited network calls", () => {
  const { document } = setup();
  for (const el of document.querySelectorAll(
    'script[src],link[rel="stylesheet"]',
  ))
    assert.match(el.getAttribute("src") || el.getAttribute("href"), /^\.\//);
  const source = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sendBeacon|eval\(/);
});

test("answering a question keeps the scroll position instead of jumping to top", () => {
  const h = setup();
  h.start();
  h.click('[data-action="nav"][data-value="needs"]');
  const calls = [];
  h.context.scrollTo = (x, y) => calls.push([x, y]);
  h.context.scrollY = 640;
  h.click("#option-open");
  assert.equal(h.saved().needs.policy[0], "open");
  assert.deepEqual(calls[calls.length - 1], [0, 640]);
  assert.ok(!calls.some(([x, y]) => x === 0 && y === 0));
});

test("clicking outside a dialog closes it, clicking inside keeps it open", () => {
  const h = setup();
  h.start();
  h.click('[data-action="necessity"]');
  const dialog = h.document.getElementById("dialog");
  assert.equal(dialog.open, true);
  dialog.dispatchEvent(new h.dom.Event("click", { bubbles: true }));
  assert.equal(dialog.open, true);
  const outside = new h.dom.Event("click", { bubbles: true });
  outside.clientX = 900;
  outside.clientY = 900;
  dialog.dispatchEvent(outside);
  assert.equal(dialog.open, false);
});

test("trial checklist no longer duplicates the seven dimensions", () => {
  const h = setup();
  h.start();
  const ids = h.context.GuideData.checklists.flatMap((list) =>
    list.groups.flatMap(([, rows]) => rows.map(([id]) => id)),
  );
  for (const gone of ["drive-chassis", "drive-space", "drive-smart"])
    assert.ok(!ids.includes(gone), `${gone} merged into drive-feel`);
  assert.ok(ids.includes("drive-feel"));
  h.click('[data-action="nav"][data-value="compare"]');
  h.click('[data-action="checklist-drive"]');
  assert.equal(h.saved().page, "checklist");
  assert.equal(h.saved().checklistTab, "drive");
  assert.ok(
    h.document.querySelector(
      '.list-cross [data-action="nav"][data-value="compare"]',
    ),
  );
});
