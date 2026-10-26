/* =========================================================
 * 购车决策助手 · 交互逻辑
 * 步骤式向导：首页 → 要不要买 → 需求 → 预算 → 选车标准 → 提车验车 → 我的方案
 * 附：事故速查。所有进度存 localStorage。
 * ======================================================= */
(function () {
  var D = window.CBG_DATA;
  var view = document.getElementById('view');
  var stepNav = document.getElementById('stepNav');
  var progressBar = document.getElementById('progressBar');

  // 步骤定义：home(0) 与 accident 为特殊页（无底部上一步/下一步）
  var STEPS = [
    { i: 'home',   name: '首页' },
    { i: 'needbuy', name: '要不要买' },
    { i: 'needs',  name: '梳理需求' },
    { i: 'budget', name: '定预算' },
    { i: 'criteria', name: '选车标准' },
    { i: 'delivery', name: '谈价·验车' },
    { i: 'summary', name: '我的方案' },
    { i: 'accident', name: '事故速查' }
  ];
  var WIZARD = [1, 2, 3, 4, 5, 6]; // 线性向导步骤（不含 home / accident）

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('zh-CN'); }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  function setStep(idx) {
    Store.set('step', idx);
    render();
    view.focus();
    window.scrollTo(0, 0);
  }

  /* ---------------- 渲染调度 ---------------- */
  function render() {
    var idx = Store.get('step') || 0;
    var key = STEPS[idx].i;
    view.innerHTML = '';
    ({
      home: renderHome, needbuy: renderNeedBuy, needs: renderNeeds,
      budget: renderBudget, criteria: renderCriteria, delivery: renderDelivery,
      summary: renderSummary, accident: renderAccident
    })[key]();

    // 进度：向导步骤占整体
    var wpos = WIZARD.indexOf(idx);
    var pct = key === 'home' ? 0 : key === 'accident' ? 100 : ((wpos + 1) / WIZARD.length) * 100;
    progressBar.style.width = pct + '%';

    renderNav(idx);
  }

  function renderNav(idx) {
    var wpos = WIZARD.indexOf(idx);
    if (wpos === -1) { stepNav.classList.add('hidden'); return; } // home / accident 隐藏
    stepNav.classList.remove('hidden');
    stepNav.innerHTML = '';

    var prev = document.createElement('button');
    prev.className = 'nav-btn';
    prev.textContent = '← 上一步';
    prev.onclick = function () { setStep(WIZARD[Math.max(0, wpos - 1)]); };

    var count = document.createElement('span');
    count.className = 'step-count';
    count.textContent = (wpos + 1) + '/' + WIZARD.length;

    var next = document.createElement('button');
    next.className = 'nav-btn primary';
    next.textContent = wpos === WIZARD.length - 1 ? '完成 ✓' : '下一步 →';
    next.onclick = function () {
      markDone(idx);
      if (wpos === WIZARD.length - 1) { setStep(STEPS.findIndex(function (s) { return s.i === 'summary'; })); }
      else setStep(WIZARD[wpos + 1]);
    };

    stepNav.appendChild(prev); stepNav.appendChild(count); stepNav.appendChild(next);
  }

  function markDone(idx) {
    var d = Store.get('doneSteps') || {};
    d[idx] = true; Store.set('doneSteps', d);
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var chosen = Store.get('needs.chosen') || {};
    var chosenCount = Object.keys(chosen).filter(function (k) { return chosen[k]; }).length;
    var hasBudget = !!Store.get('budget.income');
    var done = Store.get('doneSteps') || {};
    var steps = [
      { i: 1, t: '要不要买？', d: '灵魂三问 + 一台车每年到底花多少钱', cnt: '' },
      { i: 2, t: '梳理需求', d: '七个维度把用车场景翻成车辆需求', cnt: chosenCount ? '已选 ' + chosenCount + ' 项' : '' },
      { i: 3, t: '定预算', d: '稳定结余法，反推能承受的车价', cnt: hasBudget ? '已测算' : '' },
      { i: 4, t: '选车标准', d: '能源/底盘/动力/空间/安全/辅助驾驶/座舱', cnt: '' },
      { i: 5, t: '谈价 · 验车', d: '报价单、合同清单、提车验车打勾', cnt: '' },
      { i: 6, t: '我的方案', d: '汇总导出你的购车决策', cnt: '' }
    ];
    var html = ''
      + '<div class="hero"><span class="tag">全流程可视化</span>'
      + '<h1>买人生第一辆车</h1>'
      + '<p>不背参数、不给标准答案。跟着这套决策框架，从「要不要买」一路走到「验车提车上路」，最后得到一套属于你的选车标准。</p></div>';

    html += '<div class="flow-list">';
    steps.forEach(function (s) {
      var cls = done[s.i] ? 'flow-item done' : 'flow-item';
      html += '<button class="' + cls + '" data-go="' + s.i + '">'
        + '<span class="idx">' + (done[s.i] ? '✓' : s.i) + '</span>'
        + '<span class="ft"><b>' + s.t + '</b><span>' + esc(s.d) + '</span></span>'
        + (s.cnt ? '<span class="sum-tags"><span>' + s.cnt + '</span></span>' : '<span class="chev">›</span>')
        + '</button>';
    });
    html += '</div>';

    // 事故速查入口
    var accIdx = STEPS.findIndex(function (s) { return s.i === 'accident'; });
    html += '<button class="flow-item" data-go="' + accIdx + '" style="margin-top:14px;border-color:#f6d3de">'
      + '<span class="idx" style="background:#fdeaf0;color:var(--pink)">🚨</span>'
      + '<span class="ft"><b>事故处理速查</b><span>希望永远用不上，但提前看懂遇事不慌</span></span><span class="chev">›</span></button>';

    html += '<div class="card tight" style="margin-top:16px"><p class="muted" style="margin:0">🔒 你填的内容会保存在本机浏览器（localStorage），下次打开自动接着填；暂不上传服务器。'
      + (Store.persistent ? '' : '（当前环境不支持本地保存，仅本次有效）') + '</p></div>';

    view.innerHTML = html;
    view.querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function () { setStep(+b.getAttribute('data-go')); };
    });
  }

  /* ---------------- Step1 要不要买 ---------------- */
  function renderNeedBuy() {
    var ans = Store.get('needBuy.answers') || {};
    var est = Store.get('needBuy.estimate') || {};
    var h = '<p class="eyebrow">STEP 1 · 先别急着选车</p>'
      + '<h1 class="title">你的生活，真的需要一台车吗？</h1>'
      + '<p class="lead">如果只是为了省交通费，买车未必划算。但买车不只是从 A 点到 B 点。除了算账，先问自己三个问题：</p>';

    D.needQuestions.forEach(function (q) {
      var a = ans[q.id];
      h += '<div class="card"><b style="font-size:15px">' + esc(q.title) + '</b>'
        + '<p class="muted" style="margin:2px 0 10px">' + esc(q.hint) + '</p>'
        + '<div class="seg" data-q="' + q.id + '">'
        + '<button data-v="yes" class="' + (a === 'yes' ? 'on' : '') + '">会 / 值得</button>'
        + '<button data-v="no" class="' + (a === 'no' ? 'on' : '') + '">不太需要</button>'
        + '</div></div>';
    });

    h += '<h2 class="sec">🧮 拥有一台车，每年要花多少钱？</h2>'
      + '<p class="muted">' + esc(D.holdCost.note) + '</p>';

    h += '<div class="card"><div class="field"><label>裸车价（万元）</label>'
      + '<div class="num-wrap"><input type="number" id="estPrice" min="3" max="200" step="0.5" value="' + (est.price != null ? est.price : 10) + '"><span class="unit">万</span></div></div>'
      + '<div class="field"><label>打算开几年</label>'
      + '<div class="num-wrap"><input type="number" id="estYears" min="1" max="15" step="1" value="' + (est.years != null ? est.years : 8) + '"><span class="unit">年</span></div></div>'
      + '<div id="estOut"></div></div>';

    // 参考锚点
    h += '<div class="card tight"><div class="subhead" style="margin-top:0">视频里的参考账</div><table class="mini"><tbody>';
    D.holdCost.rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.k) + (r.d ? '<br><span class="muted">' + esc(r.d) + '</span>' : '') + '</td><td style="text-align:right;white-space:nowrap"><b>' + esc(r.v) + '</b></td></tr>';
    });
    h += '</tbody></table><p class="muted" style="margin:8px 0 0">注：上方为视频粗略口径（含较快的前几年贬值）；下面的计算器用的是更保守、可复现的口径，二者都只用来建立概念。</p></div>';

    view.innerHTML = h;

    view.querySelectorAll('.seg[data-q]').forEach(function (seg) {
      seg.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          var a2 = Store.get('needBuy.answers') || {};
          a2[seg.getAttribute('data-q')] = b.getAttribute('data-v');
          Store.set('needBuy.answers', a2);
          seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        };
      });
    });

    var pEl = document.getElementById('estPrice'), yEl = document.getElementById('estYears');
    function calcEst() {
      var price = parseFloat(pEl.value), years = parseInt(yEl.value, 10);
      if (isNaN(price) || price <= 0) { document.getElementById('estOut').innerHTML = ''; return; }
      if (isNaN(years) || years <= 0) years = 8;
      var landing = price * 1.13;              // 落地≈裸车×1.13
      var yearly = useCostByPrice(price);       // 年使用成本(万)
      var perYear = yearly + landing / years;   // 年均持有成本(含购车分摊)
      var total = landing + yearly * years;
      Store.set('needBuy.estimate', { price: price, years: years });
      document.getElementById('estOut').innerHTML =
        '<div class="result"><div class="row"><span>落地价（约）</span><span>' + landing.toFixed(1) + ' 万</span></div>'
        + '<div class="row"><span>每年用车成本（油/险/停/养等）</span><span>' + yearly.toFixed(2) + ' 万</span></div>'
        + '<div class="row"><span>' + years + ' 年累计（购车+用车，未计残值）</span><span>' + total.toFixed(1) + ' 万</span></div>'
        + '<div class="big" style="margin-top:6px">≈ 每年 ' + perYear.toFixed(2) + ' 万</div>'
        + '<p class="muted" style="margin:4px 0 0">≈ 每月 ' + money(perYear * 10000 / 12) + ' 元（含购车分摊，不含月供）</p></div>';
    }
    pEl.oninput = calcEst; yEl.oninput = calcEst;
    calcEst();
  }

  // 依据车价（万）估算年使用成本（万/年），取自稳定结余法表内插值
  function useCostByPrice(priceWan) {
    var t = D.budget.table;
    for (var i = 0; i < t.length; i++) {
      if (priceWan <= t[i].hi) {
        var mid = (parseFloat(t[i].year.replace('〜', '-').split('-')[0]) + parseFloat(t[i].year.replace('〜', '-').split('-')[1])) / 2;
        return mid;
      }
    }
    return 3.5; // 超过最高区间，取上限偏保守
  }
  // 依据车价返回每月用车成本区间（元）
  function monthCostByPrice(priceWan) {
    var t = D.budget.table;
    for (var i = 0; i < t.length; i++) { if (priceWan <= t[i].hi) return [t[i].mLo, t[i].mHi]; }
    return [3200, 3800];
  }

  /* ---------------- Step2 需求 ---------------- */
  function renderNeeds() {
    var chosen = Store.get('needs.chosen') || {};
    var prio = Store.get('needs.prio') || {};
    var PR = { p0: '必须', p1: '优先', p2: '更好' };
    var h = '<p class="eyebrow">STEP 2 · 打开选车软件之前</p>'
      + '<h1 class="title">七个需求维度，把生活翻成需求</h1>'
      + '<p class="lead">想需求容易发散（空间大、要安全、外观好看）。对照下面场景勾选符合你的，再给每条排优先级。别忘了把时间往后拉几年：结婚、生小孩、换城市。</p>';

    D.needs.forEach(function (dim) {
      h += '<div class="card"><h2 class="sec" style="margin:0 0 2px"><span class="k-emoji">' + dim.emoji + '</span> ' + esc(dim.name) + '</h2>'
        + '<p class="muted" style="margin:0 0 10px">' + esc(dim.lead) + '</p>';
      dim.scenarios.forEach(function (sc) {
        var on = !!chosen[sc.id];
        var p = prio[sc.id] || 'p1';
        h += '<div class="opt' + (on ? ' checked' : '') + '" data-sc="' + sc.id + '">'
          + '<input type="checkbox" ' + (on ? 'checked' : '') + ' />'
          + '<div class="body"><b>' + esc(sc.label) + '</b>'
          + (on ? '<p>' + esc(sc.need) + '</p>'
            + '<div class="chip-row" style="margin-top:8px">'
            + ['p0', 'p1', 'p2'].map(function (k) {
              return '<button class="chip ' + k + (k === p ? ' on' : '') + '" data-prio="' + k + '" data-sc="' + sc.id + '">' + PR[k] + '</button>';
            }).join('')
            + '</div>'
            : '')
          + '</div></div>';
      });
      h += '</div>';
    });

    h += '<div class="card tight"><p class="muted" style="margin:0">勾选后每条需求会展开对应的车辆需求，并可标为「必须 / 优先 / 更好」。这些会汇总到「我的方案」。</p></div>';

    view.innerHTML = h;

    view.querySelectorAll('.opt[data-sc]').forEach(function (row) {
      var id = row.getAttribute('data-sc');
      row.addEventListener('click', function (e) {
        if (e.target.closest('.chip')) return; // 点优先级 chip 单独处理
        var c = Store.get('needs.chosen') || {};
        if (c[id]) { delete c[id]; var pr = Store.get('needs.prio') || {}; delete pr[id]; Store.set('needs.prio', pr); }
        else { c[id] = true; Store.set('needs.chosen', c); }
        Store.set('needs.chosen', c);
        renderNeedsKeep();
      });
    });
    view.querySelectorAll('.chip[data-prio]').forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = chip.getAttribute('data-sc');
        var pr = Store.get('needs.prio') || {};
        pr[id] = chip.getAttribute('data-prio');
        Store.set('needs.prio', pr);
        renderNeedsKeep();
      });
    });
  }
  function renderNeedsKeep() { var y = window.scrollY; renderNeeds(); window.scrollTo(0, y); }

  /* ---------------- Step3 预算 ---------------- */
  function renderBudget() {
    var b = Store.get('budget') || {};
    var h = '<p class="eyebrow">STEP 3 · 把预算框定一下</p>'
      + '<h1 class="title">稳定结余法：反推能承受的车价</h1>'
      + '<p class="lead">' + esc(D.budget.intro) + '</p>';

    h += '<div class="card"><div class="field"><label>每月扣除储蓄、家庭计划、风险缓冲后，还能稳定支配的钱</label>'
      + '<div class="num-wrap"><input type="number" id="flex" min="0" step="100" value="' + (b.income != null ? b.income : '') + '" placeholder="例如 5000"><span class="unit">元 / 月</span></div></div>'
      + '<div id="budgetOut"></div></div>';

    h += '<h2 class="sec">不同车价的每月用车成本（不含月供）</h2>';
    h += '<div class="card" style="padding:6px 10px"><table class="mini" id="budgetTable"><thead><tr><th>裸车价</th><th>年成本</th><th>月成本</th></tr></thead><tbody>';
    D.budget.table.forEach(function (r, i) {
      h += '<tr data-band="' + i + '"><td>' + r.range + '</td><td>' + r.year + '</td><td>' + r.month + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<p class="muted">' + esc(D.budget.footnote) + '</p>';

    view.innerHTML = h;

    var flexEl = document.getElementById('flex');
    function calc() {
      var flex = parseFloat(flexEl.value);
      Store.set('budget.income', isNaN(flex) ? null : flex);
      var out = document.getElementById('budgetOut');
      document.querySelectorAll('#budgetTable tr[data-band]').forEach(function (tr) { tr.classList.remove('hit'); });
      if (isNaN(flex) || flex <= 0) { out.innerHTML = ''; return; }

      var bestIdx = -1;
      var rows = '';
      D.budget.table.forEach(function (r, i) {
        // 用较高成本做保守估计
        var remain = flex - r.mHi;
        var ok = remain > 300; // 至少留 300 余量才算舒服
        if (ok) bestIdx = i;
        rows += '<div class="row"><span>' + r.range + ' · 减成本后剩月供额度</span><span style="color:' + (remain > 0 ? 'var(--ink)' : '#d33') + '">' + money(remain) + ' 元' + (remain <= 0 ? '（超支）' : (remain < 300 ? '（偏紧）' : '')) + '</span></div>';
      });
      var rec = bestIdx >= 0 ? D.budget.table[bestIdx] : null;
      out.innerHTML = '<div class="result">' + rows
        + (rec ? '<div class="big" style="margin-top:8px">推荐区间：' + rec.range + '</div>'
          + '<p class="muted" style="margin:4px 0 0">用你每月可支配 ' + money(flex) + ' 元，减去该区间用车成本后，仍剩约 ' + money(flex - rec.mHi) + '〜' + money(flex - rec.mLo) + ' 元做月供额度。贷款方案记得再留余量、别把月供做到极致；现金充足也可全款省利息。</p>'
          : '<p class="muted" style="margin:6px 0 0">这个结余水平较难覆盖表内用车成本，建议先提升结余或考虑更低用车成本的方案。</p>')
        + '</div>';

      if (bestIdx >= 0) {
        var tr = document.querySelector('#budgetTable tr[data-band="' + bestIdx + '"]');
        if (tr) tr.classList.add('hit');
      }
    }
    flexEl.oninput = calc;
    calc();
  }

  /* ---------------- Step4 选车标准 ---------------- */
  function renderCriteria() {
    var interest = Store.get('criteria.interest') || {};
    var h = '<p class="eyebrow">STEP 4 · 不推荐车型，只教你怎么看</p>'
      + '<h1 class="title">七个维度，建立你的选车标准</h1>'
      + '<p class="lead">每个维度都讲两件事：怎么看懂参数、线下试驾重点感受什么。点「在意」标记你重点关注的维度，会带入最终方案。</p>';

    D.criteria.forEach(function (c) {
      var on = !!interest[c.id];
      h += '<div class="kcard"><h3><span class="k-emoji">' + c.emoji + '</span>' + esc(c.name) + '</h3>'
        + '<p class="k-desc">' + esc(c.desc) + '</p>'
        + '<ul>' + c.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'
        + '<div class="tip">🔎 ' + esc(c.tip) + '</div>'
        + '<div style="margin-top:10px"><button class="chip ' + (on ? 'on' : '') + '" data-int="' + c.id + '">' + (on ? '✓ 已标记在意' : '标为我在意') + '</button></div>'
        + '</div>';
    });

    view.innerHTML = h;
    view.querySelectorAll('.chip[data-int]').forEach(function (chip) {
      chip.onclick = function () {
        var id = chip.getAttribute('data-int');
        var it = Store.get('criteria.interest') || {};
        if (it[id]) delete it[id]; else it[id] = true;
        Store.set('criteria.interest', it);
        renderCriteria();
      };
    });
  }

  /* ---------------- Step5 谈价·合同·验车 ---------------- */
  function renderDelivery() {
    var checked = Store.get('inspect.checked') || {};
    var h = '<p class="eyebrow">STEP 5 · 选好车型只是上半场</p>'
      + '<h1 class="title">谈价、签约、提车验车</h1>'
      + '<p class="lead">绝大多数购车纠纷发生在提车前后这一环节。下面按时间线把要点列清楚，验车清单可以直接打勾。</p>';

    // 砍价
    h += '<div class="card"><div class="subhead" style="margin-top:0">💰 砍价 & 成交价</div><ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">'
      + D.negotiate.price.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    // 报价单
    h += '<div class="card"><div class="subhead" style="margin-top:0">🧾 看懂报价单（落地价 = 裸车 + 购置税 + 保险 + 上牌）</div>'
      + '<ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">'
      + D.negotiate.quote.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    // 合同
    h += '<div class="card"><div class="subhead" style="margin-top:0">📝 签合同前的九项检查</div>'
      + '<ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">'
      + D.negotiate.contract.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    // 验车清单（可勾选）
    h += '<h2 class="sec">✅ 验车清单（当场逐项打勾）</h2>';
    var totalItems = 0;
    D.inspection.forEach(function (g) { totalItems += g.items.length; });
    h += '<div class="card tight"><div class="row" style="display:flex;justify-content:space-between;font-size:13px;color:var(--ink-2)"><span>完成度</span><span id="insCount">0 / ' + totalItems + '</span></div><div class="progress" style="margin-top:6px;height:6px;border-radius:3px"><div id="insBar" style="height:100%;width:0;background:var(--ok);border-radius:3px;transition:width .3s"></div></div></div>';

    D.inspection.forEach(function (g) {
      h += '<div class="card"><div class="subhead" style="margin-top:0">' + esc(g.group) + '</div>';
      g.items.forEach(function (it) {
        var on = !!checked[it.id];
        h += '<label class="check-item' + (on ? ' done' : '') + '" data-id="' + it.id + '">'
          + '<input type="checkbox" ' + (on ? 'checked' : '') + ' />'
          + '<div class="cb"><b>' + esc(it.t) + '</b><p>' + esc(it.d) + '</p></div></label>';
      });
      h += '</div>';
    });

    h += '<div class="btn-row"><button class="btn gray block" id="insClear">清空打勾</button></div>';

    view.innerHTML = h;

    function updateBar() {
      var c = Store.get('inspect.checked') || {};
      var n = Object.keys(c).filter(function (k) { return c[k]; }).length;
      document.getElementById('insCount').textContent = n + ' / ' + totalItems;
      document.getElementById('insBar').style.width = (n / totalItems * 100) + '%';
    }
    view.querySelectorAll('.check-item[data-id]').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.addEventListener('click', function (e) {
        if (e.target.tagName !== 'INPUT') { // 让 label 默认切换 checkbox，这里统一处理
          // 手动切换，避免双重
        }
      });
      row.querySelector('input').addEventListener('change', function (ev) {
        var c = Store.get('inspect.checked') || {};
        if (ev.target.checked) c[id] = true; else delete c[id];
        Store.set('inspect.checked', c);
        row.classList.toggle('done', ev.target.checked);
        updateBar();
      });
    });
    document.getElementById('insClear').onclick = function () {
      Store.set('inspect.checked', {});
      renderDelivery();
      toast('已清空验车打勾');
    };
    updateBar();
  }

  /* ---------------- Step6 我的方案 ---------------- */
  function buildSummaryText() {
    var s = Store.getState();
    var lines = [];
    lines.push('【我的购车方案】— 购车决策助手');
    lines.push('框架来源：B站 UP主 所长Wy《如何买人生第一辆车？》BV15cH56sE1j');
    lines.push('生成时间：' + new Date().toLocaleString('zh-CN'));
    lines.push('');

    // 要不要买
    var ans = s.needBuy.answers || {};
    var yesCount = ['q1', 'q2', 'q3'].filter(function (k) { return ans[k] === 'yes'; }).length;
    lines.push('一、买车意愿判断');
    if (Object.keys(ans).length === 0) lines.push('  （未作答）');
    else {
      lines.push('  三问中 ' + yesCount + ' 项倾向「需要 / 值得」——' + (yesCount >= 2 ? '刚需较强，可以进入选车。' : '刚需一般，若非高频不便，可再观望。'));
      if (s.needBuy.estimate && s.needBuy.estimate.price) {
        var p = s.needBuy.estimate.price, y = s.needBuy.estimate.years || 8;
        var land = p * 1.13, uc = useCostByPrice(p);
        lines.push('  持有成本估算：裸车 ' + p + ' 万，落地约 ' + land.toFixed(1) + ' 万，年用车成本约 ' + uc.toFixed(2) + ' 万，开 ' + y + ' 年 ≈ 每年 ' + (uc + land / y).toFixed(2) + ' 万。');
      }
    }
    lines.push('');

    // 需求
    lines.push('二、我的需求清单');
    var chosen = s.needs.chosen || {}, prio = s.needs.prio || {};
    var PRmap = { p0: '必须', p1: '优先', p2: '更好' };
    var any = false;
    ['p0', 'p1', 'p2'].forEach(function (lv) {
      var arr = [];
      D.needs.forEach(function (dim) {
        dim.scenarios.forEach(function (sc) {
          if (chosen[sc.id] && (prio[sc.id] || 'p1') === lv) arr.push(dim.name + '·' + sc.label);
        });
      });
      if (arr.length) { any = true; lines.push('  [' + PRmap[lv] + '] ' + arr.join('；')); }
    });
    if (!any) lines.push('  （还没勾选需求）');
    lines.push('');

    // 预算
    lines.push('三、预算（稳定结余法）');
    if (s.budget.income) {
      var flex = s.budget.income, best = null;
      D.budget.table.forEach(function (r) { if (flex - r.mHi > 300) best = r; });
      lines.push('  每月稳定可支配：' + money(flex) + ' 元');
      lines.push('  建议车价区间：' + (best ? best.range + '（月成本 ' + best.month + '，减成本后月供额度约 ' + money(flex - best.mHi) + '〜' + money(flex - best.mLo) + ' 元）' : '较难覆盖，建议先提升结余或降档'));
    } else lines.push('  （未测算）');
    lines.push('');

    // 选车标准
    lines.push('四、我重点在意的选车维度');
    var it = s.criteria.interest || {};
    var names = D.criteria.filter(function (c) { return it[c.id]; }).map(function (c) { return c.name; });
    lines.push('  ' + (names.length ? names.join('、') : '（未标记）'));
    lines.push('');

    // 验车
    var ck = s.inspect.checked || {};
    var nck = Object.keys(ck).filter(function (k) { return ck[k]; }).length;
    lines.push('五、验车清单完成度：' + nck + ' 项已确认（提车当天对照剩余项逐项检查）');

    return lines.join('\n');
  }

  function renderSummary() {
    var text = buildSummaryText();
    var h = '<p class="eyebrow">STEP 6 · 一套属于你的决策框架</p>'
      + '<h1 class="title">我的购车方案</h1>'
      + '<p class="lead">这里汇总了你在前面每一步的填写结果。可以复制保存，或截图带去 4S 店当清单用。</p>';

    if (!Store.hasAny()) {
      h += '<div class="card"><p style="margin:0">还没有内容。先从首页点进「要不要买」开始走一遍吧。</p><div class="btn-row"><button class="btn block" id="goStart">从头开始</button></div></div>';
      view.innerHTML = h;
      document.getElementById('goStart').onclick = function () { setStep(1); };
      return;
    }

    h += '<div class="sum-block"><h4>一、买车意愿</h4>' + summaryNeedHtml() + '</div>';
    h += '<div class="sum-block"><h4>二、需求清单</h4>' + summaryNeedsHtml() + '</div>';
    h += '<div class="sum-block"><h4>三、预算</h4>' + summaryBudgetHtml() + '</div>';
    h += '<div class="sum-block"><h4>四、在意的维度</h4>' + summaryCriteriaHtml() + '</div>';

    h += '<h2 class="sec">纯文本版（长按全选复制）</h2>'
      + '<textarea class="export" id="exportText" readonly>' + esc(text) + '</textarea>'
      + '<div class="btn-row"><button class="btn soft" id="btnCopy">复制全文</button>'
      + '<button class="btn gray" id="btnDownload">下载 .txt</button></div>';

    h += '<div class="card tight"><p class="muted" style="margin:0">🔒 数据仅保存在本机浏览器。本工具整理自 所长Wy 的视频与参考图表，只做决策梳理，不推荐具体车型、不替代实车体验。</p></div>';

    view.innerHTML = h;
    document.getElementById('btnCopy').onclick = copyText;
    document.getElementById('btnDownload').onclick = downloadText;
  }

  function summaryNeedHtml() {
    var ans = Store.get('needBuy.answers') || {};
    var keys = Object.keys(ans);
    if (!keys.length) return '<div class="empty">未作答</div>';
    var yesCount = ['q1', 'q2', 'q3'].filter(function (k) { return ans[k] === 'yes'; }).length;
    var out = '<div class="sum-tags"><span>三问中 ' + yesCount + '/3 倾向需要</span>' + (yesCount >= 2 ? '<span>刚需较强</span>' : '<span>可再观望</span>') + '</div>';
    var e = Store.get('needBuy.estimate');
    if (e && e.price) {
      var land = e.price * 1.13, uc = useCostByPrice(e.price), y = e.years || 8;
      out += '<p style="margin:8px 0 0;font-size:13.5px">裸车 ' + e.price + ' 万 → 落地约 ' + land.toFixed(1) + ' 万，年均持有（' + y + ' 年）≈ ' + (uc + land / y).toFixed(2) + ' 万</p>';
    }
    return out;
  }
  function summaryNeedsHtml() {
    var chosen = Store.get('needs.chosen') || {}, prio = Store.get('needs.prio') || {};
    var PRmap = { p0: '必须满足', p1: '优先满足', p2: '有就更好' };
    var any = false, out = '<div>';
    ['p0', 'p1', 'p2'].forEach(function (lv) {
      var arr = [];
      D.needs.forEach(function (dim) {
        dim.scenarios.forEach(function (sc) {
          if (chosen[sc.id] && (prio[sc.id] || 'p1') === lv) arr.push(esc(sc.label));
        });
      });
      if (arr.length) { any = true; out += '<p style="margin:4px 0"><b style="font-size:12.5px;color:var(--brand-ink)">' + PRmap[lv] + '：</b>' + arr.join('、') + '</p>'; }
    });
    out += '</div>';
    return any ? out : '<div class="empty">还没勾选需求</div>';
  }
  function summaryBudgetHtml() {
    var flex = Store.get('budget.income');
    if (!flex) return '<div class="empty">未测算</div>';
    var best = null;
    D.budget.table.forEach(function (r) { if (flex - r.mHi > 300) best = r; });
    return '<div class="sum-tags"><span>每月可支配 ' + money(flex) + ' 元</span>' + (best ? '<span>建议 ' + best.range + '</span>' : '<span>建议降档或提升结余</span>') + '</div>';
  }
  function summaryCriteriaHtml() {
    var it = Store.get('criteria.interest') || {};
    var names = D.criteria.filter(function (c) { return it[c.id]; }).map(function (c) { return c.name; });
    return names.length ? '<div class="sum-tags">' + names.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>' : '<div class="empty">未标记</div>';
  }

  function copyText() {
    var ta = document.getElementById('exportText');
    ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(function () { toast('已复制到剪贴板'); }, function () { toast('请长按文本手动复制'); });
      return;
    }
    toast(ok ? '已复制到剪贴板' : '请长按文本手动复制');
  }
  function downloadText() {
    var blob = new Blob([buildSummaryText()], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '我的购车方案.txt';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('已下载 我的购车方案.txt');
  }

  /* ---------------- 附：事故速查 ---------------- */
  function renderAccident() {
    var A = D.accident;
    var h = '<p class="eyebrow">附录 · 希望你永远用不上</p>'
      + '<h1 class="title">🚨 事故处理速查</h1>'
      + '<p class="lead">' + esc(A.principle) + '</p>';

    h += '<div class="card"><div class="subhead" style="margin-top:0">不管事故大小，前两波是固定的</div>';
    A.fixed.forEach(function (f) { h += '<div class="kcard" style="margin-bottom:8px"><b>' + esc(f.t) + '</b><p style="margin:2px 0 0;font-size:13.5px;color:var(--ink-2)">' + esc(f.d) + '</p></div>'; });
    h += '</div>';

    h += '<div class="card"><div class="subhead" style="margin-top:0">📷 拍照取证（全方位无死角，先大环境后细节）</div><ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">'
      + A.photo.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    h += '<div class="card"><div class="subhead" style="margin-top:0">🧭 三类事故，操作不同</div>';
    A.types.forEach(function (t) { h += '<div class="kcard" style="margin-bottom:8px"><b>' + esc(t.t) + '</b><p style="margin:2px 0 0;font-size:13.5px;color:var(--ink-2)">' + esc(t.d) + '</p></div>'; });
    h += '</div>';

    h += '<div class="card"><div class="subhead" style="margin-top:0">🔧 报保险 / 定损的三个坑</div><ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">'
      + A.loss.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    h += '<div class="btn-row"><button class="btn gray block" id="accBack">← 回首页</button></div>';

    view.innerHTML = h;
    document.getElementById('accBack').onclick = function () { setStep(0); };
  }

  /* ---------------- 全局按钮 & 启动 ---------------- */
  document.getElementById('btnHome').onclick = function () { setStep(0); };
  document.getElementById('btnReset').onclick = function () {
    if (!Store.hasAny()) { Store.reset(); render(); toast('已是空白'); return; }
    if (confirm('确定清空本机已填的所有内容？此操作不可撤销。')) {
      Store.reset(); render(); toast('已重置');
    }
  };

  render();
})();
