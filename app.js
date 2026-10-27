"use strict";

(() => {
  const D = window.GuideData;
  const KB = window.GuideKB;
  const Store = window.GuideStore;
  const M = window.GuideMath;
  let state = Store.load();
  let toastTimer;
  let dialogOpener;
  let externalChange = false;
  // 浏览器返回键与深链：页面与 #/page 保持同步；容器不支持 History API 时静默降级。
  const routePages = D.pages.map((page) => page[0]);
  let routeHash = "";
  const canRoute = Boolean(
    window.history && typeof window.history.pushState === "function",
  );
  const hashPage = () => {
    const id = String(location.hash || "")
      .replace(/^#\/?/, "")
      .trim();
    return routePages.includes(id) ? id : "";
  };
  function syncRoute(page, replace = false) {
    if (!canRoute) return;
    const hash = `#/${page}`;
    if (!replace && routeHash === hash) return;
    try {
      if (replace) window.history.replaceState({ page }, "", hash);
      else window.history.pushState({ page }, "", hash);
      routeHash = hash;
    } catch (error) {
      // 沙箱 iframe 可能禁止写入历史记录，退化为普通单页导航。
    }
  }
  const app = document.getElementById("app");
  const dialog = document.getElementById("dialog");
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (value) =>
    Number.isFinite(value)
      ? `¥${Math.round(value).toLocaleString("zh-CN")}`
      : "—";
  const labels = { 1: "有就更好", 2: "优先满足", 3: "必须满足" };
  const necessityLabels = {
    needed: "确实能解决高频不便",
    consider: "还需要比较替代方案",
    wait: "暂缓购车也很好",
  };
  const energies = [
    ["", "待确定"],
    ["fuel", "燃油 / 轻混"],
    ["hev", "油混 HEV"],
    ["bev", "纯电 BEV"],
    ["phev", "插混 PHEV"],
    ["erev", "增程 EREV"],
  ];
  const paths = {
    car: '<path d="m5 10 2-5h10l2 5M4 10h16v8H4zM7 18v2m10-2v2M7 14h1m8 0h1"/>',
    home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
    wallet: '<path d="M20 7H4V4h14v3M4 7v13h16V7m0 5h-6v4h6"/>',
    check:
      '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
    document: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
    book: '<path d="M6 3h12v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 7h7M8 11h7"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    alert: '<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
  };
  const icon = (name, cls = "") =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.car}</svg>`;
  const button = (text, action, value = "", cls = "button") =>
    `<button type="button" class="${cls}" data-action="${action}" data-value="${esc(value)}">${text}</button>`;
  const go = (text, page, cls = "button primary") =>
    button(text, "nav", page, cls);
  const selectOptions = (options, value) =>
    options
      .map(
        ([id, label]) =>
          `<option value="${esc(id)}" ${String(id) === String(value) ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  function selectedNeeds() {
    return D.needs.flatMap((n) =>
      n.options
        .filter((o) => state.needs[n.id].includes(o[0]))
        .map((o) => ({
          id: `${n.id}:${o[0]}`,
          title: o[1],
          detail: o[2],
          priority: state.priorities[`${n.id}:${o[0]}`] || 2,
        })),
    );
  }
  function carSlots() {
    // 清单进度只统计已启用的候选车；一台都没启用时按候选 A 计。
    const active = state.cars
      .map((c, i) => (c.active ? i : -1))
      .filter((i) => i >= 0);
    return active.length ? active : [0];
  }
  function progress() {
    const answered = D.needs.filter((n) => state.needs[n.id].length).length;
    const budget = M.budget(state.budget).ready;
    const compared = state.cars.filter(
      (c) => M.score(c, state.weights) !== null,
    ).length;
    const slots = carSlots();
    let checks = 0,
      total = 0;
    for (const list of D.checklists) {
      const items = list.groups.flatMap((g) => g[1]);
      if (list.perCar) {
        total += items.length * slots.length;
        for (const i of slots)
          for (const [id] of items) if (state.checks[`${i}:${id}`]) checks++;
      } else {
        total += items.length;
        for (const [id] of items) if (state.checks[id]) checks++;
      }
    }
    return {
      answered,
      budget,
      compared,
      checks,
      total,
      percent: Math.round(
        ((answered / D.needs.length +
          Number(budget) +
          Math.min(compared, 1) +
          checks / total) /
          4) *
          100,
      ),
    };
  }
  function nextPage() {
    const p = progress();
    return p.answered < D.needs.length
      ? "needs"
      : !p.budget
        ? "budget"
        : !p.compared
          ? "compare"
          : p.checks < p.total
            ? "checklist"
            : "report";
  }
  function notify(message) {
    const dialogStatus = document.getElementById("dialog-status");
    if (dialog.open && dialogStatus) dialogStatus.textContent = message;
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 4200);
  }
  function save() {
    if (externalChange) {
      notify(
        "另一个窗口修改了存档。本窗口暂不覆盖，请先导出本窗口或重新载入。",
      );
      return false;
    }
    const saved = Store.save(state);
    updateSaveStatus();
    return saved;
  }
  // 页面切换统一走这里：存档 + 地址栏 + 重渲染，返回键才能回到上一板块。
  function navigate(page) {
    state.page = page;
    save();
    syncRoute(page);
    render(true);
  }
  function updateSaveStatus() {
    const status = document.getElementById("save-status");
    if (status) {
      status.innerHTML = `${icon(Store.message || externalChange ? "alert" : "shield")} ${Store.message || externalChange ? "暂未保存 · 查看数据管理" : state.updatedAt ? "已保存在此设备" : "仅在此设备保存"}`;
    }
    const warning = document.getElementById("storage-warning");
    if (warning) {
      const text = externalChange
        ? "其他窗口已修改存档。为防止覆盖，本窗口已暂停保存；请导出本窗口，或重新载入其他窗口的进度。"
        : Store.message;
      warning.innerHTML = text
        ? `${icon("alert")}<span>${esc(text)}</span><div class="notice-actions">${button("导出本窗口", "export", "", "text-button")}${button("重新载入", "reload", "", "text-button")}</div>`
        : "";
      warning.hidden = !text;
    }
  }
  // 手机端导航吸顶后，标签栏要贴在它下面；高度按实际渲染结果测量，避免写死。
  function syncNavHeight() {
    const style = document.documentElement.style;
    // 只在窄屏吸顶时生效，桌面侧栏高度不宜写进变量。
    if (!window.matchMedia?.("(max-width: 760px)")?.matches) {
      style.removeProperty("--nav-h");
      return;
    }
    const rect = app.querySelector(".sidebar")?.getBoundingClientRect?.();
    if (!rect || !rect.height) return;
    style.setProperty("--nav-h", `${Math.round(rect.height)}px`);
  }
  function reveal(selector) {
    document.querySelector(selector)?.scrollIntoView?.({ block: "start" });
  }
  function render(focusMain = false) {
    const focusedId = document.activeElement?.id;
    // 整页重渲染会让文档高度瞬间归零、滚动被夹回顶部；先记住位置，渲染后再放回去。
    const keepY = focusMain ? 0 : window.scrollY || 0;
    const page = D.pages.find((x) => x[0] === state.page);
    app.innerHTML = `<aside class="sidebar">
      <button class="brand" type="button" data-action="nav" data-value="home"><span class="brand-icon">${icon("car")}</span><span class="brand-text">第一辆车<small>你的购车决策助手</small></span></button>
      <div class="nav-label">MY FIRST CAR / 购车旅程</div>
      <nav aria-label="购车流程">${D.pages.map((x, i) => `<button type="button" class="nav-item ${x[0] === state.page ? "active" : ""}" data-action="nav" data-value="${x[0]}" ${x[0] === state.page ? 'aria-current="page"' : ""}>${icon(x[3])}<span>${x[1]}</span>${i > 1 && i < 6 ? `<small>0${i - 1}</small>` : ""}</button>`).join("")}</nav>
      <div class="sidebar-bottom"><div class="sidebar-tip">${icon("compass")}<strong>不替你选车，<br>帮你做自己的决定。</strong><p>没有标准答案，<br>只有更适合你的生活。</p></div>
      ${button(`${icon("alert")} 事故应急速查`, "emergency", "", "emergency-link")}
      ${button(`${icon("info")} 关于与内容来源`, "about", "", "text-button muted")}
      <span class="version">LOCAL FIRST · v1.0</span></div>
    </aside>
    <div class="workspace"><header class="topbar"><span class="breadcrumb">购车手册 <span>/</span> <b>${page[1]}</b></span><button type="button" id="save-status" class="save-status" data-action="data"></button></header>
      <div id="storage-warning" class="notice warning storage-warning" role="alert" hidden></div>
      <main id="main" tabindex="-1">${{ home: homeView, guide: guideView, needs: needsView, budget: budgetView, compare: compareView, checklist: checklistView, report: reportView }[state.page]()}</main>
      <footer class="footer"><button type="button" data-action="about">内容参考 <b>所长Wy</b>《如何买人生第一辆车？》 · 来源说明</button><button type="button" data-action="emergency">事故应急速查</button></footer>
    </div>`;
    updateSaveStatus();
    document.title = `${page[1]} · 第一辆车`;
    // 手机端导航与步骤标签是横向滚动容器，重渲染后要把当前项带回视野。
    for (const el of app.querySelectorAll(
      ".nav-item.active, .step-tabs > button.active",
    ))
      el.scrollIntoView?.({ block: "nearest", inline: "center" });
    // 横向滚动条两端渐隐：只有真正滑过之后才淡化左缘，避免首个项目发灰。
    for (const scroller of app.querySelectorAll(".step-tabs, .sidebar nav")) {
      const sync = () =>
        scroller.classList.toggle("is-scrolled", scroller.scrollLeft > 2);
      scroller.addEventListener("scroll", sync, { passive: true });
      sync();
    }
    if (focusMain) {
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else {
      if (focusedId)
        document.getElementById(focusedId)?.focus({ preventScroll: true });
      if (keepY) window.scrollTo(0, keepY);
    }
    syncNavHeight();
  }
  function heading(kicker, title, description, action = "") {
    return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
  }
  function illustration() {
    return `<div class="hero-art" aria-hidden="true"><div class="art-label">NEXT STOP <b>你的新生活 ↗</b></div><svg viewBox="0 0 500 300" class="car-art"><defs><linearGradient id="paint" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#b9d8ff"/></linearGradient></defs><circle cx="365" cy="100" r="66" fill="#d3e3ff"/><path d="M16 240h455M38 259h348" stroke="#b1c7f6" stroke-width="2"/><path d="m48 219 90-57 278 26 46 30-116 36z" fill="#b4c8f1" opacity=".5"/><path d="m79 164 61-64 139-8 83 61 59 20v38l-45 19H109l-46-25v-31z" fill="url(#paint)" stroke="#7198d6" stroke-width="2"/><path d="m145 108 53-3-3 52-89 1z" fill="#284b85"/><path d="m210 105 63-3 65 52-130 2z" fill="#3c659e"/><path d="m224 111 41-2 46 37-90 1z" fill="#8fb6e6" opacity=".5"/><path d="M204 167v47m-99-52 248 1 48 17" stroke="#7198d6" stroke-width="2" fill="none"/><path d="m67 175 37 8-4 12-32-9m285-12 58 12-1 11-54-9" fill="#fff"/><path d="m108 192 198 8" stroke="#aac5eb" stroke-width="2"/><path d="m376 206 33-3v7l-33 4" fill="#305485"/><path d="M217 173h17m-83-1h16" stroke="#315786" stroke-width="4" stroke-linecap="round"/><ellipse cx="138" cy="215" rx="28" ry="33" fill="#203754"/><ellipse cx="138" cy="215" rx="16" ry="21" fill="#a7bbd6"/><ellipse cx="138" cy="215" rx="7" ry="12" fill="#385575"/><ellipse cx="336" cy="220" rx="28" ry="33" fill="#203754"/><ellipse cx="336" cy="220" rx="16" ry="21" fill="#a7bbd6"/><ellipse cx="336" cy="220" rx="7" ry="12" fill="#385575"/><path d="m87 72 4-10 4 10 10 4-10 4-4 10-4-10-10-4z" fill="#5a80db"/><path d="m430 124 3-7 3 7 7 3-7 3-3 7-3-7-7-3z" fill="#5a80db"/></svg><div class="art-tag">${icon("check")} 适合自己，就是好车</div></div>`;
  }
  function stepItems(step) {
    return step.groups.reduce((n, g) => n + g.items.length, 0);
  }
  function homeView() {
    const p = progress();
    const journey = [
      [
        "needs",
        "01",
        "从生活里，找到需求",
        "七个维度，把「我想要」变成选车标准。",
        `${p.answered} / 7 项已填写`,
        "compass",
      ],
      [
        "budget",
        "02",
        "算一笔不勉强的账",
        "不只看车价，也给每个月的生活留余量。",
        p.budget ? "预算已计算" : "稳定结余法",
        "wallet",
      ],
      [
        "compare",
        "03",
        "亲自试，再做比较",
        "七个维度比较体验，先过硬门槛再看分数。",
        `${state.cars.filter((c) => c.active).length} / 3 台候选`,
        "car",
      ],
      [
        "checklist",
        "04",
        "安心把车带回家",
        "试驾、谈价、合同、验车，重要的事不遗漏。",
        `${p.checks} / ${p.total} 项已处理`,
        "check",
      ],
    ];
    return `${heading("A LITTLE GUIDE, A BIG DECISION", "你好，未来的车主。", "买车不必一开始就懂车。从你的生活出发，一步步找到答案。")}
      <section class="hero"><div class="hero-copy"><span class="pill light">${icon("spark")} 你的第一辆车，从这里开始</span><h2>少一点纠结，<br>多一点<span>确定。</span></h2><p>把一支长视频里的购车方法，<br>变成一份可以边用边填的行动指南。</p><div class="hero-actions">${go(`${p.percent ? "继续我的购车计划" : "开始我的购车计划"} ${icon("arrow")}`, nextPage())}<span>${icon("clock")} 按自己的节奏来</span></div><div class="hero-credit">方法与内容参考 · B站 UP 主 <b>所长Wy</b></div></div>${illustration()}</section>
      <div class="section-heading"><h2>购车大流程 · 七大步骤 <span>从想清楚，到用车养车</span></h2>${go("打开流程百科 ↗", "guide", "text-button")}</div>
      <ol class="step-timeline">${KB.steps.map((s, i) => `<li><button class="step-row" type="button" data-action="guide-step" data-value="${i}"><span class="step-dot">${s.num}</span><span class="step-text"><strong>${s.title} · ${s.tagline}</strong><small class="step-summary">${s.summary}</small></span><span class="step-meta">${s.groups.length} 个小流程 · ${stepItems(s)} 个事项</span>${icon("arrow", "step-arrow")}</button></li>`).join("")}</ol>
      <div class="section-heading"><h2>四个随身工具 <span>边看流程，边记录</span></h2>${go("查看我的计划 ↗", "report", "text-button")}</div>
      <section class="journey-grid">${journey.map(([page, n, title, text, status, symbol]) => `<button class="journey-card" type="button" data-action="nav" data-value="${page}"><div class="journey-top"><span class="tile-icon">${icon(symbol)}</span><span class="step-number">${n}</span></div><h3>${title}</h3><p>${text}</p><div class="journey-status">${status}${icon("arrow")}</div></button>`).join("")}</section>
      <section class="bottom-grid"><div class="panel thought"><span class="yellow-icon">${icon("compass")}</span><div><h3>先问自己：我真的需要一辆车吗？</h3><p>不方便有多频繁？买车的便利值不值得？<br>打车、租车，也可以是现阶段更合适的答案。</p>${button("花 30 秒想一想 →", "necessity", "", "text-button")}</div></div><div class="panel progress-panel"><div class="row-between"><h3>我的准备进度</h3><strong>${p.percent}<small>%</small></strong></div><div class="progress-track"><span style="width:${p.percent}%"></span></div><p>记录完成度，不是购车资格评分。<br>随时离开，下次在同一浏览器继续。</p>${button(`${icon("download")} 备份与数据管理`, "data", "", "text-button")}</div></section>`;
  }
  function guideView() {
    const step = KB.steps[state.guideStep] || KB.steps[0];
    return `${heading(`STEP ${step.num} / ${KB.steps.length} · 购车流程百科`, `${step.title}：${step.tagline}`, step.summary)}
      <div class="tabs step-tabs" aria-label="七大步骤">${KB.steps.map((s, i) => `<button type="button" id="step-tab-${i}" class="${i === state.guideStep ? "active" : ""}" aria-pressed="${i === state.guideStep}" data-action="guide-step" data-value="${i}">${s.num} ${s.title}</button>`).join("")}</div>
      <div class="notice tip">${icon(step.tool ? "spark" : "alert")}<p>${step.tool ? "这一步可以用随身工具记录结果；百科内容供参考，以当地最新官方规定和实际文件为准。" : "事故处理以人身安全为先；应急步骤可打开下方速查。百科内容供参考，以当地最新官方规定为准。"}</p>${step.tool ? go(step.tool[1], step.tool[0], "text-button") : button("事故应急速查 →", "emergency", "", "text-button")}</div>
      ${step.groups.map((g) => `<section class="panel kb-group"><div class="row-between"><h2>${g.title}</h2><span class="pill">${g.stage} · ${g.items.length} 个事项</span></div>${g.items.map(([id, title, todos, done]) => `<details class="kb-item" id="kb-${step.id}-${g.id}-${id}"><summary><strong>${title}</strong><span class="kb-more" aria-hidden="true"></span></summary><ul class="kb-todo">${todos.map((t) => `<li>${t}</li>`).join("")}</ul><p class="kb-done">${icon("check")} 完成标志：${done}</p></details>`).join("")}</section>`).join("")}
      <div class="page-actions">${state.guideStep > 0 ? button(`← 上一步：${KB.steps[state.guideStep - 1].title}`, "guide-step", state.guideStep - 1, "button subtle") : go("← 回到首页", "home", "button subtle")}${state.guideStep < KB.steps.length - 1 ? button(`下一步：${KB.steps[state.guideStep + 1].title} →`, "guide-step", state.guideStep + 1, "button primary") : go("整理我的购车计划 →", "report")}</div>`;
  }
  function necessityBar() {
    const text =
      necessityLabels[state.necessity] || "还没想清楚？先花 30 秒理一理。";
    return `<div class="necessity-bar ${state.necessity ? "set" : ""}">${icon("compass")}<div><strong>我真的需要一辆车吗？</strong><small>购车必要性：${text}</small></div>${button(state.necessity ? "修改" : "想一想 →", "necessity", "", "text-button")}</div>`;
  }
  function priorityCount(level) {
    return selectedNeeds().filter((need) => need.priority === level).length;
  }
  function prioSummary() {
    const must = priorityCount(3);
    return `必须满足 <b>${must}</b> 条 · 优先满足 <b>${priorityCount(2)}</b> 条 · 有就更好 <b>${priorityCount(1)}</b> 条${must ? "" : " · 建议至少把 1 条设为必须满足"}`;
  }
  function priorityPanel() {
    const picked = selectedNeeds().sort((a, b) => b.priority - a.priority);
    return `<section class="panel priority-panel"><div class="row-between"><div><h2>每条需求，值多少分？</h2><p class="small muted">「必须满足」就是对比页的硬门槛：不满足的候选车不参与加权评分，高分抵不过。</p></div><span class="pill amber">第 8 步</span></div>${
      picked.length
        ? `<p class="prio-summary" id="prio-summary">${prioSummary()}</p><div class="prio-list">${picked
            .map(
              (need) =>
                `<div class="prio-row" id="prio-${need.id}"><div class="prio-text"><strong>${need.title}</strong><small>${need.detail}</small></div><div class="chip-row" role="group" aria-label="${need.title}的优先级">${[
                  3, 2, 1,
                ]
                  .map(
                    (level) =>
                      `<button type="button" class="chip prio-chip ${need.priority === level ? "selected" : ""}" aria-pressed="${need.priority === level}" data-action="priority" data-value="${need.id}:${level}">${labels[level]}</button>`,
                  )
                  .join("")}</div></div>`,
            )
            .join("")}</div>`
        : `<div class="empty-state">${icon("compass")}<p>还没有选过任何需求。<br>先回到第 1 题，把真实生活选出来。</p></div>`
    }<div class="page-actions">${button("← 回到第 7 题", "question", D.needs.length - 1, "button subtle")}${picked.length ? go("带上优先级去算预算 →", "budget") : button("去选需求 →", "question", 0, "button primary")}</div></section>`;
  }
  function needsView() {
    const p = progress();
    if (state.needIndex >= D.needs.length)
      return `${heading("01 / RANK WHAT MATTERS", "第 8 步 · 给需求排优先级", "先定下「不能让步」的那几条，后面的对比才有依据。")}${necessityBar()}${priorityPanel()}`;
    const n = D.needs[state.needIndex];
    const remaining = D.needs.filter((q) => !state.needs[q.id].length).length;
    return `${heading("01 / KNOW YOUR NEEDS", "先理清生活，再挑选汽车。", "把未来两三年的家庭变化也想进去。这里只记录选择，不收集身份信息。")}
      ${necessityBar()}
      <div class="needs-layout"><section class="panel question-panel"><div class="row-between"><span class="pill">${n.multiple ? (n.limit ? `最多选 ${n.limit} 项` : "可多选") : "单选"}</span><span class="muted">${state.needIndex + 1} / ${D.needs.length} · ${n.title}</span></div>
      <div class="question-progress">${D.needs.map((q, i) => `<button type="button" id="question-${i}" aria-label="${q.title}${state.needs[q.id].length ? "，已填写" : i < state.needIndex ? "，已跳过" : "，未填写"}" aria-current="${i === state.needIndex ? "step" : "false"}" class="${state.needs[q.id].length ? "answered" : i < state.needIndex ? "skipped" : ""} ${i === state.needIndex ? "current" : ""}" data-action="question" data-value="${i}"></button>`).join("")}<button type="button" id="question-priority" aria-label="第 8 步，给需求排优先级" class="priority-step ${priorityCount(3) ? "answered" : ""}" data-action="priorities"></button></div>
      <h2>${n.question}</h2><p class="muted">选符合真实生活的，不选想象中「可能会用到」的。</p>
      <div class="option-grid">${n.options
        .map(([id, title, detail]) => {
          const selected = state.needs[n.id].includes(id);
          return `<button type="button" id="option-${id}" class="option-card ${selected ? "selected" : ""}" aria-pressed="${selected}" data-action="option" data-value="${id}"><span class="choice-dot">${selected ? "✓" : ""}</span><strong>${title}</strong><span>${detail}</span></button>`;
        })
        .join("")}</div>
      <div class="question-footer">${button("← 上一项", "question", Math.max(0, state.needIndex - 1), "button subtle")}${state.needIndex < D.needs.length - 1 ? button("下一项 →", "question", state.needIndex + 1, "button primary") : button("下一步 · 给需求排优先级 →", "priorities", "", "button primary")}</div>
      <p class="small muted question-note">${remaining ? `还有 ${remaining} 题未回答，可以随时回到前面补上。` : "七个维度都答完了，下一步给需求排优先级。"}</p></section>
      <aside class="panel needs-summary"><span class="eyebrow">MY CHECKLIST</span><h3>我的需求清单</h3><p class="muted">已填写 ${p.answered} / ${D.needs.length} 个维度<br>为每条需求标记优先级。</p>${
        selectedNeeds().length
          ? selectedNeeds()
              .map(
                (s) =>
                  `<div class="need-summary-item"><strong>${s.title}</strong><select id="priority-${s.id}" data-priority="${s.id}" aria-label="${s.title}的优先级">${selectOptions(
                    [
                      [3, labels[3]],
                      [2, labels[2]],
                      [1, labels[1]],
                    ],
                    s.priority,
                  )}</select></div>`,
              )
              .join("")
          : `<div class="empty-state">${icon("compass")}<p>你的选择会出现在这里。<br>不用什么都要，适合最重要。</p></div>`
      }</aside></div>`;
  }
  function field(
    key,
    label,
    hint = "",
    placeholder = "请输入金额",
    unit = "元",
  ) {
    return `<label class="field" for="budget-${key}"><span>${label}</span><div class="input-wrap"><input id="budget-${key}" data-budget="${key}" type="number" inputmode="decimal" min="0" max="${key === "rate" ? 100 : 100000000}" step="any" value="${esc(state.budget[key])}" placeholder="${placeholder}" ${hint ? `aria-describedby="hint-${key}"` : ""}><span>${unit}</span></div>${hint ? `<small id="hint-${key}">${hint}</small>` : ""}</label>`;
  }
  function budgetView() {
    const b = state.budget;
    return `${heading("02 / MAKE ROOM FOR LIFE", "买车之后，生活也要从容。", "用稳定结余反推承受能力。不是能贷多少，而是每月能安心花多少。", button("载入示例", "sample", "", "button subtle"))}
      <div class="budget-layout"><section class="panel budget-form"><div class="form-section"><h2><span>1</span> 先给生活留好余量</h2><div class="field-grid">${field("monthly", "每月稳定可支配结余", "已扣除日常开支、既定储蓄、家庭计划和风险缓冲。", "例如 5000")}${field("cash", "可用于买车的现金", "不包含应急金和其他已经安排用途的存款。", "例如 80000")}</div></div>
      <div class="form-section"><h2><span>2</span> 估算持续用车成本</h2><label class="field" for="budget-band"><span>参考裸车价格区间</span><select id="budget-band" data-budget="band">${selectOptions(
        D.costs.map((c) => [c.id, `${c.label} · 每月 ${c.low}–${c.high} 元`]),
        b.band,
      )}</select></label>
      ${field("operating", "自定义每月用车成本（可选）", "含能源、保险续费、停车、保养、杂费；不含月供及折旧。留空使用所选区间上限。", "留空使用参考上限")}
      <details class="reference-table"><summary>查看所长Wy的成本参考表</summary><div class="table-scroll"><table><thead><tr><th>裸车价</th><th>每年用车</th><th>每月用车</th></tr></thead><tbody>${D.costs.map((c) => `<tr><td>${c.label}</td><td>${c.annual}</td><td>${c.low}–${c.high} 元</td></tr>`).join("")}</tbody></table></div><p class="small muted">参考图表：燃油车、年行驶 1 万公里的估算，不含月供。原表年 / 月值均为取整范围。新能源及其他使用场景请自行修正。</p></details></div>
      <div class="form-section"><h2><span>3</span> 把这笔报价算完整</h2><div class="field-grid">${field("price", "实际裸车价", "", "例如 150000")}${field("tax", "实际 / 预计购置税", "以税务核算及购车时政策为准；免税填 0。")}${field("insurance", "首年保险")}${field("registration", "上牌 / 代办费用")}${field("extras", "选装及其他一次性费用", "包括需要支付的贷款服务费；没有请填 0。")}</div>
      <label class="field" for="budget-payment"><span>付款方式</span><select id="budget-payment" data-budget="payment">${selectOptions(
        [
          ["loan", "贷款购买"],
          ["cash", "全款购买"],
        ],
        b.payment,
      )}</select></label>
      ${
        b.payment === "loan"
          ? `<div class="field-grid">${field("down", "裸车首付", "仅裸车首付，税费等另计。")}${field("rate", b.method === "apr" ? "年化利率（非综合 APR）" : "年化费率（按初始本金）", "费用单独计入，不包含尾款或提前还款安排。", "免息填 0", "%")}
      <label class="field" for="budget-months"><span>贷款期数</span><select id="budget-months" data-budget="months">${selectOptions(
        [12, 24, 36, 48, 60].map((m) => [m, `${m} 个月`]),
        b.months,
      )}</select></label><label class="field" for="budget-method"><span>还款方式</span><select id="budget-method" data-budget="method">${selectOptions(
        [
          ["apr", "等额本息 · 年化利率"],
          ["flat", "等本等息 · 年化费率"],
        ],
        b.method,
      )}</select></label></div>`
          : ""
      }</div></section>
      <aside id="budget-result" class="budget-result" aria-live="polite">${budgetResult()}</aside></div>`;
  }
  function budgetResult() {
    const r = M.budget(state.budget);
    if (!r.ready)
      return `<section class="panel result-card"><span class="eyebrow">YOUR BUDGET</span><h2>给每个月，留一点自由。</h2><div class="empty-state">${icon("wallet")}<p>${r.error}</p></div><p class="small muted">填写后展示首期现金、月供、总利息和现金流余量，不自动推荐贷款额度。</p></section>`;
    const tight = r.cashLeft < 0 || r.monthlyLeft < 0;
    return `<section class="panel result-card"><span class="eyebrow">YOUR BUDGET / 估算</span><h3>买车后的每月余量</h3><div class="big-money ${r.monthlyLeft < 0 ? "danger-text" : ""}">${money(r.monthlyLeft)}</div><span class="pill ${tight ? "red" : "green"}">${tight ? "当前方案存在资金缺口" : "账面可覆盖，仍需保留余量"}</span>
      <div class="result-lines"><div><span>月供</span><strong>${money(r.monthly)}</strong></div><div><span>持续用车成本 / 月</span><strong>${money(r.operating)}</strong></div><div><span>理论月供上限（不建议顶格）</span><strong>${money(r.capacity)}</strong></div><div><span>首期支付（含税费等）</span><strong>${money(r.upfront)}</strong></div><div><span>首期支付后可用现金</span><strong class="${r.cashLeft < 0 ? "danger-text" : ""}">${money(r.cashLeft)}</strong></div><div><span>贷款总利息</span><strong>${money(r.interest)}</strong></div><div class="total"><span>购车总支出（含利息）</span><strong>${money(r.total)}</strong></div></div>
      ${r.outsideBand ? '<p class="notice warning">当前裸车价不在所选参考区间内。请调整区间，或填写自定义用车成本，不能将此表直接外推。</p>' : ""}
      <p class="small muted">按完整还款期估算，不含气球贷尾款、提前还款违约金；购车总支出不含后续用车及折旧。月成本中的保险用于未来续保预留，与首年保险属于不同时间口径。</p>${go(`去试驾与比较 ${icon("arrow")}`, "compare")}</section>
      <div class="notice tip">${icon("info")}<p>利率 ≠ 费率。同样的百分比，不一定是同样的借钱成本。请核对金融机构还款计划与综合年化成本。</p></div>`;
  }
  function updateScores() {
    state.cars.forEach((car, i) => {
      const box = document.getElementById(`score-${i}`);
      if (!box) return;
      const score = M.score(car, state.weights);
      const strong = box.querySelector("strong");
      const span = box.querySelector("span");
      if (strong) strong.textContent = score === null ? "—" : score.toFixed(2);
      if (span)
        span.textContent =
          score !== null
            ? "/ 5 · 主观加权分"
            : car.hard === "no"
              ? "硬门槛未通过，不计总分"
              : "满足硬门槛并填完 7 项后计分";
    });
  }
  // 预算可覆盖的落地价 = 裸车价 + 税费保险等一次性支出（不含利息）。
  function feeTotal() {
    return ["tax", "insurance", "registration", "extras"].reduce(
      (sum, key) => sum + (Number(state.budget[key]) || 0),
      0,
    );
  }
  function budgetLanding() {
    return M.budget(state.budget).ready
      ? state.budget.price + feeTotal()
      : null;
  }
  function affordability(i) {
    const car = state.cars[i];
    const cap = budgetLanding();
    if (cap === null)
      return `<p class="small muted">${icon("wallet")} 预算还没算完，算完后这里会显示「预算内 / 超出」。</p>${go("去算预算 →", "budget", "text-button")}`;
    if (car.price === "")
      return `<p class="small muted">填写落地价后，对照上面的预算基准看买不买得起。</p>`;
    const gap = cap - car.price;
    return `<p class="gap-line ${gap < 0 ? "over" : "ok"}">${gap < 0 ? `超出预算 ${money(-gap)}` : `预算内，余 ${money(gap)}`}</p><p class="small muted">对照基准：本预算可覆盖落地价 ${money(cap)}。</p>${button("用这个落地价回填预算", "car-to-budget", i, "text-button")}`;
  }
  function gapLabel(i) {
    const car = state.cars[i];
    const cap = budgetLanding();
    if (cap === null || car.price === "") return "";
    const gap = cap - car.price;
    return ` · ${gap < 0 ? "超出预算" : "预算内余"} ${money(Math.abs(gap))}`;
  }
  function compareView() {
    const must = selectedNeeds().filter((need) => need.priority === 3);
    const cap = budgetLanding();
    return `${heading("03 / EXPERIENCE BEFORE DECIDING", "把参数放一边，坐进车里试试。", "不提供车型榜单。用 A / B / C 对应自己的候选车，先确认硬门槛，再记录主观体验。")}
      <div class="notice tip">${icon("shield")}<p>「必须满足」的需求不能靠其他项目高分抵消。评分只帮你整理体验，不代表车辆质量、安全等级或推荐结论。</p></div>
      <div class="budget-cap">${icon("wallet")}<span class="cap-long">${cap === null ? "预算还没算完；算完后这里会给出「可覆盖的落地价」，用来对照候选车。" : `按当前预算，可覆盖落地价约 <b>${money(cap)}</b>（裸车价 + 税费保险等，不含利息）`}</span><span class="cap-short">${cap === null ? "预算未完成，算完可对照候选车。" : `预算可覆盖落地价约 <b>${money(cap)}</b>`}</span>${cap === null ? go("去算预算 →", "budget", "text-button") : go("调整预算 →", "budget", "text-button")}</div>
      <details class="panel compact"><summary>查看我的硬门槛与待核实事项</summary>${
        must.length
          ? `<ul>${must.map((need) => `<li><b>${need.title}</b>：${need.detail}</li>`).join("")}</ul>${go("修改优先级 →", "needs", "text-button")}`
          : `<p>还没有标记「必须满足」的需求，硬门槛目前是空的，分数也没有参照。</p>${button("去设置优先级 →", "priorities", "", "button subtle")}`
      }</details>
      ${dimGuide()}
      <section class="candidate-grid">${state.cars
        .map((car, i) => {
          const score = M.score(car, state.weights);
          return `<div class="panel candidate"><div class="row-between"><span class="candidate-letter">${"ABC"[i]}</span>${button(car.active ? "停用此候选" : "启用候选", "car-active", i, "text-button")}</div><h2>候选车 ${"ABC"[i]}</h2>${
            car.active
              ? `<label class="field" for="car-${i}-energy"><span>能源形式</span><select id="car-${i}-energy" data-car="${i}" data-prop="energy">${selectOptions(energies, car.energy)}</select></label><label class="field" for="car-${i}-hard"><span>全部必需项 / 政策是否满足？</span><select id="car-${i}-hard" data-car="${i}" data-prop="hard">${selectOptions(
                  [
                    ["", "待核实"],
                    ["yes", "已逐项核实，全部满足"],
                    ["no", "存在不满足项"],
                  ],
                  car.hard,
                )}</select></label><label class="field" for="car-${i}-price"><span>落地价（含税费、保险等）</span><div class="input-wrap"><input id="car-${i}-price" type="number" inputmode="decimal" min="0" max="100000000" step="any" value="${esc(car.price)}" placeholder="例如 168000" data-car-price="${i}"><span>元</span></div><small>用于对照预算，不参与加权分。</small></label><div class="candidate-budget" id="afford-${i}">${affordability(i)}</div><div class="candidate-score" id="score-${i}"><strong>${score === null ? "—" : score.toFixed(2)}</strong><span>${score !== null ? "/ 5 · 主观加权分" : car.hard === "no" ? "硬门槛未通过，不计总分" : "满足硬门槛并填完 7 项后计分"}</span></div>`
              : `<div class="empty-state">${icon("car")}<p>启用后记录你的试驾体验。<br>可比较最多三台车。</p></div>`
          }</div>`;
        })
        .join("")}</section>
      <section class="panel comparison-panel"><div class="section-heading"><h2>七个维度，亲自感受</h2><span class="muted small">1 不满意 · 3 一般 · 5 满意</span></div><p class="small muted">权重：1 一般 / 2 重要 / 3 很重要。硬门槛请在上方单独核验；现场先做什么、怎么试，见试驾清单。${button("试驾清单 →", "checklist-drive", "", "text-button")}</p><p class="small muted mobile-hint">点数字即可评分，再点一次取消。</p><div class="table-scroll"><table class="comparison-table"><thead><tr><th>怎么看 · 怎么试</th><th>权重</th>${state.cars.map((c, i) => `<th>候选 ${"ABC"[i]}</th>`).join("")}</tr></thead><tbody>${D.criteria
        .map(
          ([id, title, subtitle, detail]) =>
            `<tr><td><details><summary><strong>${title}</strong><small>${subtitle}</small></summary><p>${detail}</p></details>${dimEcho(id)}</td><td data-label="权重"><div class="seg-group seg-weight" id="weight-group-${id}" role="group" aria-label="${title}权重">${[
              [1, "一般"],
              [2, "重要"],
              [3, "很重要"],
            ]
              .map(
                ([v, label]) =>
                  `<button type="button" class="seg-btn ${state.weights[id] === v ? "on" : ""}" aria-pressed="${state.weights[id] === v}" data-action="weight" data-value="${id}:${v}">${label}</button>`,
              )
              .join(
                "",
              )}</div><select id="weight-${id}" data-weight="${id}" aria-label="${title}权重">${selectOptions(
              [
                [1, "1 一般"],
                [2, "2 重要"],
                [3, "3 很重要"],
              ],
              state.weights[id],
            )}</select></td>${state.cars
              .map(
                (car, i) =>
                  `<td data-label="候选 ${"ABC"[i]}"><div class="seg-group seg-rate" id="rating-group-${i}-${id}" role="group" aria-label="候选${"ABC"[i]}${title}评分">${[1, 2, 3, 4, 5].map((v) => `<button type="button" class="seg-btn ${car.ratings[id] === v ? "on" : ""}" aria-pressed="${car.ratings[id] === v}" data-action="rate" data-value="${i}:${id}:${v}" ${car.active ? "" : "disabled"}>${v}</button>`).join("")}</div><select id="rating-${i}-${id}" data-car="${i}" data-rating="${id}" aria-label="候选${"ABC"[i]}${title}评分" ${car.active ? "" : "disabled"}>${selectOptions(
                    [
                      ["", "待体验"],
                      [1, "1 不满意"],
                      [2, "2 较弱"],
                      [3, "3 一般"],
                      [4, "4 较好"],
                      [5, "5 满意"],
                    ],
                    car.ratings[id] || "",
                  )}</select></td>`,
              )
              .join("")}</tr>`,
        )
        .join(
          "",
        )}</tbody></table></div></section><div class="page-actions">${go("带上试驾清单 →", "checklist")}${go("查看我的计划", "report", "button subtle")}</div>`;
  }
  // 「先答再试」的答题进度：只做提醒，不参与加权评分。
  function dimProgress() {
    const keys = D.criteria.flatMap(([id]) =>
      (D.criteriaGuide[id] || []).map((q) => `${id}:${q.id}`),
    );
    return {
      done: keys.filter((key) => state.dimAnswers[key]).length,
      total: keys.length,
    };
  }
  function dimEchoEmpty(id) {
    // 只有一题都没答才算「空」；答了一半用正常底色加「还有 N 题」提示。
    return (D.criteriaGuide[id] || []).every(
      (q) => !state.dimAnswers[`${id}:${q.id}`],
    );
  }
  // 对比表逐项回显自己选了什么；一题没答就给一句轻提示和一键回到答题区。
  function dimEchoInner(id) {
    const qs = D.criteriaGuide[id] || [];
    const picked = qs
      .map((q) => {
        const sel = state.dimAnswers[`${id}:${q.id}`];
        const opt = sel ? q.options.find((o) => o[0] === sel) : null;
        return opt ? opt[1] : "";
      })
      .filter(Boolean);
    if (!picked.length)
      return `<span class="dim-echo-tag">先答再试</span><span>这 ${qs.length} 题还没答，答完会显示你选的情况。</span>${button("去回答 →", "dim-open", id, "text-button")}`;
    const left = qs.length - picked.length;
    return `<span class="dim-echo-tag">你的选择</span><span>${picked.join(" · ")}${left ? `<em>（还有 ${left} 题没答）</em>` : ""}</span>`;
  }
  function dimEcho(id) {
    return `<div class="dim-echo ${dimEchoEmpty(id) ? "empty" : ""}" id="echo-${id}">${dimEchoInner(id)}</div>`;
  }
  function dimGuide() {
    const p = dimProgress();
    return `<section class="panel dim-guide"><div class="section-heading"><h2>七个维度 · 先答再试</h2><span class="muted small" id="dim-total">已答 ${p.done} / ${p.total} 题</span></div><p class="small muted">每个维度先回答自己的真实情况，再带着提示去试驾验证。答案只生成提醒，不参与加权评分，并会回显在下方「七个维度，亲自感受」里。</p>${D.criteria
      .map(([id, title, subtitle, detail]) => {
        const qs = D.criteriaGuide[id] || [];
        const doneQ = qs.filter(
          (q) => state.dimAnswers[`${id}:${q.id}`],
        ).length;
        return `<details class="dim-block" id="dim-${id}"><summary><strong>${title}</strong><small>${subtitle}</small><span class="pill ${qs.length && doneQ === qs.length ? "green" : ""}" id="dim-count-${id}">${doneQ} / ${qs.length}</span></summary><p class="dim-detail">${detail}</p>${qs
          .map((q) => {
            const sel = state.dimAnswers[`${id}:${q.id}`];
            const opt = q.options.find((o) => o[0] === sel);
            return `<div class="dim-q" id="dimq-${id}-${q.id}"><h3>${q.q}</h3><div class="chip-row">${q.options.map(([v, label]) => `<button type="button" id="chip-${id}-${q.id}-${v}" class="chip ${sel === v ? "selected" : ""}" aria-pressed="${sel === v}" data-action="dim-answer" data-value="${id}:${q.id}:${v}">${label}</button>`).join("")}</div><p class="chip-hint" id="hint-${id}-${q.id}"${opt ? "" : " hidden"}>${opt ? `${icon("spark")} ${opt[2]}` : ""}</p></div>`;
          })
          .join("")}</details>`;
      })
      .join("")}</section>`;
  }
  // 点选后只改动这一题、该维度进度和对比表回显：整页重绘会让文档高度瞬间归零，
  // 手机端容易被滚动锚定甩到候选车卡片上。
  function syncDim(id, qid) {
    const qs = D.criteriaGuide[id] || [];
    const q = qs.find((item) => item.id === qid);
    const box = q && document.getElementById(`dimq-${id}-${qid}`);
    if (!box) {
      render();
      return;
    }
    const sel = state.dimAnswers[`${id}:${qid}`];
    for (const chip of box.querySelectorAll(".chip")) {
      const on = chip.dataset.value === `${id}:${qid}:${sel}`;
      chip.classList.toggle("selected", on);
      chip.setAttribute("aria-pressed", String(on));
    }
    const opt = q.options.find((o) => o[0] === sel);
    const hint = document.getElementById(`hint-${id}-${qid}`);
    if (hint) {
      hint.innerHTML = opt ? `${icon("spark")} ${opt[2]}` : "";
      if (opt) hint.removeAttribute("hidden");
      else hint.setAttribute("hidden", "");
    }
    const done = qs.filter(
      (item) => state.dimAnswers[`${id}:${item.id}`],
    ).length;
    const pill = document.getElementById(`dim-count-${id}`);
    if (pill) {
      pill.textContent = `${done} / ${qs.length}`;
      pill.classList.toggle("green", qs.length > 0 && done === qs.length);
    }
    const total = document.getElementById("dim-total");
    if (total) {
      const p = dimProgress();
      total.textContent = `已答 ${p.done} / ${p.total} 题`;
    }
    const echo = document.getElementById(`echo-${id}`);
    if (echo) {
      echo.innerHTML = dimEchoInner(id);
      echo.classList.toggle("empty", dimEchoEmpty(id));
    }
  }
  function checklistView() {
    const list = D.checklists.find((c) => c.id === state.checklistTab);
    const perCar = Boolean(list.perCar);
    const slot = perCar ? state.checklistCar : -1;
    const key = (id) => (perCar ? `${slot}:${id}` : id);
    const elId = (prefix, id) =>
      `${prefix}-${slot >= 0 ? `${slot}-` : ""}${id}`;
    const items = list.groups.flatMap((g) => g[1]);
    const done = items.filter(
      ([id]) => state.checks[key(id)] === "done",
    ).length;
    const na = items.filter(([id]) => state.checks[key(id)] === "na").length;
    return `${heading("04 / CHECK BEFORE YOU SIGN", "重要的事，一项也不漏。", "清单记录的是本次购车流程；不适用的项目可单独标记，不必假装已经检查。")}
      <div class="tabs" aria-label="清单分类">${D.checklists.map((c) => `<button type="button" id="tab-${c.id}" class="${c.id === list.id ? "active" : ""}" aria-pressed="${c.id === list.id}" data-action="checklist-tab" data-value="${c.id}">${c.title}</button>`).join("")}</div>
      ${perCar ? `<section class="panel car-picker-panel"><div class="row-between"><h2>这份清单跟着哪台候选车？</h2></div><p class="small muted">试驾与谈价 / 合同按候选车分开记录，A 的进度不会混进 B；验车 / 提车只针对最终购买的那一台。</p><div class="car-picker" role="group" aria-label="选择候选车">${state.cars.map((c, i) => `<button type="button" id="pick-car-${i}" class="car-pick ${i === slot ? "active" : ""}" aria-pressed="${i === slot}" data-action="checklist-car" data-value="${i}"><b>候选 ${"ABC"[i]}</b><small>${c.active ? `${energies.find((e) => e[0] === c.energy)[1]} · 已启用` : "未启用"}</small></button>`).join("")}</div>${state.cars[slot].active ? "" : `<p class="notice warning">候选 ${"ABC"[slot]} 还没在「选车与试驾」页启用；仍可先记录，建议回去启用以便汇总对比。</p>`}</section>` : ""}
      <section class="panel checklist-intro"><div class="row-between"><div><h2>${list.title}清单${perCar ? ` · 候选 ${"ABC"[slot]}` : ""}</h2><p>${list.subtitle}</p></div><div class="status-pills"><span class="pill green">✓ 已确认 ${done}</span><span class="pill amber">⚠ 不适用 ${na}</span><span class="pill">共 ${items.length} 项</span></div></div><div class="progress-track split"><span class="seg-done" style="width:${(done / items.length) * 100}%"></span><span class="seg-na" style="width:${(na / items.length) * 100}%"></span></div><p class="small muted legend">「不适用」会以醒目颜色保留在清单里：它代表<b>跳过检查</b>，不是已确认。标记前请先确定该项真的与这台车无关。</p>${list.id === "drive" ? `<p class="small muted list-cross">七个维度的 1–5 分只记在「选车与试驾」页；这里只管出发前的准备和现场动线，两处不重复勾选。${go("去对比页评分 →", "compare", "text-button")}</p>` : ""}</section>
      ${list.groups
        .map(
          ([title, rows]) =>
            `<section class="panel checklist-group"><h3>${title}</h3>${rows
              .map(([id, name, detail]) => {
                const st = state.checks[key(id)];
                return `<div class="check-row ${st === "done" ? "status-done" : st === "na" ? "status-na" : ""}"><label for="${elId("check", id)}"><input id="${elId("check", id)}" type="checkbox" data-check="${key(id)}" ${st === "done" ? "checked" : ""}><span><strong>${name}</strong><small>${detail}</small></span></label><button type="button" id="${elId("na", id)}" class="na-button ${st === "na" ? "selected" : ""}" aria-pressed="${st === "na"}" data-action="na" data-value="${key(id)}">${st === "na" ? "⚠ 已标不适用" : "不适用"}</button></div>`;
              })
              .join("")}</section>`,
        )
        .join(
          "",
        )}<div class="page-actions">${go("整理我的购车计划 →", "report")}${button("事故应急速查", "emergency", "", "button subtle")}</div>`;
  }
  function carCheckCount(i, listId) {
    const list = D.checklists.find((c) => c.id === listId);
    const items = list.groups.flatMap((g) => g[1]);
    return `${items.filter(([id]) => state.checks[`${i}:${id}`]).length}/${items.length}`;
  }
  function reportView() {
    const p = progress();
    const r = M.budget(state.budget);
    const cap = budgetLanding();
    const needs = selectedNeeds().sort((a, b) => b.priority - a.priority);
    const necessity = necessityLabels[state.necessity] || "尚未记录";
    return `${heading("MY FIRST CAR / PERSONAL PLAN", "这一次，心里有数再出发。", "这是一份会随你更新的计划，不是催你买车的结论。", button(`${icon("download")} 备份计划`, "data", "", "button subtle"))}
      <section class="report-cover"><div><span class="eyebrow">属于你的购车备忘录</span><h2>从「想买车」到「想清楚」。</h2><p>购车必要性：${necessity} ${button(state.necessity ? "修改" : "补上", "necessity", "", "text-button")}</p><p>内容参考：所长Wy《如何买人生第一辆车？》 · ${D.source.video}</p></div><div class="report-percent">${p.percent}<span>% 记录完成</span></div></section>
      <div class="report-grid"><section class="panel"><h2>01 / 我的需求</h2>${needs.length ? needs.map((n) => `<div class="report-need"><span class="priority-badge p${n.priority}">${labels[n.priority]}</span><div><strong>${n.title}</strong><p>${n.detail}</p></div></div>`).join("") : '<p class="muted">还没有记录需求。先想一想平时怎么用车。</p>'}${go("修改需求 →", "needs", "text-button")}</section>
      <div class="report-stack"><section class="panel"><h2>02 / 我的预算</h2>${r.ready ? `<div class="result-lines"><div><span>裸车价</span><strong>${money(state.budget.price)}</strong></div><div><span>可覆盖落地价（含税费等）</span><strong>${money(cap)}</strong></div><div><span>首期支付</span><strong>${money(r.upfront)}</strong></div><div><span>每月用车 + 月供</span><strong>${money(r.operating + r.monthly)}</strong></div><div><span>每月余量</span><strong class="${r.monthlyLeft < 0 ? "danger-text" : ""}">${money(r.monthlyLeft)}</strong></div><div><span>首期现金余量</span><strong class="${r.cashLeft < 0 ? "danger-text" : ""}">${money(r.cashLeft)}</strong></div></div><p class="notice ${r.monthlyLeft < 0 || r.cashLeft < 0 || r.outsideBand ? "warning" : "tip"}">${r.monthlyLeft < 0 || r.cashLeft < 0 ? "存在资金缺口，先调整方案。" : r.outsideBand ? "车价不在参考区间，请修正用车成本。" : "账面可覆盖，不代表可以压满现金流。"}</p>` : `<p class="muted">${r.error}</p>`}${go("调整预算 →", "budget", "text-button")}</section>
      <section class="panel"><h2>03 / 候选车体验</h2>${state.cars.some((c) => c.active) ? state.cars.map((c, i) => (c.active ? `<div class="report-candidate"><b>候选 ${"ABC"[i]}</b><span>${energies.find((e) => e[0] === c.energy)[1]} · 试驾 ${carCheckCount(i, "drive")} · 谈价合同 ${carCheckCount(i, "deal")}${c.price !== "" ? ` · 落地价 ${money(c.price)}${gapLabel(i)}` : ""}</span><strong>${M.score(c, state.weights) === null ? (c.hard === "no" ? "门槛未通过" : "待完成核验 / 体验") : `${M.score(c, state.weights).toFixed(2)} / 5`}</strong></div>` : "")).join("") : '<p class="muted">还没有启用候选车。</p>'}<p class="small muted">加权分为个人体验记录，不能替代安全测试或硬门槛；试驾与谈价进度按候选车分开统计。</p>${go("继续对比 →", "compare", "text-button")}</section>
      <section class="panel"><h2>04 / 下一步行动</h2><p>清单已处理 ${p.checks} / ${p.total} 项（含不适用）。</p><ul class="next-actions">${p.answered < 7 ? "<li>补齐尚未回答的用车需求。</li>" : ""}${state.needs.policy.includes("unknown") || state.needs.policy.includes("restricted") || !state.needs.policy.length ? "<li>优先核实当地指标与通行政策。</li>" : ""}${!r.ready || r.cashLeft < 0 || r.monthlyLeft < 0 || r.outsideBand ? "<li>补齐预算，处理现金缺口或成本口径。</li>" : ""}${!p.compared ? "<li>按必需项筛选，亲自试驾并记录体验。</li>" : ""}<li>按清单核对合同、验车、资料和合法上路条件。</li></ul>${go("继续我的旅程 →", nextPage())}</section></div></div>
      <section class="notice tip report-disclaimer">${icon("info")}<p>本工具是对视频及所提供参考图表文字的独立整理，未获原作者背书。估算不构成金融、法律或车辆检测意见。税费、保险、合同、交通规则以最新官方规定与实际文件为准。公开传播前请确认原作者授权。</p></section><div class="page-actions no-print">${button("打印 / 保存为 PDF", "print", "", "button subtle")}${button("导出本地备份", "export", "", "button subtle")}</div>`;
  }
  function openDialog(title, body) {
    dialogOpener = document.activeElement;
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2>${button(icon("close"), "close", "", "icon-button")}</div>${body}<p id="dialog-status" class="dialog-status" role="status" aria-live="polite"></p>`;
    dialog
      .querySelector('[data-action="close"]')
      .setAttribute("aria-label", "关闭弹窗");
    if (!dialog.open) dialog.showModal();
  }
  function dataDialog() {
    openDialog(
      "你的数据，由你掌握。",
      `<p>信息仅存在当前设备、当前浏览器及当前站点的 localStorage 中。不登录、不上传，也不会跨设备自动同步。</p><div class="notice warning">清除缓存、更换浏览器或 Toy 地址可能导致记录不可用。请定期导出备份；备份含你的预算，请妥善保管。</div>${Store.message ? `<p class="notice warning">${esc(Store.message)}</p>` : ""}${externalChange ? '<p class="notice warning">其他窗口已修改数据。本窗口暂存内存中，重新载入前建议先导出。</p>' : ""}<div class="dialog-actions">${button("导出当前计划 JSON", "export", "", "button primary")}<label class="button subtle file-label">导入备份<input id="import-file" type="file" accept=".json,application/json"></label>${button("导出原始存档", "raw", "", "button subtle")}${button("重新载入页面", "reload", "", "button subtle")}</div><p class="small muted">导入会先校验格式，再请求确认；不支持自由文本、身份资料或第三方存档。下载和打印取决于浏览器支持，Toy 内未验证时可截图保留。</p><hr><h3>重新开始</h3><p class="small muted">只清除本工具的存档，不影响浏览器中的其他数据。</p>${button("清空全部记录…", "reset-confirm", "", "button danger")}`,
    );
  }
  function download(text, name, type = "application/json") {
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notify("已请求浏览器下载，请确认文件是否保存；受限容器中可截图保留。");
    } catch (error) {
      notify("此环境不支持下载，请使用截图保留记录。");
    }
  }
  function closeDialog() {
    dialog.close();
    dialogOpener?.focus?.();
  }
  // 点击弹窗外的空白（含遮罩）也能关闭：遮罩上的点击会落在 dialog 自身。
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect?.();
    const { clientX: x, clientY: y } = event;
    // 拿不到坐标或尺寸时不推测，避免误关；键盘触发不会走到这里。
    if (!rect || typeof x !== "number" || typeof y !== "number") return;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
      closeDialog();
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action,
      value = target.dataset.value;
    switch (action) {
      case "nav":
        navigate(value);
        break;
      case "guide-step":
        state.guideStep = Number(value);
        navigate("guide");
        break;
      case "question":
        state.needIndex = Number(value);
        save();
        render();
        // 切题时回到题目顶部，否则手机上仍停在上一题底部。
        reveal(".question-panel");
        break;
      case "priorities":
        state.needIndex = D.needs.length;
        navigate("needs");
        break;
      case "priority": {
        const cut = value.lastIndexOf(":");
        const needId = value.slice(0, cut),
          level = Number(value.slice(cut + 1));
        if (
          ![1, 2, 3].includes(level) ||
          !selectedNeeds().some((need) => need.id === needId)
        )
          return;
        state.priorities[needId] = level;
        save();
        // 只更新当前行与汇总，不重渲染整页，点到一半不会跳回顶部。
        const row = document.getElementById(`prio-${needId}`);
        if (row)
          for (const chip of row.querySelectorAll(".prio-chip")) {
            const on = Number(chip.dataset.value.split(":").pop()) === level;
            chip.classList.toggle("selected", on);
            chip.setAttribute("aria-pressed", String(on));
          }
        const summary = document.getElementById("prio-summary");
        if (summary) summary.innerHTML = prioSummary();
        break;
      }
      case "car-to-budget": {
        const i = Number(value),
          car = state.cars[i],
          cap = budgetLanding();
        if (!car || car.price === "" || cap === null) return;
        const fees = feeTotal(),
          next = Math.max(0, car.price - fees);
        openDialog(
          "用候选车落地价回填预算？",
          `<p>候选 ${"ABC"[i]} 的落地价 ${money(car.price)}，扣除预算里已有的税费保险等 ${money(fees)}，裸车价将改为 <b>${money(next)}</b>。</p><p class="small muted">月供、首期与余量会按新裸车价重算；首付、利率等其他输入保持不变。若这台车的税费与预算不同，请回预算页再改。</p><div class="dialog-actions">${button("取消", "close", "", "button subtle")}${button("确认回填并去预算页", "car-to-budget-confirm", i, "button primary")}</div>`,
        );
        break;
      }
      case "car-to-budget-confirm": {
        const i = Number(value),
          car = state.cars[i];
        if (!car || car.price === "") return closeDialog();
        state.budget.price = Math.max(0, car.price - feeTotal());
        save();
        closeDialog();
        navigate("budget");
        notify("已按候选车落地价回填裸车价，请核对税费与首付。");
        break;
      }
      case "option": {
        const n = D.needs[state.needIndex],
          answers = state.needs[n.id];
        if (answers.includes(value))
          state.needs[n.id] = answers.filter((a) => a !== value);
        else if (n.multiple) {
          if (n.limit && answers.length >= n.limit) {
            notify(`这一项最多选择 ${n.limit} 个，试着做一点取舍。`);
            return;
          }
          answers.push(value);
        } else state.needs[n.id] = [value];
        save();
        render();
        break;
      }
      case "car-active":
        state.cars[Number(value)].active = !state.cars[Number(value)].active;
        save();
        render();
        break;
      case "rate": {
        const [carIndex, dimId, raw] = value.split(":");
        const car = state.cars[Number(carIndex)];
        if (!car || !car.active || !D.criteria.some(([id]) => id === dimId))
          return;
        if (car.ratings[dimId] === Number(raw)) delete car.ratings[dimId];
        else car.ratings[dimId] = Number(raw);
        save();
        // 局部更新评分控件与分数，避免整页重渲染把展开的维度说明折叠。
        const group = document.getElementById(
          `rating-group-${carIndex}-${dimId}`,
        );
        if (group)
          for (const btn of group.querySelectorAll(".seg-btn")) {
            const on =
              Number(btn.dataset.value.split(":")[2]) === car.ratings[dimId];
            btn.classList.toggle("on", on);
            btn.setAttribute("aria-pressed", String(on));
          }
        updateScores();
        break;
      }
      case "weight": {
        const [dimId, raw] = value.split(":");
        const next = Number(raw);
        if (
          ![1, 2, 3].includes(next) ||
          !D.criteria.some(([id]) => id === dimId)
        )
          return;
        state.weights[dimId] = next;
        save();
        const group = document.getElementById(`weight-group-${dimId}`);
        if (group)
          for (const btn of group.querySelectorAll(".seg-btn")) {
            const on = Number(btn.dataset.value.split(":")[1]) === next;
            btn.classList.toggle("on", on);
            btn.setAttribute("aria-pressed", String(on));
          }
        updateScores();
        break;
      }
      case "checklist-tab":
        state.checklistTab = value;
        save();
        render();
        // 换清单时回到列表开头，避免停在新列表的中段。
        reveal(".page-heading");
        break;
      case "checklist-drive":
        state.checklistTab = "drive";
        navigate("checklist");
        break;
      case "checklist-car":
        state.checklistCar = Number(value);
        save();
        render();
        break;
      case "dim-answer": {
        const [dim, qid, opt] = value.split(":");
        const question = (D.criteriaGuide[dim] || []).find((q) => q.id === qid);
        if (!question || !question.options.some((o) => o[0] === opt)) return;
        const key = `${dim}:${qid}`;
        if (state.dimAnswers[key] === opt) delete state.dimAnswers[key];
        else state.dimAnswers[key] = opt;
        save();
        syncDim(dim, qid);
        break;
      }
      case "dim-open": {
        // 从对比表回到某道维度题：展开并把标题带到吸顶导航下方。
        const block = document.getElementById(`dim-${value}`);
        if (!block) return;
        block.open = true;
        block.scrollIntoView?.({ block: "start" });
        break;
      }
      case "na":
        if (state.checks[value] === "na") delete state.checks[value];
        else state.checks[value] = "na";
        save();
        render();
        break;
      case "close":
        closeDialog();
        break;
      case "data":
        dataDialog();
        break;
      case "about":
        openDialog(
          "内容来源与使用说明",
          `<div class="source-credit">所长Wy<small>原视频与参考图表作者</small></div><p>《如何买人生第一辆车？》<br>${D.source.video}</p><a class="button primary" href="https://www.bilibili.com/video/${D.source.video}/" target="_blank" rel="noopener noreferrer">查看 B站原视频 ↗</a><p>本工具根据用户提供的视频字幕和《购车指南参考图表》文字摘录独立设计，非原作者官方产品。未读取 PDF 的缺失图像表格，也不声称完整复刻原图表。</p><p>七维需求、稳定结余法、试驾与交付流程来自原内容的整理。预算计算器、交互、优先级及加权分是本工具增加的功能，均非作者推荐结论。</p><div class="notice warning">标注来源不等于获得授权。发布或公开传播前，请取得必要的授权。平台 SDK 与正式发布权限仍需在授权账号下核验。</div>`,
        );
        break;
      case "necessity":
        openDialog(
          "先想清楚，再决定。",
          `<p>没有车的不方便是每天、每周，还是偶尔？买车带来的便利，对你值多少钱？别只比较油费，还要算购车、保险、停车、保养及折旧。</p><div class="dialog-choice">${[
            ["needed", "确实能解决高频不便"],
            ["consider", "再比较一下打车 / 租车"],
            ["wait", "暂时不买，也很好"],
          ]
            .map(([id, title]) =>
              button(
                `${state.necessity === id ? "✓ " : ""}${title}`,
                "necessity-set",
                id,
                "button subtle",
              ),
            )
            .join("")}</div>`,
        );
        break;
      case "necessity-set":
        state.necessity = value;
        save();
        closeDialog();
        render();
        notify("已记下你的想法，随时可以改变。");
        break;
      case "sample":
        openDialog(
          "用一组示例试算？",
          `<p>这会替换预算页的现有金额，其他需求和清单不变。示例仅展示计算方法，不是推荐车价或贷款方案。</p><div class="dialog-actions">${button("取消", "close", "", "button subtle")}${button("确认载入示例", "sample-confirm", "", "button primary")}</div>`,
        );
        break;
      case "sample-confirm":
        state.budget = {
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
        };
        save();
        closeDialog();
        render();
        notify("已载入示例，请改成自己的真实情况。");
        break;
      case "export":
        download(Store.encode(state), "first-car-backup.json");
        break;
      case "raw":
        try {
          const raw = Store.raw();
          if (raw) download(raw, "first-car-original.json");
          else notify("没有可导出的原始存档。");
        } catch (error) {
          notify("无法读取原始存档。");
        }
        break;
      case "reload":
        openDialog(
          "重新载入本地存档？",
          `<p>本窗口尚未保存的内容会丢失。请先导出需要保留的计划。</p><div class="dialog-actions">${button("取消", "close", "", "button subtle")}${button("确认重新载入", "reload-confirm", "", "button primary")}</div>`,
        );
        break;
      case "reload-confirm":
        location.reload();
        break;
      case "reset-confirm":
        openDialog(
          "清空全部记录？",
          `<p>需求、预算、候选评分和清单将全部移除。此操作无法撤销，建议先导出备份。</p><div class="dialog-actions">${button("保留记录", "close", "", "button subtle")}${button("确认清空", "reset", "", "button danger")}</div>`,
        );
        break;
      case "reset":
        if (Store.reset()) {
          state = Store.defaults();
          externalChange = false;
          closeDialog();
          render(true);
          notify("本工具的记录已清空。");
        } else notify(Store.message);
        break;
      case "print":
        window.print();
        break;
      case "emergency":
        openDialog(
          "事故应急 · 先保人，再处理车",
          `<div class="notice warning"><strong>人身安全优先。不要为了拍照、放警示牌或操作手机，停留在行车道内。</strong></div><ol class="emergency-steps"><li><h3>先避险</h3><p>在确保安全的前提下停车、开双闪；能安全靠边再挪车，人员撤离到安全区域。高速牢记：车靠边、人撤离、即报警。</p></li><li><h3>立即求助</h3><p>交通事故报警 122；紧急危险可拨 110，有人受伤拨 120。高速按当地救援指引联系（部分地区使用 12122）。说清道路、方向、位置及伤情。</p></li><li><h3>安全条件允许才取证</h3><p>按交警指引设置警示、拍摄位置关系、标线、车牌与碰撞细节，保存行车记录仪。不要为取证折返危险区域。</p></li><li><h3>报案、定损、维修</h3><p>及时联系保险公司。轻微事故能否使用交管 12123 快处，以当地条件和指引为准；有人伤、争议、车辆不能移动等听从交警安排。撞到公共设施不能直接离开。定损前不要擅自拆修，保留凭证。</p></li></ol><p class="small muted">此处仅为一般提醒，不能替代现场救援和交警指令。希望你永远用不上。</p>`,
        );
        break;
    }
  });
  document.addEventListener("input", (event) => {
    const el = event.target;
    // 候选车落地价：只刷新本卡的预算对照，不重渲染整页。
    const priceIndex = el.dataset.carPrice;
    if (priceIndex !== undefined) {
      const car = state.cars[Number(priceIndex)];
      if (!car) return;
      const box = document.getElementById(`afford-${priceIndex}`);
      if (!el.validity.valid) {
        car.price = "";
        save();
        el.setAttribute("aria-invalid", "true");
        if (box)
          box.innerHTML =
            '<p class="notice warning" role="alert">落地价需为 0–100,000,000 之间的数字。</p>';
        return;
      }
      el.removeAttribute("aria-invalid");
      car.price = el.value === "" ? "" : Number(el.value);
      save();
      if (box) box.innerHTML = affordability(Number(priceIndex));
      return;
    }
    const key = el.dataset.budget;
    if (!key || el.type !== "number") return;
    if (!el.validity.valid) {
      state.budget[key] = "";
      save();
      el.setAttribute("aria-invalid", "true");
      const result = document.getElementById("budget-result");
      if (result)
        result.innerHTML =
          '<div class="notice warning" role="alert">金额需在允许范围内；年化百分比为 0–100，其他金额为 0–100,000,000。请修正当前输入。</div>';
      return;
    }
    el.removeAttribute("aria-invalid");
    state.budget[key] = el.value === "" ? "" : Number(el.value);
    save();
    document.getElementById("budget-result").innerHTML = budgetResult();
  });
  document.addEventListener("change", async (event) => {
    const el = event.target;
    if (el.id === "import-file") {
      const file = el.files[0];
      if (!file) return;
      if (file.size > 100000) {
        notify("备份过大，请选择小于 100 KB 的本工具 JSON 备份。");
        el.value = "";
        return;
      }
      try {
        const imported = Store.decode(await file.text());
        openDialog(
          "用备份替换当前计划？",
          `<p>文件已通过格式校验。确认后将替换当前需求、预算、候选和清单；建议先备份现有数据。</p><div class="dialog-actions">${button("取消", "close", "", "button subtle")}<button type="button" id="confirm-import" class="button primary">确认导入</button></div>`,
        );
        document.getElementById("confirm-import").addEventListener(
          "click",
          () => {
            if (externalChange) {
              notify("检测到其他窗口更新。请先备份并重新载入后再导入。");
              return;
            }
            if (!Store.replace(imported)) {
              updateSaveStatus();
              notify(Store.message);
              return;
            }
            state = imported;
            closeDialog();
            render(true);
            notify("备份已导入，并保存到此设备。");
          },
          { once: true },
        );
      } catch (error) {
        notify("无法导入：文件格式、版本或数据不正确。当前记录未改变。");
      }
      el.value = "";
      return;
    }
    if (el.dataset.budget && el.tagName === "SELECT")
      state.budget[el.dataset.budget] =
        el.dataset.budget === "months" ? Number(el.value) : el.value;
    else if (el.dataset.priority)
      state.priorities[el.dataset.priority] = Number(el.value);
    else if (el.dataset.weight)
      state.weights[el.dataset.weight] = Number(el.value);
    else if (el.dataset.car !== undefined) {
      const car = state.cars[Number(el.dataset.car)];
      if (el.dataset.rating) {
        if (el.value === "") delete car.ratings[el.dataset.rating];
        else car.ratings[el.dataset.rating] = Number(el.value);
      } else car[el.dataset.prop] = el.value;
    } else if (el.dataset.check) {
      if (el.checked) state.checks[el.dataset.check] = "done";
      else delete state.checks[el.dataset.check];
    } else return;
    save();
    render();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== Store.key && event.key !== null) return;
    externalChange = true;
    updateSaveStatus();
  });
  // 手机返回键：把上一页带回应用内，而不是直接退出。
  window.addEventListener("popstate", () => {
    const page = hashPage();
    if (!page || page === state.page) return;
    state.page = page;
    save();
    render(true);
  });
  dialog.addEventListener("close", () => {
    if (dialogOpener?.isConnected) dialogOpener.focus();
  });
  // 旋转屏幕或缩放窗口后，吸顶高度要重新测量。
  window.addEventListener("resize", () => syncNavHeight());
  // 首次打开时，地址栏里的 #/page 优先于上次停留的页面（便于分享深链与刷新）。
  const deepLink = hashPage();
  if (deepLink) state.page = deepLink;
  syncRoute(state.page, true);
  render();
})();
