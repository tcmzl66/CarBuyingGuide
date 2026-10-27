"use strict";

// Replace this adapter with an authorized cloud adapter without changing the UI.
window.GuideStore = (() => {
  const KEY = "wy-first-car:v1";
  const FORMAT = "wy-first-car";
  const MAX_BYTES = 100000;
  let blocked = false;
  let message = "";
  const object = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const numericKeys = [
    "monthly",
    "cash",
    "price",
    "down",
    "tax",
    "insurance",
    "registration",
    "extras",
    "rate",
    "operating",
  ];
  function defaults() {
    return {
      version: 1,
      page: "home",
      guideStep: 0,
      needIndex: 0,
      necessity: "",
      needs: Object.fromEntries(GuideData.needs.map((n) => [n.id, []])),
      priorities: {},
      budget: {
        monthly: "",
        cash: "",
        price: "",
        down: "",
        tax: "",
        insurance: "",
        registration: "",
        extras: "",
        rate: "",
        operating: "",
        band: "13-18",
        payment: "loan",
        method: "apr",
        months: 36,
      },
      weights: Object.fromEntries(GuideData.criteria.map((c) => [c[0], 2])),
      dimAnswers: {},
      cars: Array.from({ length: 3 }, () => ({
        active: false,
        energy: "",
        hard: "",
        // 落地价（含税费保险等），只用于对照预算，不参与加权评分。
        price: "",
        ratings: {},
      })),
      checklistTab: "drive",
      checklistCar: 0,
      checks: {},
      updatedAt: null,
    };
  }
  function validate(input) {
    if (!object(input) || input.version !== 1)
      throw new Error("Unsupported save version.");
    const state = defaults();
    const choose = (value, choices) => {
      if (!choices.includes(value)) throw new Error("Invalid option.");
      return value;
    };
    const num = (value, max, blank = true) => {
      if (blank && value === "") return "";
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > max
      )
        throw new Error("Invalid number.");
      return value;
    };
    state.page = choose(
      input.page,
      GuideData.pages.map((p) => p[0]),
    );
    // 旧存档没有 guideStep 时按默认值迁移，不视为损坏。
    if (input.guideStep !== undefined) {
      const maxStep = window.GuideKB ? GuideKB.steps.length - 1 : 6;
      state.guideStep = num(input.guideStep, maxStep, false);
      if (!Number.isInteger(state.guideStep))
        throw new Error("Invalid guide step.");
    }
    // 索引 0..length-1 是七个问题，length 代表「第 8 步 · 给需求排优先级」。
    state.needIndex = num(input.needIndex, GuideData.needs.length, false);
    if (!Number.isInteger(state.needIndex))
      throw new Error("Invalid question index.");
    state.necessity = choose(input.necessity, [
      "",
      "needed",
      "consider",
      "wait",
    ]);
    if (
      !object(input.needs) ||
      !object(input.priorities) ||
      !object(input.budget) ||
      !object(input.weights) ||
      !object(input.checks)
    )
      throw new Error("Incomplete save.");
    // 旧存档没有 dimAnswers 时按默认值迁移，不视为损坏。
    if (input.dimAnswers !== undefined && !object(input.dimAnswers))
      throw new Error("Incomplete save.");
    for (const need of GuideData.needs) {
      const answers = input.needs[need.id];
      if (
        !Array.isArray(answers) ||
        answers.length >
          (need.multiple ? need.limit || need.options.length : 1) ||
        new Set(answers).size !== answers.length
      )
        throw new Error("Invalid answers.");
      state.needs[need.id] = answers.map((a) =>
        choose(
          a,
          need.options.map((o) => o[0]),
        ),
      );
      for (const option of need.options) {
        const id = `${need.id}:${option[0]}`;
        if (own(input.priorities, id))
          state.priorities[id] = choose(input.priorities[id], [1, 2, 3]);
      }
    }
    for (const key of numericKeys)
      state.budget[key] = num(
        input.budget[key],
        key === "rate" ? 100 : 100000000,
      );
    state.budget.band = choose(
      input.budget.band,
      GuideData.costs.map((c) => c.id),
    );
    state.budget.payment = choose(input.budget.payment, ["loan", "cash"]);
    state.budget.method = choose(input.budget.method, ["apr", "flat"]);
    state.budget.months = choose(input.budget.months, [12, 24, 36, 48, 60]);
    for (const [id] of GuideData.criteria)
      state.weights[id] = choose(input.weights[id], [1, 2, 3]);
    // 七维度细分自测答案：键为「维度:题目」，只接受白名单选项。
    if (object(input.dimAnswers))
      for (const dimId of Object.keys(GuideData.criteriaGuide))
        for (const q of GuideData.criteriaGuide[dimId]) {
          const key = `${dimId}:${q.id}`;
          if (own(input.dimAnswers, key))
            state.dimAnswers[key] = choose(
              input.dimAnswers[key],
              q.options.map((o) => o[0]),
            );
        }
    if (!Array.isArray(input.cars) || input.cars.length !== 3)
      throw new Error("Invalid candidates.");
    state.cars = input.cars.map((car) => {
      if (
        !object(car) ||
        typeof car.active !== "boolean" ||
        !object(car.ratings)
      )
        throw new Error("Invalid candidate.");
      const result = {
        active: car.active,
        energy: choose(car.energy, ["", "fuel", "hev", "bev", "phev", "erev"]),
        hard: choose(car.hard, ["", "yes", "no"]),
        price: "",
        ratings: {},
      };
      // 落地价是后加的字段，旧存档缺失时按空值迁移，不判为损坏。
      if (car.price !== undefined) result.price = num(car.price, 100000000);
      for (const [id] of GuideData.criteria)
        if (own(car.ratings, id))
          result.ratings[id] = choose(car.ratings[id], [1, 2, 3, 4, 5]);
      return result;
    });
    state.checklistTab = choose(
      input.checklistTab,
      GuideData.checklists.map((c) => c.id),
    );
    // 旧存档没有 checklistCar 时按默认值迁移，不视为损坏。
    if (input.checklistCar !== undefined) {
      state.checklistCar = num(input.checklistCar, 2, false);
      if (!Number.isInteger(state.checklistCar))
        throw new Error("Invalid checklist car.");
    }
    for (const list of GuideData.checklists)
      for (const [, items] of list.groups)
        for (const [id] of items) {
          if (list.perCar) {
            // 试驾 / 谈价合同按候选车分开存储，键名为「车位序号:项目id」。
            for (const i of [0, 1, 2]) {
              const key = `${i}:${id}`;
              if (own(input.checks, key))
                state.checks[key] = choose(input.checks[key], ["done", "na"]);
            }
            // 旧存档的裸键迁移到候选 A，不视为损坏。
            if (own(input.checks, id) && !own(input.checks, `0:${id}`))
              state.checks[`0:${id}`] = choose(input.checks[id], [
                "done",
                "na",
              ]);
          } else if (own(input.checks, id))
            state.checks[id] = choose(input.checks[id], ["done", "na"]);
        }
    if (
      input.updatedAt !== null &&
      (typeof input.updatedAt !== "string" ||
        input.updatedAt.length > 32 ||
        !Number.isFinite(Date.parse(input.updatedAt)))
    )
      throw new Error("Invalid timestamp.");
    state.updatedAt = input.updatedAt;
    return state;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      if (raw.length > MAX_BYTES) throw new Error("Save too large.");
      return validate(JSON.parse(raw));
    } catch (error) {
      blocked = true;
      message =
        "无法读取本地存档，原数据未覆盖。本次可继续使用；请在数据管理中备份原存档或确认重置。";
      return defaults();
    }
  }
  function save(state) {
    if (blocked) return false;
    try {
      state.updatedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(validate(state)));
      message = "";
      return true;
    } catch (error) {
      message =
        "本地保存失败（可能是无权限或空间不足）。当前操作仍在内存中，请导出备份，关闭后可能丢失。";
      return false;
    }
  }
  function replace(state) {
    try {
      const next = validate(state);
      next.updatedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(next));
      state.updatedAt = next.updatedAt;
      blocked = false;
      message = "";
      return true;
    } catch (error) {
      message = "导入未保存，原存档未主动删除。请保留备份并检查浏览器权限。";
      return false;
    }
  }
  function reset() {
    try {
      localStorage.removeItem(KEY);
      blocked = false;
      message = "";
      return true;
    } catch (error) {
      message = "无法删除本地存档，请检查浏览器权限。";
      return false;
    }
  }
  function decode(text) {
    if (text.length > MAX_BYTES) throw new Error("Backup too large.");
    const data = JSON.parse(text);
    if (!object(data) || data.format !== FORMAT || data.version !== 1)
      throw new Error("Invalid backup format.");
    return validate(data.state);
  }
  return {
    key: KEY,
    defaults,
    validate,
    load,
    save,
    replace,
    reset,
    decode,
    get message() {
      return message;
    },
    encode: (state) =>
      JSON.stringify(
        { format: FORMAT, version: 1, state: validate(state) },
        null,
        2,
      ),
    raw: () => localStorage.getItem(KEY),
  };
})();

