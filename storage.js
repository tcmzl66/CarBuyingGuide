/* =========================================================
 * 本地存储层：目前无服务器，用 localStorage 保存用户已填信息。
 * 后续接入服务器 / B站云存储 SDK 时，只需替换 Store 的实现，
 * 保持 get/set/save/export 等同样的接口即可，业务代码无需改动。
 * ======================================================= */
(function (global) {
  var KEY = 'cbg_toy_state_v1';

  var defaults = {
    version: 1,
    updatedAt: 0,
    step: 0,                       // 当前所在步骤索引
    needBuy: { answers: {}, estimate: null },        // Step1 三问 yes/no + 估算输入
    needs: { chosen: {}, prio: {} },           // Step2 勾选的场景 id + 每条优先级 {id:'p0|p1|p2'}
    budget: { income: null, save: null, flex: null }, // Step3 输入
    criteria: { interest: {} },                       // Step4 标记在意的维度 id
    inspect: { checked: {} },                         // Step5 验车清单勾选
    doneSteps: {}                                    // 已完成步骤标记 {stepIndex:true}
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    for (var k in patch) {
      if (!patch.hasOwnProperty(k)) continue;
      var bv = base[k], pv = patch[k];
      if (pv && typeof pv === 'object' && !Array.isArray(pv) &&
          bv && typeof bv === 'object' && !Array.isArray(bv)) {
        deepMerge(bv, pv);
      } else {
        base[k] = pv;
      }
    }
    return base;
  }

  function available() {
    try {
      var t = '__cbg_test__';
      global.localStorage.setItem(t, '1');
      global.localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }

  var mem = clone(defaults);   // 兜底：localStorage 不可用时用内存
  var has = available();

  function load() {
    if (!has) return clone(mem);
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return clone(defaults);
      return deepMerge(clone(defaults), JSON.parse(raw));
    } catch (e) {
      return clone(defaults);
    }
  }

  var state = load();

  var Store = {
    persistent: has,
    get: function (path) {
      var parts = path.split('.');
      var cur = state;
      for (var i = 0; i < parts.length; i++) {
        if (cur == null) return undefined;
        cur = cur[parts[i]];
      }
      return cur;
    },
    set: function (path, value) {
      var parts = path.split('.');
      var cur = state;
      for (var i = 0; i < parts.length - 1; i++) {
        if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      Store.save();
    },
    save: function () {
      state.updatedAt = Date.now();
      if (!has) { mem = clone(state); return; }
      try {
        global.localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) { /* 容量/隐私模式失败静默降级到内存 */ mem = clone(state); }
    },
    getState: function () { return state; },
    reset: function () {
      state = clone(defaults);
      if (has) { try { global.localStorage.removeItem(KEY); } catch (e) {} }
      else { mem = clone(state); }
    },
    hasAny: function () {
      // 判断是否有可导出的内容
      var n = state.needs.chosen && Object.keys(state.needs.chosen).filter(function(k){return state.needs.chosen[k];}).length;
      return !!(n || state.budget.income || state.needBuy.estimate ||
        Object.keys(state.criteria.interest).length || Object.keys(state.inspect.checked).length);
    }
  };

  global.Store = Store;
})(window);