window.GuideMath = {
  loan(principal, annualRate, months, method) {
    if (
      !Number.isFinite(principal) ||
      principal < 0 ||
      !Number.isFinite(annualRate) ||
      annualRate < 0 ||
      !Number.isInteger(months) ||
      months <= 0 ||
      !["apr", "flat"].includes(method)
    )
      throw new Error("Invalid loan inputs.");
    const r = annualRate / 1200;
    const monthly =
      principal === 0
        ? 0
        : r === 0
          ? principal / months
          : method === "flat"
            ? principal / months + principal * r
            : (principal * r) / -Math.expm1(-months * Math.log1p(r));
    return { monthly, interest: Math.max(0, monthly * months - principal) };
  },
  budget(b) {
    const required = [
      "monthly",
      "cash",
      "price",
      "tax",
      "insurance",
      "registration",
      "extras",
    ];
    if (b.payment === "loan") required.push("down", "rate");
    if (required.some((k) => b[k] === ""))
      return { ready: false, error: "填写全部金额后计算；没有的费用请填 0。" };
    if (
      required.some(
        (k) => typeof b[k] !== "number" || !Number.isFinite(b[k]) || b[k] < 0,
      )
    )
      return { ready: false, error: "金额需为有效的非负数。" };
    if (b.price <= 0) return { ready: false, error: "裸车价需要大于 0。" };
    if (b.payment === "loan" && b.down > b.price)
      return { ready: false, error: "裸车首付不能超过裸车价。" };
    const cost = GuideData.costs.find((c) => c.id === b.band);
    const operating = b.operating === "" ? cost.high : b.operating;
    const principal = b.payment === "loan" ? b.price - b.down : 0;
    const loan = GuideMath.loan(
      principal,
      b.payment === "loan" ? b.rate : 0,
      b.months,
      b.method,
    );
    const fees = b.tax + b.insurance + b.registration + b.extras;
    const upfront = b.price - principal + fees;
    return {
      ready: true,
      ...loan,
      principal,
      operating,
      upfront,
      total: b.price + fees + loan.interest,
      cashLeft: b.cash - upfront,
      monthlyLeft: b.monthly - operating - loan.monthly,
      capacity: Math.max(0, b.monthly - operating),
      cost,
      outsideBand:
        b.operating === "" && (b.price < cost.min || b.price > cost.max),
    };
  },
  score(car, weights) {
    if (
      !car.active ||
      car.hard !== "yes" ||
      GuideData.criteria.some(([id]) => !car.ratings[id])
    )
      return null;
    const total = GuideData.criteria.reduce(
      (sum, [id]) => sum + car.ratings[id] * weights[id],
      0,
    );
    return (
      total / GuideData.criteria.reduce((sum, [id]) => sum + weights[id], 0)
    );
  },
};
