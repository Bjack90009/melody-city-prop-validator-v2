(() => {
  "use strict";

  const DEFAULT_WORKBOOK = "data/爱乐之城-表演道具验证配置-V2.1.xlsx?v=20260821-ability-balance-v1";
  const STORAGE_PREFIX = "love-city-performance-prop-validator-set-v21";
  const ICON_ASSET_VERSION = "2026-08-14-cartoon-v1";

  const els = {};
  const state = {
    config: null,
    qualities: new Map(),
    sets: new Map(),
    items: new Map(),
    performanceRules: {},
    outcomes: [],
    events: [],
    categoryTraits: new Map(),
    inventory: [],
    placed: [],
    discovered: new Set(),
    upgradeProgress: {},
    memorialTickets: 0,
    unlocked: new Set(),
    performances: 0,
    totalStamina: 0,
    totalScore: 0,
    expansionTokens: 0,
    logs: [],
    mode: "trial",
    selectedInventoryId: null,
    selectedPlacedId: null,
    preview: { total: 0, breakdown: new Map() },
    configSignature: "",
    toastTimer: null,
    history: [],
    future: [],
    drag: null,
    runSeed: "",
    lastEventId: null,
    performanceRunning: false,
    performanceStage: null,
    pendingRewardChoice: null,
    rewardCollapsed: false,
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    for (const id of [
      "configStatus", "performButton", "unloadAllButton", "skipPerformanceCheckbox", "resetButton", "configFileInput",
      "openLogButton", "openToolsButton", "totalStamina", "totalScore", "totalEfficiency", "previewScore",
      "performanceCount", "discoveredCount", "itemPoolCount", "gridSizeLabel", "backpackSummary", "expandMessage", "expandProgress",
      "gridStage", "columnLabels", "rowLabels", "backpackGrid", "backpackHint", "warehouseDropZone", "warehouseCount",
      "warehouseHint", "searchInput", "qualityFilter", "categoryFilter", "setFilter", "inventoryList", "itemDetail", "exportLogButton", "setSummary", "scoreBreakdownSummary",
      "logBody", "unlockCountInput", "applyUnlockCountButton", "undoButton", "redoButton", "detailDialog", "logDialog",
      "toolsDialog", "performanceDialog", "performanceResultScore", "performanceResultSummary", "performanceResultBreakdown", "performanceRewards", "toast",
      "rewardChoiceDialog", "rewardChoiceList", "rewardChoiceHint", "confirmRewardChoiceButton", "rewardChoiceToggleButton", "rewardChoiceSummary",
      "simulationSeedInput", "simulationCountInput", "simulateButton", "simulationOutput",
      "performanceStageDialog", "stageSeed", "stageSegmentRail", "stageTitle", "stageSubtitle", "stageItem", "stageOutcome",
      "stageEventCard", "stageEventName", "stageEventDescription", "stageEventAction", "stageRhythmButton", "stageBeatMarker", "stagePerfectZone",
      "stageBeatFeedback", "stageSkipButton",
    ]) els[id] = document.getElementById(id);
    els.stageSpeedButtons = [...document.querySelectorAll("[data-stage-speed]")];

    els.configFileInput.addEventListener("change", handleConfigFile);
    els.performButton.addEventListener("click", perform);
    els.unloadAllButton.addEventListener("click", unloadAll);
    els.resetButton.addEventListener("click", resetProgress);
    els.exportLogButton.addEventListener("click", exportLogs);
    els.openLogButton.addEventListener("click", () => openDialog(els.logDialog));
    els.openToolsButton.addEventListener("click", () => openDialog(els.toolsDialog));
    els.searchInput.addEventListener("input", renderInventory);
    els.qualityFilter.addEventListener("change", renderInventory);
    els.categoryFilter.addEventListener("change", renderInventory);
    els.setFilter.addEventListener("change", renderInventory);
    els.applyUnlockCountButton.addEventListener("click", applyManualUnlockCount);
    els.unlockCountInput.addEventListener("keydown", (event) => { if (event.key === "Enter") applyManualUnlockCount(); });
    els.undoButton.addEventListener("click", undo);
    els.redoButton.addEventListener("click", redo);
    els.simulateButton.addEventListener("click", runSimulationBatch);
    els.confirmRewardChoiceButton.addEventListener("click", confirmRewardChoice);
    els.rewardChoiceToggleButton.addEventListener("click", toggleRewardChoicePanel);
    for (const button of document.querySelectorAll("[data-sim-count]")) {
      button.addEventListener("click", () => { els.simulationCountInput.value = button.dataset.simCount; runSimulationBatch(); });
    }

    for (const button of document.querySelectorAll("[data-mode]")) {
      button.addEventListener("click", () => switchMode(button.dataset.mode));
    }
    for (const button of document.querySelectorAll("[data-close-dialog]")) {
      button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog)?.close());
    }
    for (const dialog of document.querySelectorAll("dialog")) {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog && dialog !== els.rewardChoiceDialog && !(dialog === els.performanceStageDialog && state.performanceRunning)) dialog.close();
      });
    }
    els.rewardChoiceDialog.addEventListener("cancel", (event) => event.preventDefault());
    els.performanceDialog.addEventListener("close", () => { if (state.pendingRewardChoice) showRewardChoice(); });
    document.addEventListener("keydown", handleKeyboard);

    state.performanceStage = new window.PerformanceStage({
      dialog: els.performanceStageDialog,
      seed: els.stageSeed,
      segmentRail: els.stageSegmentRail,
      title: els.stageTitle,
      subtitle: els.stageSubtitle,
      item: els.stageItem,
      outcome: els.stageOutcome,
      eventCard: els.stageEventCard,
      eventName: els.stageEventName,
      eventDescription: els.stageEventDescription,
      eventAction: els.stageEventAction,
      rhythmButton: els.stageRhythmButton,
      beatMarker: els.stageBeatMarker,
      perfectZone: els.stagePerfectZone,
      beatFeedback: els.stageBeatFeedback,
      skipButton: els.stageSkipButton,
      speedButtons: els.stageSpeedButtons,
    }, {});

    setControlsEnabled(false);
    loadDefaultWorkbook();
  }

  async function loadDefaultWorkbook() {
    try {
      const response = await fetch(DEFAULT_WORKBOOK, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await applyWorkbook(await response.arrayBuffer(), "本地默认配置表");
    } catch (error) {
      els.configStatus.textContent = "默认配置读取失败，请在“工具与配置”中选择本地工作簿";
      showToast(`无法自动读取配置表：${error.message}`, "error", 6000);
    }
  }

  async function handleConfigFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await applyWorkbook(await file.arrayBuffer(), file.name);
      els.toolsDialog.close();
    } catch (error) {
      showToast(`配置表加载失败：${error.message}`, "error", 7000);
    } finally {
      event.target.value = "";
    }
  }

  async function applyWorkbook(buffer, sourceName) {
    if (!window.XLSX) throw new Error("本地表格解析组件未加载");
    const workbook = XLSX.read(buffer, { type: "array", cellFormula: true });
    const required = ["规则配置", "品质配置", "套装配置", "道具配置"];
    const missing = required.filter((name) => !workbook.Sheets[name]);
    if (missing.length) throw new Error(`缺少工作表：${missing.join("、")}`);

    const rows = (name) => workbook.Sheets[name] ? XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "", range: 3 }) : [];
    const ruleRows = rows("规则配置");
    const qualityRows = rows("品质配置");
    const setRows = rows("套装配置");
    const itemRows = rows("道具配置");
    const performanceRuleRows = rows("表演规则");
    const outcomeRows = rows("发挥档位");
    const eventRows = rows("现场事件");
    const categoryRows = rows("种类表演特性");
    const config = Object.fromEntries(ruleRows.map((row) => [String(row["键名"]), typedValue(row["值"], row["类型"])]));
    config.test_initial_copies_each ??= config.initial_copies_each ?? 1;
    config.trial_initial_purple_count ??= 1;
    config.trial_initial_blue_count ??= 1;
    config.trial_performances_per_reward ??= 3;
    config.trial_rewards_per_performance ??= 1;
    config.trial_reward_choice_count ??= 3;
    config.reward_unlock_option_chance ??= 0.5;
    config.reward_unlock_grant_chance ??= 0;
    config.reward_same_quality ??= true;
    config.rounding_mode ??= "round";
    config.reward_owned_option_chance ??= 0.75;
    config.reward_unlock_count ??= 2;
    config.reward_highest_quality_unlock_count ??= 2;
    config.upgrade_duplicates_per_level ??= 2;
    validateConfig(config);
    const performanceRules = {
      spotlight_segments: 3,
      segment_duration_ms: 1800,
      intro_duration_ms: 650,
      event_duration_ms: 1600,
      event_response_window_ms: 1200,
      beat_perfect_window: 0.12,
      beat_good_window: 0.28,
      beat_perfect_bonus_rate: 0.04,
      beat_good_bonus_rate: 0.02,
      spotlight_variable_share: 0.25,
      event_chance: 1,
      ...Object.fromEntries(performanceRuleRows.map((row) => [String(row["键名"]), typedValue(row["值"], row["类型"])])),
    };
    const outcomes = (outcomeRows.length ? outcomeRows : [
      { "档位ID": "steady", "名称": "稳定发挥", "权重": 65, "额外倍率": 0, "界面颜色": "#7FB3C8", "说明": "保持基础背包得分" },
      { "档位ID": "inspired", "名称": "灵感迸发", "权重": 30, "额外倍率": 0.3, "界面颜色": "#D3A94E", "说明": "产生额外发挥收益" },
      { "档位ID": "brilliant", "名称": "惊艳全场", "权重": 5, "额外倍率": 1, "界面颜色": "#E46A56", "说明": "产生高额发挥收益" },
    ]).map((row) => ({ id: String(row["档位ID"]), name: String(row["名称"]), weight: Number(row["权重"]), bonusRate: Number(row["额外倍率"]), color: String(row["界面颜色"]), description: String(row["说明"]) }));
    const events = eventRows.map((row) => ({
      id: String(row["事件ID"]), name: String(row["名称"]), type: String(row["类型"]), weight: Number(row["权重"]),
      scoreRate: Number(row["分数比例"]), responseAction: String(row["回应操作"]), responseRate: Number(row["回应减免比例"]), description: String(row["说明"]),
    })).filter((row) => row.id && Number.isFinite(row.weight));
    const categoryTraits = new Map(categoryRows.map((row) => [String(row["种类"]), {
      spotlightWeight: Number(row["聚光权重"] || 1), beatWindowModifier: Number(row["节拍窗口修正"] || 0), description: String(row["表演定位"]),
    }]));

    const qualities = new Map(qualityRows.map((row) => [String(row["品质"]), {
      name: String(row["品质"]),
      order: Number(row["排序"]),
      color: String(row["界面颜色"]),
      role: String(row["定位"]),
      rewardWeight: Math.max(0, Number(row["试玩掉落权重"] || ({ 红: 5, 金: 15, 紫: 30, 蓝: 50 }[String(row["品质"])] ?? 1))),
    }]));
    const sets = new Map(setRows.map((row) => {
      const id = String(row["套装ID"] || "").trim();
      let tiers;
      try { tiers = JSON.parse(String(row["层级JSON"])); } catch { throw new Error(`${id} 的层级JSON无法解析`); }
      if (!id || !Array.isArray(tiers) || !tiers.length) throw new Error(`套装配置无效：${id || "空ID"}`);
      return [id, { id, name: String(row["套装名称"]), type: String(row["类型"]), tiers, description: String(row["设计说明"]) }];
    }));
    const items = new Map();

    for (const row of itemRows) {
      const id = String(row.ID ?? "").trim();
      if (!/^(KB|ST|WI|PC|SG)\d{2}$/.test(id)) continue;
      let effectRule;
      try { effectRule = JSON.parse(String(row["能力规则JSON"])); } catch { throw new Error(`${id} 的能力规则JSON无法解析`); }
      const serializedEffectRule = JSON.stringify(effectRule);
      if (/"tag1"|"tag2"/.test(serializedEffectRule)) throw new Error(`${id} 的效果仍在使用标签筛选，当前版本只允许使用种类`);
      const item = {
        id,
        name: String(row["名称"]),
        category: String(row["种类"]),
        styleTag: String(row["风格标签"]),
        quality: String(row["品质"]),
        width: Number(row["宽"]),
        height: Number(row["高"]),
        area: Number(row["占格数"] || Number(row["宽"]) * Number(row["高"])),
        limitText: String(row["限制文本"]),
        limitScope: String(row["限制范围"]),
        limitKey: String(row["限制键"]),
        limitCount: Number(row["限制数量"]),
        base: levelArray(row, row["基础表演值Lv1"] !== undefined ? "基础表演值Lv" : "基础人气Lv"),
        effect: levelArray(row, "能力值Lv"),
        effectRule,
        effectDescription: String(row["能力描述"]),
        sets: [String(row["套装1"] || "").trim(), String(row["套装2"] || "").trim()].filter(Boolean),
        buildRole: String(row["Build职责"] || ""),
      };
      if (!item.category) throw new Error(`${id} 的种类为空`);
      if (!qualities.has(item.quality)) throw new Error(`${id} 使用了未定义品质：${item.quality}`);
      if (item.sets.length > 2 || item.sets.some((setId) => !sets.has(setId))) throw new Error(`${id} 使用了未定义套装或超过2个套装`);
      if (!Number.isInteger(item.width) || !Number.isInteger(item.height) || item.width < 1 || item.height < 1) throw new Error(`${id} 的宽高无效`);
      if (items.has(id)) throw new Error(`道具ID重复：${id}`);
      items.set(id, item);
    }
    if (items.size !== Number(config.expected_item_count)) throw new Error(`应读取${config.expected_item_count}件道具，实际读取${items.size}件`);

    const signature = [...items.values()].map((item) => `${item.id}:${item.base.join("-")}:${item.effect.join("-")}:${JSON.stringify(item.effectRule)}`).join("|");
    state.config = config;
    state.qualities = qualities;
    state.sets = sets;
    state.items = items;
    state.performanceRules = performanceRules;
    state.outcomes = outcomes;
    state.events = events;
    state.categoryTraits = categoryTraits;
    state.performanceStage.setRules(performanceRules, categoryTraits);
    const signatureConfig = { ...config };
    delete signatureConfig.trial_reward_choice_count;
    state.configSignature = simpleHash(signature + JSON.stringify(signatureConfig) + JSON.stringify([...qualities.values()]) + JSON.stringify([...sets.values()]) + JSON.stringify(performanceRules) + JSON.stringify(outcomes) + JSON.stringify(events) + JSON.stringify([...categoryTraits]));
    state.mode = "trial";
    state.history = [];
    state.future = [];
    populateFilters();

    const restored = restoreState("trial");
    if (!restored) initializeFreshState("trial");
    els.configStatus.textContent = `已加载：${sourceName} · 默认试玩模式 · ${config.backpack_rows}×${config.backpack_cols}背包`;
    setControlsEnabled(true);
    renderAll();
    showToast(restored ? "V2.1试玩进度已恢复" : "V2.1试玩已开始：1紫1蓝共享套装并已可激活1级", "success");
    if (state.pendingRewardChoice) setTimeout(showRewardChoice, 0);
  }

  function typedValue(value, type) {
    if (String(type).includes("整数")) return Number(value);
    if (String(type).includes("小数")) return Number(value);
    if (String(type).includes("布尔")) return [true, "true", 1, "1", "是"].includes(value);
    return value;
  }

  function levelArray(row, prefix) {
    const values = [1, 2, 3, 4, 5].map((level) => Number(row[`${prefix}${level}`]));
    if (values.some((value) => !Number.isFinite(value))) throw new Error(`${row.ID} 的${prefix}数值不完整`);
    return values;
  }

  function validateConfig(config) {
    const integerKeys = [
      "backpack_rows", "backpack_cols", "initial_rows", "initial_cols",
      "stamina_per_performance", "initial_item_level", "max_item_level", "upgrade_duplicates_per_level", "test_initial_copies_each",
      "trial_initial_purple_count", "trial_initial_blue_count", "trial_performances_per_reward", "trial_rewards_per_performance", "trial_reward_choice_count", "reward_unlock_count", "reward_highest_quality_unlock_count", "max_log_entries",
      "expected_item_count",
    ];
    for (const key of integerKeys) {
      if (!Number.isInteger(Number(config[key])) || Number(config[key]) < 1) throw new Error(`规则 ${key} 必须是正整数`);
    }
    if (config.backpack_rows > 8 || config.backpack_cols > 8) throw new Error("背包最大尺寸不能超过8×8");
    if (config.initial_rows > config.backpack_rows || config.initial_cols > config.backpack_cols) throw new Error("初始可用区域不能超过背包尺寸");
    if (config.max_item_level > 5) throw new Error("当前道具数据只提供到Lv.5");
    if (!Number.isFinite(Number(config.reward_unlock_option_chance)) || Number(config.reward_unlock_option_chance) < 0 || Number(config.reward_unlock_option_chance) > 1) throw new Error("规则 reward_unlock_option_chance 必须为0—1之间的小数");
    if (!Number.isFinite(Number(config.reward_unlock_grant_chance)) || Number(config.reward_unlock_grant_chance) < 0 || Number(config.reward_unlock_grant_chance) > 1) throw new Error("规则 reward_unlock_grant_chance 必须为0—1之间的小数");
    if (!Number.isFinite(Number(config.reward_owned_option_chance)) || Number(config.reward_owned_option_chance) < 0 || Number(config.reward_owned_option_chance) > 1) throw new Error("规则 reward_owned_option_chance 必须为0—1之间的小数");
  }

  function initializeFreshState(mode = state.mode) {
    state.mode = mode;
    state.inventory = [];
    state.placed = [];
    state.discovered = new Set();
    state.upgradeProgress = {};
    state.memorialTickets = 0;
    state.unlocked = initialUnlockedCells();
    state.performances = 0;
    state.totalStamina = 0;
    state.totalScore = 0;
    state.expansionTokens = 0;
    state.logs = [];
    state.runSeed = simpleHash(`${state.configSignature}:${mode}:${Date.now()}:${Math.random()}`);
    state.lastEventId = null;
    state.pendingRewardChoice = null;
    state.performanceRunning = false;
    state.selectedInventoryId = null;
    state.selectedPlacedId = null;
    state.history = [];
    state.future = [];

    if (mode === "test") {
      const copies = state.config.test_initial_copies_each;
      for (const item of state.items.values()) {
        state.discovered.add(item.id);
        for (let index = 0; index < copies; index += 1) state.inventory.push(makeInstance(item.id, state.config.initial_item_level));
      }
    } else {
      const initialItems = chooseTrialInitialItems();
      for (const item of initialItems) {
        state.discovered.add(item.id);
        state.inventory.push(makeInstance(item.id, state.config.initial_item_level));
      }
    }
    persistState();
  }

  function chooseTrialInitialItems() {
    const purple = [...state.items.values()].filter((item) => item.quality === "紫" && item.category !== "舞台装饰");
    const blue = [...state.items.values()].filter((item) => item.quality === "蓝");
    const candidates = [];
    for (const a of purple) for (const b of blue) {
      const sharesSet = a.sets.some((setId) => b.sets.includes(setId) && state.sets.get(setId)?.tiers?.[0]?.count === 2);
      if (sharesSet && canPackTogether(a, b, state.config.initial_rows, state.config.initial_cols)) candidates.push([a, b]);
    }
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
    throw new Error("没有符合共享套装且可放入初始2×4区域的紫蓝组合");
  }

  function canPackTogether(a, b, rows, cols) {
    for (let ar = 0; ar <= rows - a.height; ar += 1) for (let ac = 0; ac <= cols - a.width; ac += 1) {
      const ra = { row: ar, col: ac, width: a.width, height: a.height };
      for (let br = 0; br <= rows - b.height; br += 1) for (let bc = 0; bc <= cols - b.width; bc += 1) {
        if (!rectanglesOverlap(ra, { row: br, col: bc, width: b.width, height: b.height })) return true;
      }
    }
    return false;
  }

  function initialUnlockedCells() {
    const rows = state.config.backpack_rows;
    const cols = state.config.backpack_cols;
    const startRow = Math.floor((rows - state.config.initial_rows) / 2);
    const startCol = Math.floor((cols - state.config.initial_cols) / 2);
    const cells = new Set();
    for (let row = startRow; row < startRow + state.config.initial_rows; row += 1) {
      for (let col = startCol; col < startCol + state.config.initial_cols; col += 1) cells.add(cellKey(row, col));
    }
    return cells;
  }

  function makeInstance(itemId, level) {
    return { instanceId: `${itemId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, itemId, level: clamp(level, 1, 5) };
  }

  function storageKey(mode = state.mode) { return `${STORAGE_PREFIX}:${state.configSignature}:${mode}`; }

  function persistState() {
    if (!state.config) return;
    const payload = {
      version: 2,
      configSignature: state.configSignature,
      mode: state.mode,
      inventory: state.inventory,
      placed: state.placed,
      discovered: [...state.discovered],
      upgradeProgress: state.upgradeProgress,
      memorialTickets: state.memorialTickets,
      unlocked: [...state.unlocked],
      performances: state.performances,
      totalStamina: state.totalStamina,
      totalScore: state.totalScore,
      expansionTokens: state.expansionTokens,
      logs: state.logs.slice(0, state.config.max_log_entries),
      runSeed: state.runSeed,
      lastEventId: state.lastEventId,
      pendingRewardChoice: state.pendingRewardChoice,
    };
    localStorage.setItem(storageKey(), JSON.stringify(payload));
  }

  function restoreState(mode) {
    try {
      const payload = JSON.parse(localStorage.getItem(storageKey(mode)));
      if (!payload || payload.configSignature !== state.configSignature || payload.mode !== mode) return false;
      const validInstance = (instance) => state.items.has(instance.itemId) && Number(instance.level) >= 1 && Number(instance.level) <= 5;
      if (!payload.inventory.every(validInstance) || !payload.placed.every(validInstance)) return false;
      state.mode = mode;
      state.inventory = payload.inventory;
      state.placed = payload.placed;
      state.discovered = new Set(payload.discovered || [...state.items.keys()]);
      state.upgradeProgress = Object.fromEntries(Object.entries(payload.upgradeProgress || {}).filter(([itemId, count]) => state.items.has(itemId) && Number.isInteger(Number(count)) && Number(count) >= 0));
      state.memorialTickets = Math.max(0, Number(payload.memorialTickets) || 0);
      state.unlocked = new Set(payload.unlocked);
      state.performances = Number(payload.performances) || 0;
      state.totalStamina = Number(payload.totalStamina) || 0;
      state.totalScore = Number(payload.totalScore) || 0;
      state.expansionTokens = Number(payload.expansionTokens) || 0;
      state.logs = Array.isArray(payload.logs) ? payload.logs : [];
      state.runSeed = String(payload.runSeed || simpleHash(`${state.configSignature}:${mode}:${Date.now()}`));
      state.lastEventId = payload.lastEventId || null;
      const pending = payload.pendingRewardChoice;
      const validOptions = Array.isArray(pending?.options) ? pending.options.filter((option) => option?.type === "unlock" || (option?.type === "item" && state.items.has(option.itemId))) : [];
      state.pendingRewardChoice = validOptions.length ? {
        options: validOptions.slice(0, state.config.trial_reward_choice_count),
        candidateIds: validOptions.filter((option) => option.type === "item").map((option) => option.itemId),
        quality: String(pending.quality || state.items.get(validOptions.find((option) => option.type === "item")?.itemId)?.quality || ""),
        hasUnlockOption: validOptions.some((option) => option.type === "unlock"),
        selectedKey: validOptions.some((option) => option.key === pending.selectedKey) ? pending.selectedKey : null,
        performanceNumber: Number(pending.performanceNumber) || state.performances,
      } : null;
      state.performanceRunning = false;
      state.selectedInventoryId = null;
      state.selectedPlacedId = null;
      state.history = [];
      state.future = [];
      return true;
    } catch { return false; }
  }

  function switchMode(mode) {
    if (rewardDecisionLocked()) return showToast("请先完成本次道具选择", "error");
    if (!state.config || mode === state.mode || !["trial", "test"].includes(mode)) return;
    persistState();
    closeAllDialogs();
    if (!restoreState(mode)) initializeFreshState(mode);
    renderAll();
    showToast(mode === "trial" ? "已进入试玩模式：通过表演逐步解锁" : `已进入测试模式：${state.items.size}件道具全部可用`, "success");
  }

  function resetProgress() {
    if (rewardDecisionLocked()) return showToast("请先完成本次道具选择", "error");
    if (!state.config) return;
    const modeName = state.mode === "trial" ? "试玩" : "测试";
    if (!window.confirm(`确定重置${modeName}模式的背包、仓库、解锁进度和全部日志吗？`)) return;
    localStorage.removeItem(storageKey());
    initializeFreshState(state.mode);
    els.toolsDialog.close();
    renderAll();
    showToast(`${modeName}模式进度已重置`, "success");
  }

  function populateFilters() {
    els.qualityFilter.innerHTML = '<option value="">全部品质</option>';
    [...state.qualities.values()].sort((a, b) => b.order - a.order).forEach((quality) => els.qualityFilter.add(new Option(quality.name, quality.name)));
    els.categoryFilter.innerHTML = '<option value="">全部种类</option>';
    [...new Set([...state.items.values()].map((item) => item.category))].sort().forEach((category) => els.categoryFilter.add(new Option(category, category)));
    els.setFilter.innerHTML = '<option value="">全部套装</option>';
    [...state.sets.values()].sort((a, b) => a.type.localeCompare(b.type, "zh-CN") || a.name.localeCompare(b.name, "zh-CN")).forEach((set) => els.setFilter.add(new Option(set.name, set.id)));
  }

  function renderAll() {
    state.preview = calculateScore();
    renderMetrics();
    renderGrid();
    renderInventory();
    renderDetail();
    renderLogs();
    renderMode();
    persistState();
  }

  function renderMode() {
    const locked = rewardDecisionLocked();
    document.body.classList.toggle("reward-decision-locked", locked);
    document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
    document.querySelectorAll("[data-mode]").forEach((button) => { button.disabled = locked; });
    els.performButton.disabled = locked || state.performanceRunning;
    els.unloadAllButton.disabled = locked || state.performanceRunning;
    els.skipPerformanceCheckbox.disabled = locked || state.performanceRunning;
    els.resetButton.disabled = locked || state.performanceRunning;
    els.applyUnlockCountButton.disabled = locked || state.performanceRunning;
    els.unlockCountInput.disabled = locked || state.performanceRunning;
    els.simulateButton.disabled = locked || state.performanceRunning;
    els.undoButton.disabled = locked || !state.history.length;
    els.redoButton.disabled = locked || !state.future.length;
    els.warehouseHint.textContent = state.mode === "trial"
      ? `拖入背包完成配置；每 ${state.config.trial_performances_per_reward} 次表演进入一次三选一奖励。`
      : "拖入背包验证套装与能力；测试模式可直接调整等级和解锁格数。";
  }

  function renderMetrics() {
    els.totalStamina.textContent = formatNumber(state.totalStamina);
    els.totalScore.textContent = formatNumber(state.totalScore);
    els.totalEfficiency.textContent = state.totalStamina ? (state.totalScore / state.totalStamina).toFixed(1) : "0.0";
    els.previewScore.textContent = formatNumber(state.preview.total);
    els.performanceCount.textContent = state.performances;
    els.discoveredCount.textContent = state.discovered.size;
    els.itemPoolCount.textContent = state.items.size;
    renderSetSummary();

    if (state.expansionTokens > 0) {
      els.expandMessage.textContent = `可扩充 ${state.expansionTokens} 格：点击金色虚线格`;
      els.expandProgress.style.width = "100%";
    } else {
      const every = state.config.trial_performances_per_reward;
      const progress = state.performances % every;
      const remaining = every - progress;
      els.expandMessage.textContent = `再表演 ${remaining} 次进入奖励选择`;
      els.expandProgress.style.width = `${(progress / every) * 100}%`;
    }
    els.gridSizeLabel.textContent = `${state.config.backpack_rows}×${state.config.backpack_cols}`;
    els.backpackSummary.textContent = `可用 ${state.unlocked.size} 格 · 已放 ${state.placed.length} 件 · 仓库 ${state.inventory.length} 件`;
    els.unlockCountInput.min = state.config.initial_rows * state.config.initial_cols;
    els.unlockCountInput.max = state.config.backpack_rows * state.config.backpack_cols;
    if (document.activeElement !== els.unlockCountInput) els.unlockCountInput.value = state.unlocked.size;
  }

  function renderSetSummary() {
    if (!els.setSummary || !state.preview.sets) return;
    const active = [...state.preview.sets.values()].filter((set) => set.tier).sort((a, b) => b.tierIndex - a.tierIndex || a.name.localeCompare(b.name, "zh-CN"));
    els.setSummary.innerHTML = active.length
      ? active.map((set) => `<button type="button" class="set-chip" data-set-id="${set.id}" title="${escapeHtml(set.description)}"><strong>${escapeHtml(set.name)} ${set.tierIndex + 1}级</strong><span>${set.count}件 · 每名+${formatNumber(set.tier.fixed)}</span></button>`).join("")
      : '<span class="set-empty">尚未激活套装；将两件共享套装的道具放入背包即可激活1级。</span>';
    for (const chip of els.setSummary.querySelectorAll("[data-set-id]")) chip.addEventListener("click", () => {
      els.setFilter.value = chip.dataset.setId;
      renderInventory();
      showToast(`仓库已筛选：${state.sets.get(chip.dataset.setId)?.name}`);
    });
    if (els.scoreBreakdownSummary) els.scoreBreakdownSummary.textContent = `基础 ${formatNumber(state.preview.baseTotal)} · 套装 +${formatNumber(state.preview.setTotal)} · 能力 +${formatNumber(state.preview.abilityTotal)}`;
  }

  function renderGrid() {
    const rows = state.config.backpack_rows;
    const cols = state.config.backpack_cols;
    els.columnLabels.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    els.rowLabels.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    els.columnLabels.innerHTML = Array.from({ length: cols }, (_, index) => `<span>${index + 1}</span>`).join("");
    els.rowLabels.innerHTML = Array.from({ length: rows }, (_, index) => `<span>${String.fromCharCode(65 + index)}</span>`).join("");
    els.backpackGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    els.backpackGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    els.backpackGrid.innerHTML = "";

    const expandable = expandableCells();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = document.createElement("div");
        const unlocked = state.unlocked.has(cellKey(row, col));
        cell.className = `grid-cell ${unlocked ? "available" : "locked"}`;
        cell.dataset.row = row;
        cell.dataset.col = col;
        if (!unlocked && state.expansionTokens > 0 && expandable.has(cellKey(row, col))) {
          cell.classList.add("expandable");
          cell.addEventListener("click", () => expandCell(row, col));
        }
        els.backpackGrid.appendChild(cell);
      }
    }

    const gap = 3;
    for (const placed of state.placed) {
      const item = state.items.get(placed.itemId);
      const quality = state.qualities.get(item.quality);
      const block = document.createElement("div");
      const itemBreakdown = state.preview.breakdown.get(placed.instanceId);
      const effectActive = Boolean(itemBreakdown?.active);
      const boosted = Boolean((itemBreakdown?.setFixed || 0) + (itemBreakdown?.specialFixed || 0) > 0 || (itemBreakdown?.receivedPercent || 0) > 0);
      block.className = `placed-item placed-w-${item.width} placed-h-${item.height}`;
      block.style.setProperty("--quality-color", quality.color);
      block.style.left = `calc(${(placed.col / cols) * 100}% + ${gap + 1}px)`;
      block.style.top = `calc(${(placed.row / rows) * 100}% + ${gap + 1}px)`;
      block.style.width = `calc(${(item.width / cols) * 100}% - ${gap + 2}px)`;
      block.style.height = `calc(${(item.height / rows) * 100}% - ${gap + 2}px)`;
      block.dataset.instanceId = placed.instanceId;
      block.innerHTML = `${itemIcon(item, "placed")}<strong class="placed-item-name${effectActive ? " ability-active" : ""}" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><span class="score-mark${boosted ? " score-boosted" : ""}" aria-label="表演值 ${formatNumber(itemBreakdown?.total || 0)}，能力${effectActive ? "已激活" : "未激活"}">${formatNumber(itemBreakdown?.total || 0)}</span><small class="placed-item-level">Lv.${placed.level}</small>`;
      block.addEventListener("pointerdown", (event) => beginPointerGesture(event, "backpack", placed.instanceId, block));
      els.backpackGrid.appendChild(block);
    }

    if (state.expansionTokens > 0) els.backpackHint.textContent = "点击金色虚线格扩充；拖动道具时仍会实时检查完整占格。";
    else els.backpackHint.textContent = "按住道具拖动，绿色表示可放，橙色表示替换，红色表示无效；无效松手会回到原位。";
  }

  function expandCell(row, col) {
    if (rewardDecisionLocked()) return showToast("请先完成本次道具选择", "error");
    const key = cellKey(row, col);
    if (!state.expansionTokens || !expandableCells().has(key)) return;
    pushHistory();
    state.unlocked.add(key);
    state.expansionTokens -= 1;
    renderAll();
    showToast(`已扩充 ${String.fromCharCode(65 + row)}${col + 1}`, "success");
  }

  function expandableCells() {
    const result = new Set();
    const rows = state.config.backpack_rows;
    const cols = state.config.backpack_cols;
    for (const key of state.unlocked) {
      const [row, col] = key.split(",").map(Number);
      for (const [nextRow, nextCol] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
        if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols && !state.unlocked.has(cellKey(nextRow, nextCol))) result.add(cellKey(nextRow, nextCol));
      }
    }
    return result;
  }

  function applyManualUnlockCount() {
    if (rewardDecisionLocked()) return showToast("请先完成本次道具选择", "error");
    const min = state.config.initial_rows * state.config.initial_cols;
    const max = state.config.backpack_rows * state.config.backpack_cols;
    const target = clamp(Math.round(Number(els.unlockCountInput.value)), min, max);
    if (!Number.isFinite(target)) return showToast("请输入有效的解锁格数", "error");
    if (target === state.unlocked.size) return showToast(`当前已经是 ${target} 个可用格`);
    pushHistory();
    unlockToCount(target);
    renderAll();
    showToast(`已直接调整为 ${target} 个可用格`, "success");
  }

  function unlockToCount(target) {
    const order = unlockOrder();
    state.unlocked = new Set(order.slice(0, target));
    state.expansionTokens = 0;
    const removed = state.placed.filter((placed) => !placementCells(placed).every((key) => state.unlocked.has(key)));
    if (removed.length) {
      const removedIds = new Set(removed.map((entry) => entry.instanceId));
      state.placed = state.placed.filter((entry) => !removedIds.has(entry.instanceId));
      state.inventory.push(...removed.map(({ instanceId, itemId, level }) => ({ instanceId, itemId, level })));
      showToast(`格数已调整，${removed.length} 件越界道具返回仓库`, "success", 4800);
    }
  }

  function unlockOrder() {
    const initial = [...initialUnlockedCells()];
    const initialSet = new Set(initial);
    const all = [];
    for (let row = 0; row < state.config.backpack_rows; row += 1) for (let col = 0; col < state.config.backpack_cols; col += 1) {
      const key = cellKey(row, col);
      if (!initialSet.has(key)) all.push({ key, row, col, distance: Math.min(...initial.map((start) => {
        const [sr, sc] = start.split(",").map(Number);
        return Math.abs(row - sr) + Math.abs(col - sc);
      })) });
    }
    initial.sort(cellKeySort);
    all.sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col);
    return [...initial, ...all.map((entry) => entry.key)];
  }

  function renderInventory() {
    const search = els.searchInput.value.trim().toLowerCase();
    const quality = els.qualityFilter.value;
    const category = els.categoryFilter.value;
    const setId = els.setFilter.value;
    const sorted = [...state.inventory].sort((a, b) => {
      const itemA = state.items.get(a.itemId);
      const itemB = state.items.get(b.itemId);
      return state.qualities.get(itemB.quality).order - state.qualities.get(itemA.quality).order || itemA.id.localeCompare(itemB.id);
    });
    const filtered = sorted.filter((instance) => {
      const item = state.items.get(instance.itemId);
      const setNames = item.sets.map((itemSetId) => state.sets.get(itemSetId)?.name || "").join(" ");
      return (!search || `${item.id} ${item.name} ${item.category} ${item.styleTag} ${setNames}`.toLowerCase().includes(search)) && (!quality || item.quality === quality) && (!category || item.category === category) && (!setId || item.sets.includes(setId));
    });
    els.warehouseCount.textContent = state.inventory.length;
    els.inventoryList.innerHTML = "";
    if (!filtered.length) {
      els.inventoryList.innerHTML = '<div class="detail-empty">没有符合筛选条件的仓库道具。</div>';
      return;
    }
    for (const instance of filtered) {
      const item = state.items.get(instance.itemId);
      const qualityInfo = state.qualities.get(item.quality);
      const row = document.createElement("div");
      row.className = "inventory-row";
      row.style.setProperty("--quality-color", qualityInfo.color);
      row.innerHTML = `<span class="inventory-quality"></span>${itemIcon(item, "warehouse")}<div class="inventory-copy"><strong>${escapeHtml(item.name)}</strong><small>${item.id} · ${item.category} · ${item.sets.map((itemSetId) => state.sets.get(itemSetId)?.name).filter(Boolean).join(" / ") || "无套装"}</small></div><div class="inventory-meta"><b>${item.quality}</b><span class="inventory-level-shape">${shapePreview(item, "compact")}<span>Lv.${instance.level}</span></span></div>`;
      row.addEventListener("pointerdown", (event) => beginPointerGesture(event, "warehouse", instance.instanceId, row));
      els.inventoryList.appendChild(row);
    }
  }

  function beginPointerGesture(event, source, instanceId, sourceElement) {
    if (rewardDecisionLocked()) {
      if (event.button !== 0) return;
      const isInventory = source === "warehouse";
      state.selectedInventoryId = isInventory ? instanceId : null;
      state.selectedPlacedId = isInventory ? null : instanceId;
      renderDetail();
      openDialog(els.detailDialog);
      return;
    }
    if (event.button !== 0 || state.drag) return;
    if (event.ctrlKey) {
      event.preventDefault();
      if (source === "backpack") returnToWarehouse(instanceId, true);
      else autoPlaceFromWarehouse(instanceId);
      return;
    }
    state.drag = {
      source, instanceId, sourceElement, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      started: false, candidate: null, ghost: null, preview: null,
    };
    sourceElement.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", continuePointerGesture);
    document.addEventListener("pointerup", endPointerGesture, { once: true });
    document.addEventListener("pointercancel", cancelPointerGesture, { once: true });
  }

  function continuePointerGesture(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    state.drag.x = event.clientX;
    state.drag.y = event.clientY;
    if (!state.drag.started && Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY) >= 5) activateDrag();
    if (!state.drag.started) return;
    event.preventDefault();
    updateDragVisuals(event.clientX, event.clientY);
  }

  function activateDrag() {
    const drag = state.drag;
    const instance = getInstance(drag.instanceId);
    const item = state.items.get(instance.itemId);
    const quality = state.qualities.get(item.quality);
    drag.started = true;
    drag.sourceElement.classList.add("dragging-source");
    document.body.classList.add("is-dragging");
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.style.setProperty("--quality-color", quality.color);
    ghost.innerHTML = `${itemIcon(item, "drag")}<strong>${escapeHtml(item.name)}</strong>`;
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    const preview = document.createElement("div");
    preview.className = "placement-preview";
    els.backpackGrid.appendChild(preview);
    drag.preview = preview;
    updateDragVisuals(drag.x, drag.y);
  }

  function updateDragVisuals(clientX, clientY) {
    const drag = state.drag;
    const instance = getInstance(drag.instanceId);
    const item = state.items.get(instance.itemId);
    const gridRect = els.backpackGrid.getBoundingClientRect();
    const cellWidth = gridRect.width / state.config.backpack_cols;
    const cellHeight = gridRect.height / state.config.backpack_rows;
    const ghostWidth = Math.max(72, item.width * Math.min(cellWidth, 54));
    const ghostHeight = Math.max(48, item.height * Math.min(cellHeight, 54));
    drag.ghost.style.width = `${ghostWidth}px`;
    drag.ghost.style.height = `${ghostHeight}px`;
    drag.ghost.style.transform = `translate(${clientX - ghostWidth / 2}px, ${clientY - ghostHeight / 2}px)`;

    const overGrid = clientX >= gridRect.left && clientX <= gridRect.right && clientY >= gridRect.top && clientY <= gridRect.bottom;
    const warehouseRect = els.warehouseDropZone.getBoundingClientRect();
    const overWarehouse = clientX >= warehouseRect.left && clientX <= warehouseRect.right && clientY >= warehouseRect.top && clientY <= warehouseRect.bottom;
    els.warehouseDropZone.classList.toggle("drop-active", overWarehouse && drag.source === "backpack");
    drag.candidate = null;
    drag.preview.hidden = !overGrid;
    drag.ghost.classList.remove("valid", "invalid", "swap");
    updateEffectTargetHints(item.effectRule, drag.instanceId, overGrid);
    if (!overGrid) {
      drag.ghost.classList.add(overWarehouse && drag.source === "backpack" ? "valid" : "invalid");
      drag.candidate = overWarehouse && drag.source === "backpack" ? { target: "warehouse" } : null;
      return;
    }

    const col = Math.round((clientX - gridRect.left) / cellWidth - item.width / 2);
    const row = Math.round((clientY - gridRect.top) / cellHeight - item.height / 2);
    const validation = validatePlacement(drag.instanceId, row, col, { allowSwap: true });
    drag.candidate = { target: "grid", row, col, validation };
    drag.preview.hidden = false;
    drag.preview.style.left = `${(col / state.config.backpack_cols) * 100}%`;
    drag.preview.style.top = `${(row / state.config.backpack_rows) * 100}%`;
    drag.preview.style.width = `${(item.width / state.config.backpack_cols) * 100}%`;
    drag.preview.style.height = `${(item.height / state.config.backpack_rows) * 100}%`;
    const stateClass = validation.ok ? (validation.swapInstanceId ? "swap" : "valid") : "invalid";
    drag.preview.className = `placement-preview ${stateClass}`;
    drag.ghost.classList.add(stateClass);
  }

  function endPointerGesture(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return cleanupDrag();
    document.removeEventListener("pointermove", continuePointerGesture);
    if (!drag.started) {
      const isInventory = drag.source === "warehouse";
      state.selectedInventoryId = isInventory ? drag.instanceId : null;
      state.selectedPlacedId = isInventory ? null : drag.instanceId;
      renderDetail();
      openDialog(els.detailDialog);
      return cleanupDrag();
    }
    const candidate = drag.candidate;
    if (candidate?.target === "grid" && candidate.validation.ok) {
      pushHistory();
      if (drag.source === "warehouse") placeFromWarehouse(drag.instanceId, candidate.row, candidate.col, true, false);
      else movePlacedItem(drag.instanceId, candidate.row, candidate.col, true, false);
    } else if (candidate?.target === "warehouse" && drag.source === "backpack") {
      pushHistory();
      returnToWarehouse(drag.instanceId, false);
    } else {
      renderGrid();
      showToast(candidate?.validation?.message || "未放入有效区域，道具已回到原位", "error");
    }
    cleanupDrag();
  }

  function cancelPointerGesture() { cleanupDrag(); renderGrid(); }

  function cleanupDrag() {
    const drag = state.drag;
    if (!drag) return;
    drag.sourceElement?.classList.remove("dragging-source");
    drag.ghost?.remove();
    drag.preview?.remove();
    els.warehouseDropZone.classList.remove("drop-active");
    updateEffectTargetHints(null, null, false);
    document.body.classList.remove("is-dragging");
    document.removeEventListener("pointermove", continuePointerGesture);
    state.drag = null;
  }

  function updateEffectTargetHints(rule, sourceInstanceId, visible) {
    for (const block of els.backpackGrid.querySelectorAll(".placed-item.effect-target-hint")) block.classList.remove("effect-target-hint");
    if (!visible || !rule) return;
    const filters = [];
    if (rule.type === "targetBuff" && rule.filter) filters.push(rule.filter);
    if (rule.type === "count" && rule.filter) filters.push(rule.filter);
    if (rule.type === "condition") filters.push(...rule.clauses.map((entry) => entry.filter).filter(Boolean));
    if (rule.type === "balance") filters.push(rule.a?.filter, rule.b?.filter);
    if (rule.type === "groupBuff") {
      filters.push(...rule.clauses.map((entry) => entry.filter).filter(Boolean));
      if (rule.recipients?.filter) filters.push(rule.recipients.filter);
    }
    for (const placed of state.placed) {
      if (placed.instanceId === sourceInstanceId) continue;
      const item = state.items.get(placed.itemId);
      if (!filters.some((filter) => filter && matchesFilter(item, filter))) continue;
      els.backpackGrid.querySelector(`[data-instance-id="${placed.instanceId}"]`)?.classList.add("effect-target-hint");
    }
  }

  function autoPlaceFromWarehouse(instanceId) {
    const spot = firstValidSpot(instanceId);
    if (!spot) return showToast("当前可用格中没有完整空位", "error");
    pushHistory();
    placeFromWarehouse(instanceId, spot.row, spot.col, false, false);
  }

  function firstValidSpot(instanceId) {
    for (let row = 0; row < state.config.backpack_rows; row += 1) for (let col = 0; col < state.config.backpack_cols; col += 1) {
      if (validatePlacement(instanceId, row, col, { allowSwap: false }).ok) return { row, col };
    }
    return null;
  }

  function renderDetail() {
    const inventoryInstance = state.inventory.find((entry) => entry.instanceId === state.selectedInventoryId);
    const placedInstance = state.placed.find((entry) => entry.instanceId === state.selectedPlacedId);
    const instance = inventoryInstance || placedInstance;
    if (!instance) {
      els.itemDetail.innerHTML = '<div class="detail-empty">选择仓库或背包中的道具，查看套装、数值与能力。</div>';
      return;
    }
    const item = state.items.get(instance.itemId);
    const quality = state.qualities.get(item.quality);
    const breakdown = state.preview.breakdown.get(instance.instanceId) || { base: item.base[instance.level - 1], setFixed: 0, specialFixed: 0, receivedPercent: 0, total: item.base[instance.level - 1], active: false, matches: 0, activeSets: [], setSources: [], abilitySources: [] };
    const setLabels = item.sets.map((setId) => {
      const set = state.sets.get(setId);
      const current = state.preview.sets?.get(setId);
      return `<span class="detail-set-tag${current?.tier ? " active" : ""}">${escapeHtml(set?.name || setId)}${current?.tier ? ` ${current.tierIndex + 1}级` : ""}</span>`;
    }).join("") || '<span class="detail-set-tag">无套装</span>';
    els.itemDetail.style.setProperty("--quality-color", quality.color);
    els.itemDetail.innerHTML = `
      <div class="detail-hero">
        ${itemIcon(item, "detail")}
        <div><h2 class="detail-title">${escapeHtml(item.name)}</h2><p class="detail-id">${item.id} · ${item.quality} · ${escapeHtml(item.category)}</p></div>
      </div>
      <div class="detail-facts">
        <div class="detail-fact"><span>种类</span><strong>${highlightConcepts(item.category)}</strong></div>
        <div class="detail-fact"><span>固定形状</span><strong class="detail-shape-value">${shapePreview(item, "detail")}<em>${item.area} 格</em></strong></div>
        <div class="detail-fact"><span>套装</span><strong class="detail-set-list">${setLabels}</strong></div>
        <div class="detail-fact"><span>放置与升级</span><strong>${escapeHtml(item.limitText)}</strong></div>
      </div>
      ${state.mode === "test" && !rewardDecisionLocked() ? `<div class="level-row"><span>测试等级</span><select id="detailLevelSelect">${[1, 2, 3, 4, 5].map((level) => `<option value="${level}"${level === instance.level ? " selected" : ""}>Lv.${level}</option>`).join("")}</select></div>` : `<div class="level-row"><span>当前等级</span><strong>Lv.${instance.level}</strong></div>`}
      <div class="contribution-box"><span>当前贡献</span><strong>${formatNumber(breakdown.total)}</strong><p>${contributionFormula(breakdown)}</p></div>
      <div class="detail-facts">
        <div class="detail-fact"><span>基础表演值</span><strong>${formatNumber(item.base[instance.level - 1])}</strong></div>
        <div class="detail-fact"><span>能力值</span><strong>${formatEffectValue(item, instance.level)}</strong></div>
      </div>
      <div class="effect-box">${highlightConcepts(abilityText(item, instance.level))}<div class="effect-state">${placedInstance ? effectStatusText(breakdown) : "放入背包后显示实时触发结果"}</div></div>
      <div class="detail-actions">
        ${rewardDecisionLocked() ? '<span class="detail-view-only">奖励选择期间仅可查看</span>' : inventoryInstance ? '<button class="button button-gold wide" id="autoPlaceButton">自动寻找空位</button>' : '<button class="button button-gold wide" id="returnButton">卸回仓库</button>'}
      </div>`;

    document.getElementById("detailLevelSelect")?.addEventListener("change", (event) => {
      pushHistory();
      instance.level = clamp(Number(event.target.value), 1, state.config.max_item_level);
      renderAll();
      renderDetail();
    });
    document.getElementById("autoPlaceButton")?.addEventListener("click", () => { autoPlaceFromWarehouse(inventoryInstance.instanceId); els.detailDialog.close(); });
    document.getElementById("returnButton")?.addEventListener("click", () => { pushHistory(); returnToWarehouse(placedInstance.instanceId, false); els.detailDialog.close(); });
  }

  function effectStatusText(breakdown) {
    const parts = [breakdown.active ? "能力已触发" : "能力未触发"];
    if (breakdown.matches > 0) parts.push(`能力目标 ${breakdown.matches}`);
    if (breakdown.setFixed > 0) parts.push(`套装固定值 +${formatNumber(breakdown.setFixed)}`);
    if (breakdown.specialFixed > 0) parts.push(`套装高级效果 +${formatNumber(breakdown.specialFixed)}`);
    if (breakdown.receivedPercent > 0) parts.push(`收到能力 +${formatNumber(breakdown.receivedPercent)}%`);
    return parts.join(" · ");
  }

  function renderLogs() {
    if (!state.logs.length) {
      els.logBody.innerHTML = '<tr class="empty-row"><td colspan="10">尚未表演。完成一次表演后，这里会记录基础、发挥、操作、事件与最终得分。</td></tr>';
      return;
    }
    els.logBody.innerHTML = state.logs.map((log) => `<tr title="${escapeHtml(log.detailText || "")}"><td>${log.number}</td><td>${log.stamina}</td><td>${formatNumber(log.baseScore ?? log.score)}</td><td>${signedNumber(log.outcomeBonus || 0)}</td><td>${signedNumber(log.beatBonus || 0)}</td><td>${signedNumber(log.eventAdjustment || 0)}</td><td><strong>${formatNumber(log.score)}</strong></td><td>${Number(log.efficiency || 0).toFixed(1)}</td><td><code>${escapeHtml(log.seed || "旧记录")}</code></td><td>${escapeHtml(log.rewards || "—")}</td></tr>`).join("");
  }

  async function perform() {
    if (rewardDecisionLocked()) return showToast("请先完成本次道具选择", "error");
    if (!state.config || state.performanceRunning) return;
    if (!state.placed.length || state.preview.total <= 0) return showToast("请先把至少一件道具放入背包", "error");
    if (!window.PerformanceSimulation || !state.performanceStage) return showToast("表演模拟组件尚未加载", "error");
    const seed = nextPerformanceSeed();
    const plan = createPerformancePlan(seed);
    state.performanceRunning = true;
    setControlsEnabled(false);
    let interactions;
    try {
      interactions = els.skipPerformanceCheckbox.checked
        ? PerformanceSimulation.autoInteractions(plan, seed)
        : await state.performanceStage.play(plan);
    } catch (error) {
      state.performanceRunning = false;
      setControlsEnabled(true);
      showToast(`表演中断：${error.message}`, "error");
      return;
    }
    const result = PerformanceSimulation.scorePlan(plan, interactions, state.performanceRules, state.categoryTraits);
    commitPerformance(plan, result);
    state.performanceRunning = false;
    setControlsEnabled(true);
  }

  function createPerformancePlan(seed) {
    return PerformanceSimulation.createPlan({
      seed,
      baseScore: state.preview.total,
      placed: state.placed,
      items: state.items,
      breakdown: state.preview.breakdown,
      rules: state.performanceRules,
      outcomes: state.outcomes,
      events: state.events,
      categoryTraits: state.categoryTraits,
      lastEventId: state.lastEventId,
    });
  }

  function nextPerformanceSeed() {
    const manual = els.simulationSeedInput.value.trim();
    const layout = state.placed.map((entry) => `${entry.itemId}:${entry.level}:${entry.row}:${entry.col}`).sort().join("|");
    return manual ? `${manual}:${state.performances + 1}` : simpleHash(`${state.runSeed}:${state.performances + 1}:${layout}`);
  }

  function commitPerformance(plan, result) {
    const stamina = state.config.stamina_per_performance;
    const score = result.score;
    state.performances += 1;
    state.totalStamina += stamina;
    state.totalScore += score;
    const rewardDue = state.mode === "trial" && state.performances % state.config.trial_performances_per_reward === 0;
    const rewardChoice = rewardDue ? createPendingRewardChoice(PerformanceSimulation.rngFromSeed(`${plan.seed}:reward`)) : null;
    state.pendingRewardChoice = rewardChoice;
    state.lastEventId = plan.event?.id || state.lastEventId;
    const detailText = [
      ...plan.segments.map((segment, index) => `${index + 1}.${segment.itemName} ${segment.outcomeName}${segment.outcomeBonus ? ` +${segment.outcomeBonus}` : ""} / ${result.beats[index].name}${result.beats[index].bonus ? ` +${result.beats[index].bonus}` : ""}`),
      plan.event ? `${plan.event.name} ${signedNumber(result.eventAdjustment)}${result.eventResponded ? "（已回应）" : ""}` : "无现场事件",
    ].join("；");
    state.logs.unshift({
      number: state.performances,
      stamina,
      score,
      baseScore: result.baseScore,
      outcomeBonus: result.outcomeBonus,
      beatBonus: result.beatBonus,
      eventAdjustment: result.eventAdjustment,
      seed: plan.seed,
      detailText,
      eventName: plan.event?.name || "无",
      efficiency: stamina ? score / stamina : 0,
      itemCount: state.placed.length,
      unlockedCells: state.unlocked.size,
      rewards: rewardChoice ? `待选择${rewardChoice.quality}色奖励${rewardChoice.hasUnlockOption ? "（含扩格选项）" : ""}` : "",
      time: new Date().toLocaleString("zh-CN", { hour12: false }),
    });
    state.logs = state.logs.slice(0, state.config.max_log_entries);
    state.history = [];
    state.future = [];
    renderAll();
    showPerformanceResult(plan, result, stamina, rewardChoice);
  }

  function createPendingRewardChoice(rng = Math.random) {
    const choiceCount = state.config.trial_reward_choice_count;
    const canUnlock = state.unlocked.size < state.config.backpack_rows * state.config.backpack_cols;
    const hasUnlockOption = canUnlock && choiceCount > 1 && rng() < state.config.reward_unlock_option_chance;
    const itemChoiceCount = choiceCount - (hasUnlockOption ? 1 : 0);
    const quality = weightedRandomQuality(rng, itemChoiceCount);
    const pool = [...state.items.values()].filter((item) => item.quality === quality.name);
    const itemCount = Math.min(pool.length, itemChoiceCount);
    const candidateIds = [];
    const ownedPool = pool.filter((item) => state.discovered.has(item.id));
    if (ownedPool.length && rng() < state.config.reward_owned_option_chance) {
      const item = uniformRandomItem(ownedPool, rng);
      candidateIds.push(item.id);
      pool.splice(pool.findIndex((candidate) => candidate.id === item.id), 1);
    }
    while (pool.length && candidateIds.length < itemCount) {
      const item = uniformRandomItem(pool, rng);
      candidateIds.push(item.id);
      pool.splice(pool.findIndex((candidate) => candidate.id === item.id), 1);
    }
    if (!candidateIds.length) return null;
    const options = candidateIds.map((itemId) => ({ type: "item", key: itemId, itemId }));
    if (hasUnlockOption) {
      const unlockOption = { type: "unlock", key: "unlock", unlockCount: state.config.reward_unlock_count };
      options.splice(Math.floor(rng() * (options.length + 1)), 0, unlockOption);
    }
    return options.length ? { options, candidateIds, quality: quality.name, hasUnlockOption, selectedKey: null, performanceNumber: state.performances } : null;
  }

  function weightedRandomQuality(rng = Math.random, requiredItemCount = state.config.trial_reward_choice_count) {
    const qualities = [...state.qualities.values()].filter((quality) => quality.rewardWeight > 0 && [...state.items.values()].filter((item) => item.quality === quality.name).length >= requiredItemCount);
    const total = qualities.reduce((sum, quality) => sum + quality.rewardWeight, 0);
    let roll = rng() * total;
    for (const quality of qualities) {
      roll -= quality.rewardWeight;
      if (roll <= 0) return quality;
    }
    return qualities.at(-1);
  }

  function uniformRandomItem(items, rng = Math.random) { return items[Math.floor(rng() * items.length)]; }

  function showPerformanceResult(plan, result, stamina, rewardChoice) {
    els.performanceResultScore.textContent = `${formatNumber(result.score)} 分`;
    els.performanceResultSummary.textContent = `消耗 ${stamina} 体力 · 当前累计效率 ${state.totalStamina ? (state.totalScore / state.totalStamina).toFixed(1) : "0.0"}`;
    els.performanceResultBreakdown.innerHTML = [
      ["道具基础", formatNumber(state.preview.baseTotal)],
      ["套装加成", signedNumber(state.preview.setTotal)],
      ["能力加成", signedNumber(state.preview.abilityTotal)],
      ["背包表演值", formatNumber(result.baseScore)],
      ["发挥变化", signedNumber(result.outcomeBonus)],
      ["节拍操作", signedNumber(result.beatBonus)],
      [plan.event?.name || "现场事件", signedNumber(result.eventAdjustment)],
    ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join("");
    if (state.mode === "trial") {
      const remaining = state.config.trial_performances_per_reward - (state.performances % state.config.trial_performances_per_reward);
      els.performanceRewards.innerHTML = rewardChoice
        ? `<p class="reward-complete">本场出现 ${rewardChoice.candidateIds.length} 件${rewardChoice.quality}色道具${rewardChoice.hasUnlockOption ? `和 1 个扩格选项` : ""}，选择 1 项</p>`
        : `<p class="reward-complete">再表演 ${remaining} 次进入奖励选择</p>`;
    } else {
      els.performanceRewards.innerHTML = '<p class="reward-complete">测试模式不改变道具库存</p>';
    }
    openDialog(els.performanceDialog);
  }

  function showRewardChoice() {
    if (!state.pendingRewardChoice || els.performanceDialog.open) return;
    renderRewardChoice();
    if (!els.rewardChoiceDialog.open) els.rewardChoiceDialog.show();
  }

  function renderRewardChoice() {
    const pending = state.pendingRewardChoice;
    if (!pending) return;
    els.rewardChoiceDialog.classList.toggle("collapsed", state.rewardCollapsed);
    els.rewardChoiceToggleButton.textContent = state.rewardCollapsed ? "展开选择" : "收起查看背包";
    els.rewardChoiceSummary.textContent = `${pending.quality}色同品质道具候选${pending.hasUnlockOption ? " · 含扩格选项" : " · 3件道具"}`;
    els.rewardChoiceList.innerHTML = pending.options.map((option) => {
      if (option.type === "unlock") {
        const selected = pending.selectedKey === option.key;
        return `<button type="button" class="reward-choice-card reward-choice-unlock${selected ? " selected" : ""}" data-reward-key="${option.key}" role="radio" aria-checked="${selected}" style="--quality-color:#D3A94E">
          <span class="reward-unlock-icon" aria-hidden="true">＋</span>
          <span class="reward-choice-card-title"><strong>选择解锁${option.unlockCount}个格子</strong><span>背包扩充</span></span>
          <span class="reward-choice-effect">确认后获得 ${option.unlockCount} 次相邻格解锁机会，可在背包中逐格选择。</span>
        </button>`;
      }
      const item = state.items.get(option.itemId);
      const quality = state.qualities.get(item.quality);
      const selected = pending.selectedKey === item.id;
      const owned = ownedInstanceForItem(item.id);
      const progress = Number(state.upgradeProgress[item.id] || 0);
      const ownership = !owned ? "尚未持有" : owned.level >= state.config.max_item_level ? `已达 Lv.${owned.level} · 再次获得转化为巡演纪念票` : `已持有 Lv.${owned.level} · 升级进度 ${progress}/${state.config.upgrade_duplicates_per_level}`;
      const memberships = item.sets.map((setId) => `${state.sets.get(setId)?.name || setId} · 已拥有${ownedSetMemberCount(setId)}件`).join(" / ") || "无套装";
      return `<button type="button" class="reward-choice-card${selected ? " selected" : ""}" data-reward-key="${item.id}" role="radio" aria-checked="${selected}" style="--quality-color:${quality.color}">
        <span class="reward-choice-card-head">${itemIcon(item, "reward")}<span class="reward-choice-card-title"><strong>${escapeHtml(item.name)}</strong><span>${item.id} · ${item.quality} · ${escapeHtml(item.category)}</span></span></span>
        <span class="reward-choice-levels"><span>持有状态</span><strong>${escapeHtml(ownership)}</strong></span>
        <span class="reward-choice-card-facts"><span><span>套装</span><strong>${escapeHtml(memberships)}</strong></span><span><span>占格与限制</span><span class="reward-choice-occupancy"><strong>${item.width}×${item.height} · ${item.area}格<br>重复获得自动升级</strong>${shapePreview(item, "compact")}</span></span></span>
        <span class="reward-choice-levels"><span>基础表演值 Lv.1—Lv.5</span><strong>${item.base.map(formatNumber).join(" / ")}</strong></span>
        <span class="reward-choice-levels"><span>能力值 Lv.1—Lv.5</span><strong>${item.effect.map((_, index) => formatEffectValue(item, index + 1)).join(" / ")}</strong></span>
        <span class="reward-choice-effect">${highlightConcepts(abilityText(item, 1))}</span>
      </button>`;
    }).join("");
    for (const card of els.rewardChoiceList.querySelectorAll("[data-reward-key]")) {
      card.addEventListener("click", () => {
        state.pendingRewardChoice.selectedKey = card.dataset.rewardKey;
        persistState();
        renderRewardChoice();
      });
    }
    const selectedOption = pending.options.find((option) => option.key === pending.selectedKey);
    const selectedItem = selectedOption?.type === "item" ? state.items.get(selectedOption.itemId) : null;
    els.rewardChoiceHint.textContent = selectedOption ? `已选择：${selectedItem?.name || `解锁${selectedOption.unlockCount}个格子`}` : "请选择 1 个奖励";
    els.confirmRewardChoiceButton.disabled = !selectedOption;
  }

  function toggleRewardChoicePanel() {
    if (!state.pendingRewardChoice) return;
    state.rewardCollapsed = !state.rewardCollapsed;
    renderRewardChoice();
  }

  function ownedSetMemberCount(setId) {
    return [...state.discovered].filter((itemId) => state.items.get(itemId)?.sets.includes(setId)).length;
  }

  function confirmRewardChoice() {
    const pending = state.pendingRewardChoice;
    const selectedOption = pending?.options.find((option) => option.key === pending.selectedKey);
    if (!pending || !selectedOption) return;
    if (selectedOption.type === "unlock") {
      state.expansionTokens += selectedOption.unlockCount;
      const rewardLog = state.logs.find((log) => log.number === pending.performanceNumber);
      if (rewardLog) rewardLog.rewards = `解锁${selectedOption.unlockCount}格`;
      state.pendingRewardChoice = null;
      state.rewardCollapsed = false;
      els.rewardChoiceDialog.close();
      renderAll();
      showToast(`已获得 ${selectedOption.unlockCount} 次扩格机会，请点击金色虚线格`, "success", 5000);
      return;
    }
    const item = state.items.get(selectedOption.itemId);
    const owned = ownedInstanceForItem(item.id);
    let spot = null;
    let rewardText = item.name;
    if (!owned) {
      const instance = makeInstance(item.id, state.config.initial_item_level);
      state.discovered.add(item.id);
      state.inventory.push(instance);
      spot = firstValidSpot(instance.instanceId);
      if (spot) {
        state.inventory.splice(state.inventory.findIndex((entry) => entry.instanceId === instance.instanceId), 1);
        state.placed.push({ ...instance, row: spot.row, col: spot.col });
      }
      rewardText = `新道具：${item.name}`;
    } else if (owned.level >= state.config.max_item_level) {
      state.memorialTickets += 1;
      rewardText = `${item.name}已满级，转化巡演纪念票×1`;
    } else {
      const nextProgress = Number(state.upgradeProgress[item.id] || 0) + 1;
      if (nextProgress >= state.config.upgrade_duplicates_per_level) {
        owned.level += 1;
        state.upgradeProgress[item.id] = 0;
        rewardText = `${item.name}升级至 Lv.${owned.level}`;
      } else {
        state.upgradeProgress[item.id] = nextProgress;
        rewardText = `${item.name}升级进度 ${nextProgress}/${state.config.upgrade_duplicates_per_level}`;
      }
    }
    const rewardLog = state.logs.find((log) => log.number === pending.performanceNumber);
    if (rewardLog) rewardLog.rewards = rewardText;
    state.pendingRewardChoice = null;
    state.rewardCollapsed = false;
    els.rewardChoiceDialog.close();
    renderAll();
    showToast(!owned ? (spot ? `已获得 ${item.name}，并放入背包` : `已获得 ${item.name}；当前无完整空位，已放入仓库`) : rewardText, "success", 5000);
  }

  function ownedInstanceForItem(itemId) {
    return state.placed.find((entry) => entry.itemId === itemId) || state.inventory.find((entry) => entry.itemId === itemId) || null;
  }

  function runSimulationBatch() {
    if (!state.config || !state.placed.length || state.preview.total <= 0) {
      els.simulationOutput.textContent = "请先把至少一件道具放入背包。";
      return;
    }
    const count = clamp(Math.round(Number(els.simulationCountInput.value) || 100), 1, 1000);
    els.simulationCountInput.value = count;
    const baseSeed = els.simulationSeedInput.value.trim() || `${state.runSeed}:batch`;
    const scores = [];
    let lastEventId = null;
    for (let index = 0; index < count; index += 1) {
      const seed = `${baseSeed}:${index + 1}`;
      const plan = PerformanceSimulation.createPlan({
        seed,
        baseScore: state.preview.total,
        placed: state.placed,
        items: state.items,
        breakdown: state.preview.breakdown,
        rules: state.performanceRules,
        outcomes: state.outcomes,
        events: state.events,
        categoryTraits: state.categoryTraits,
        lastEventId,
      });
      const result = PerformanceSimulation.scorePlan(plan, PerformanceSimulation.autoInteractions(plan, seed), state.performanceRules, state.categoryTraits);
      scores.push(result.score);
      lastEventId = plan.event?.id || lastEventId;
    }
    const stats = PerformanceSimulation.summarize(scores, state.preview.total);
    els.simulationOutput.innerHTML = `<strong>${count} 场模拟完成</strong> · 平均 ${formatNumber(stats.mean)} · P5/P50/P95 ${formatNumber(stats.p5)} / ${formatNumber(stats.p50)} / ${formatNumber(stats.p95)} · 区间 ${formatNumber(stats.min)}—${formatNumber(stats.max)} · 波动系数 ${(stats.cv * 100).toFixed(1)}% · 与基础分完全相同 ${(stats.baseRepeatRate * 100).toFixed(1)}%<br><span>种子：${escapeHtml(baseSeed)}</span>`;
  }

  function unloadAll() {
    if (rewardDecisionLocked()) return showToast("请先完成本次道具选择", "error");
    if (!state.placed.length) return showToast("背包当前没有道具");
    pushHistory();
    state.inventory.push(...state.placed.map(({ instanceId, itemId, level }) => ({ instanceId, itemId, level })));
    state.placed = [];
    state.selectedPlacedId = null;
    renderAll();
    showToast("背包道具已全部卸回仓库", "success");
  }

  function placeFromWarehouse(instanceId, row, col, allowSwap = true, recordHistory = true) {
    if (rewardDecisionLocked()) return showToast("选择奖励期间不能调整背包", "error");
    const validation = validatePlacement(instanceId, row, col, { allowSwap });
    if (!validation.ok) return showToast(validation.message, "error");
    if (recordHistory) pushHistory();
    const index = state.inventory.findIndex((entry) => entry.instanceId === instanceId);
    if (index < 0) return;
    const [instance] = state.inventory.splice(index, 1);
    if (validation.swapInstanceId) {
      const swapIndex = state.placed.findIndex((entry) => entry.instanceId === validation.swapInstanceId);
      const [swapped] = state.placed.splice(swapIndex, 1);
      state.inventory.push({ instanceId: swapped.instanceId, itemId: swapped.itemId, level: swapped.level });
    }
    state.placed.push({ ...instance, row, col });
    state.selectedInventoryId = null;
    state.selectedPlacedId = null;
    renderAll();
    showToast(validation.swapInstanceId ? "已替换道具，旧道具返回仓库" : "道具已放入背包", "success");
  }

  function movePlacedItem(instanceId, row, col, allowSwap = true, recordHistory = true) {
    const placed = state.placed.find((entry) => entry.instanceId === instanceId);
    if (!placed) return;
    const validation = validatePlacement(instanceId, row, col, { allowSwap });
    if (!validation.ok) return showToast(validation.message, "error");
    if (recordHistory) pushHistory();
    if (validation.swapInstanceId) {
      const swapIndex = state.placed.findIndex((entry) => entry.instanceId === validation.swapInstanceId);
      const [swapped] = state.placed.splice(swapIndex, 1);
      state.inventory.push({ instanceId: swapped.instanceId, itemId: swapped.itemId, level: swapped.level });
    }
    placed.row = row;
    placed.col = col;
    state.selectedPlacedId = null;
    renderAll();
    showToast(validation.swapInstanceId ? "目标位置道具已返回仓库" : "道具位置已更新", "success");
  }

  function returnToWarehouse(instanceId, recordHistory = true) {
    if (rewardDecisionLocked()) return showToast("选择奖励期间不能调整背包", "error");
    const index = state.placed.findIndex((entry) => entry.instanceId === instanceId);
    if (index < 0) return;
    if (recordHistory) pushHistory();
    const [placed] = state.placed.splice(index, 1);
    state.inventory.push({ instanceId: placed.instanceId, itemId: placed.itemId, level: placed.level });
    state.selectedPlacedId = null;
    renderAll();
    showToast("道具已返回仓库", "success");
  }

  function validatePlacement(instanceId, row, col, options = {}) {
    const instance = getInstance(instanceId);
    if (!instance) return { ok: false, message: "找不到该道具实例" };
    const item = state.items.get(instance.itemId);
    const rows = state.config.backpack_rows;
    const cols = state.config.backpack_cols;
    if (row < 0 || col < 0 || row + item.height > rows || col + item.width > cols) return { ok: false, message: "道具超出背包边界" };
    for (let r = row; r < row + item.height; r += 1) for (let c = col; c < col + item.width; c += 1) {
      if (!state.unlocked.has(cellKey(r, c))) return { ok: false, message: "道具必须完整放在已解锁格子内" };
    }
    const overlaps = state.placed.filter((other) => other.instanceId !== instanceId && rectanglesOverlap({ row, col, width: item.width, height: item.height }, placementRect(other)));
    let swapInstanceId = null;
    if (overlaps.length) {
      if (options.allowSwap && overlaps.length === 1) swapInstanceId = overlaps[0].instanceId;
      else return { ok: false, message: overlaps.length > 1 ? "该位置覆盖多件道具，不能直接替换" : "该位置已有道具" };
    }
    const excluded = new Set([instanceId, swapInstanceId].filter(Boolean));
    const remaining = state.placed.filter((entry) => !excluded.has(entry.instanceId));
    const sameLimitCount = remaining.filter((entry) => {
      const other = state.items.get(entry.itemId);
      if (item.limitScope === "同名") return other.id === item.limitKey;
      if (item.limitScope === "种类") return other.category === item.limitKey;
      return false;
    }).length;
    if (item.limitScope !== "无" && sameLimitCount + 1 > item.limitCount) return { ok: false, message: `超过放置限制：${item.limitText}` };
    return { ok: true, swapInstanceId };
  }

  function calculateScore() {
    const breakdown = new Map();
    for (const placed of state.placed) {
      const item = state.items.get(placed.itemId);
      const base = item.base[placed.level - 1];
      breakdown.set(placed.instanceId, { base, setFixed: 0, specialFixed: 0, receivedPercent: 0, total: base, active: false, matches: 0, activeSets: [], setSources: [], abilitySources: [] });
    }

    const setStates = new Map();
    for (const set of state.sets.values()) {
      const members = state.placed.filter((placed) => state.items.get(placed.itemId).sets.includes(set.id));
      const distinctCount = new Set(members.map((placed) => placed.itemId)).size;
      const tierIndex = set.tiers.reduce((activeIndex, tier, index) => distinctCount >= tier.count ? index : activeIndex, -1);
      const tier = tierIndex >= 0 ? set.tiers[tierIndex] : null;
      setStates.set(set.id, { ...set, members, count: distinctCount, tierIndex, tier });
      if (!tier) continue;
      for (const member of members) {
        const info = breakdown.get(member.instanceId);
        info.setFixed += Number(tier.fixed || 0);
        info.activeSets.push(set.id);
        info.setSources.push({ name: `${set.name} ${tierIndex + 1}级`, value: Number(tier.fixed || 0) });
      }
      const special = tier.special;
      if (!special) continue;
      if (special.type === "adjacentMemberBonus") {
        for (const member of members) {
          if (members.some((other) => other.instanceId !== member.instanceId && areAdjacent(placementRect(member), placementRect(other)))) {
            const targetInfo = breakdown.get(member.instanceId);
            targetInfo.specialFixed += Number(special.value || 0);
            targetInfo.setSources.push({ name: `${set.name} ${tierIndex + 1}级特殊效果`, value: Number(special.value || 0) });
          }
        }
      } else if (special.type === "allInstrumentBonus") {
        for (const target of state.placed) if (instrumentCategories().includes(state.items.get(target.itemId).category)) {
          const targetInfo = breakdown.get(target.instanceId);
          targetInfo.specialFixed += Number(special.value || 0);
          targetInfo.setSources.push({ name: `${set.name} ${tierIndex + 1}级特殊效果`, value: Number(special.value || 0) });
        }
      } else if (special.type === "categoryBonus") {
        for (const target of state.placed) if (state.items.get(target.itemId).category === special.category) {
          const targetInfo = breakdown.get(target.instanceId);
          targetInfo.specialFixed += Number(special.value || 0);
          targetInfo.setSources.push({ name: `${set.name} ${tierIndex + 1}级特殊效果`, value: Number(special.value || 0) });
        }
      }
    }

    for (const source of state.placed) {
      const item = state.items.get(source.itemId);
      const value = item.effect[source.level - 1];
      const rule = item.effectRule;
      const info = breakdown.get(source.instanceId);
      if (rule.type === "targetBuff") {
        const recipients = targetsForRule(source, rule).slice(0, rule.cap ?? Infinity);
        info.matches = recipients.length;
        info.active = recipients.length > 0;
        for (const recipient of recipients) {
          const recipientInfo = breakdown.get(recipient.instanceId);
          recipientInfo.receivedPercent += value;
          recipientInfo.abilitySources.push({ name: item.name, value });
        }
      }
    }
    let total = 0;
    let baseTotal = 0;
    let setTotal = 0;
    let abilityTotal = 0;
    for (const info of breakdown.values()) {
      const fixedValue = info.base + info.setFixed + info.specialFixed;
      info.total = state.config.rounding_mode === "floor" ? Math.floor(fixedValue * (1 + info.receivedPercent / 100)) : Math.round(fixedValue * (1 + info.receivedPercent / 100));
      baseTotal += info.base;
      setTotal += info.setFixed + info.specialFixed;
      abilityTotal += info.total - fixedValue;
      total += info.total;
    }
    return { total, baseTotal, setTotal, abilityTotal, breakdown, sets: setStates };
  }

  function instrumentCategories() { return ["键盘乐器", "弦乐器", "管乐器", "打击乐器"]; }

  function countForRule(source, rule) {
    return Math.min(targetsForRule(source, rule).length, rule.cap ?? Infinity);
  }

  function targetsForRule(source, rule) {
    return state.placed.filter((target) => {
      if ((rule.excludeSource ?? true) && target.instanceId === source.instanceId) return false;
      const item = state.items.get(target.itemId);
      if (!matchesFilter(item, rule.filter || { any: true })) return false;
      if (rule.excludeAdjacent && areAdjacent(placementRect(source), placementRect(target))) return false;
      if (rule.scope === "adjacent") return areAdjacent(placementRect(source), placementRect(target));
      if (rule.scope === "direction") return (rule.directions || []).includes(directionOf(placementRect(source), placementRect(target)));
      return true;
    });
  }

  function matchesFilter(item, filter = {}) {
    if (filter.any) return true;
    if (filter.category && !filter.category.includes(item.category)) return false;
    if (filter.name && !filter.name.includes(item.name)) return false;
    if (filter.minArea != null && item.area < filter.minArea) return false;
    return true;
  }

  function pushHistory() {
    state.history.push(layoutSnapshot());
    if (state.history.length > 80) state.history.shift();
    state.future = [];
  }

  function layoutSnapshot() {
    return {
      inventory: structuredClone(state.inventory),
      placed: structuredClone(state.placed),
      unlocked: [...state.unlocked],
      expansionTokens: state.expansionTokens,
    };
  }

  function applyLayoutSnapshot(snapshot) {
    state.inventory = structuredClone(snapshot.inventory);
    state.placed = structuredClone(snapshot.placed);
    state.unlocked = new Set(snapshot.unlocked);
    state.expansionTokens = snapshot.expansionTokens;
    state.selectedInventoryId = null;
    state.selectedPlacedId = null;
  }

  function undo() {
    if (rewardDecisionLocked()) return showToast("请先完成本次道具选择", "error");
    if (!state.history.length) return;
    state.future.push(layoutSnapshot());
    applyLayoutSnapshot(state.history.pop());
    renderAll();
    showToast("已撤销上一步摆放");
  }

  function redo() {
    if (rewardDecisionLocked()) return showToast("请先完成本次道具选择", "error");
    if (!state.future.length) return;
    state.history.push(layoutSnapshot());
    applyLayoutSnapshot(state.future.pop());
    renderAll();
    showToast("已重做摆放");
  }

  function handleKeyboard(event) {
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if (event.key === "Escape" && state.drag) return cancelPointerGesture();
    if (typing) return;
    if (event.key === "Backspace") { event.preventDefault(); unloadAll(); }
    if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
    if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
  }

  function placementRect(placed) {
    const item = state.items.get(placed.itemId);
    return { row: placed.row, col: placed.col, width: item.width, height: item.height };
  }

  function placementCells(placed) {
    const item = state.items.get(placed.itemId);
    const result = [];
    for (let row = placed.row; row < placed.row + item.height; row += 1) for (let col = placed.col; col < placed.col + item.width; col += 1) result.push(cellKey(row, col));
    return result;
  }

  function rectanglesOverlap(a, b) { return a.col < b.col + b.width && a.col + a.width > b.col && a.row < b.row + b.height && a.row + a.height > b.row; }
  function areAdjacent(a, b) {
    const horizontalTouch = (a.col + a.width === b.col || b.col + b.width === a.col) && rangesOverlap(a.row, a.row + a.height, b.row, b.row + b.height);
    const verticalTouch = (a.row + a.height === b.row || b.row + b.height === a.row) && rangesOverlap(a.col, a.col + a.width, b.col, b.col + b.width);
    return horizontalTouch || verticalTouch;
  }
  function directionOf(source, target) {
    if (target.col + target.width <= source.col && rangesOverlap(source.row, source.row + source.height, target.row, target.row + target.height)) return "left";
    if (target.col >= source.col + source.width && rangesOverlap(source.row, source.row + source.height, target.row, target.row + target.height)) return "right";
    if (target.row + target.height <= source.row && rangesOverlap(source.col, source.col + source.width, target.col, target.col + target.width)) return "up";
    if (target.row >= source.row + source.height && rangesOverlap(source.col, source.col + source.width, target.col, target.col + target.width)) return "down";
    return null;
  }
  function rangesOverlap(startA, endA, startB, endB) { return Math.max(startA, startB) < Math.min(endA, endB); }

  function exportLogs() {
    if (!state.logs.length) return showToast("当前没有可导出的表演日志", "error");
    const rows = [["场次", "体力", "基础分", "发挥变化", "操作变化", "事件变化", "最终得分", "效率", "种子", "事件", "详细过程", "道具数", "可用格", "新解锁道具", "时间"], ...[...state.logs].reverse().map((log) => [log.number, log.stamina, log.baseScore ?? log.score, log.outcomeBonus || 0, log.beatBonus || 0, log.eventAdjustment || 0, log.score, Number(log.efficiency || 0).toFixed(2), log.seed || "", log.eventName || "", log.detailText || "", log.itemCount, log.unlockedCells, log.rewards || "", log.time])];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `爱乐之城-${state.mode === "trial" ? "试玩" : "测试"}-表演日志-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function openDialog(dialog) { if (dialog && !dialog.open) dialog.showModal(); }
  function closeAllDialogs() { document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close()); }
  function getInstance(instanceId) { return state.inventory.find((entry) => entry.instanceId === instanceId) || state.placed.find((entry) => entry.instanceId === instanceId); }
  function randomItem(items) { return items.length ? items[Math.floor(Math.random() * items.length)] : null; }
  function csvCell(value) { return `"${String(value).replaceAll('"', '""')}"`; }
  function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function setControlsEnabled(enabled) {
    const locked = rewardDecisionLocked();
    for (const control of [els.performButton, els.unloadAllButton, els.skipPerformanceCheckbox, els.resetButton, els.applyUnlockCountButton, els.simulateButton]) control.disabled = !enabled || locked;
    els.exportLogButton.disabled = !enabled;
  }
  function rewardDecisionLocked() { return Boolean(state.pendingRewardChoice); }
  function showToast(message, type = "", duration = 3200) { clearTimeout(state.toastTimer); els.toast.textContent = message; els.toast.className = `toast show ${type}`; state.toastTimer = setTimeout(() => { els.toast.className = "toast"; }, duration); }
  function cellKey(row, col) { return `${row},${col}`; }
  function cellKeySort(a, b) { const [ar, ac] = a.split(",").map(Number); const [br, bc] = b.split(",").map(Number); return ar - br || ac - bc; }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function formatNumber(value) { return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value || 0); }
  function formatEffectValue(item, level) { return `${formatNumber(item.effect[level - 1])}${item.effectRule?.valueMode === "percent" ? "%" : ""}`; }
  function signedNumber(value) { const number = Math.round(Number(value) || 0); return number > 0 ? `+${formatNumber(number)}` : formatNumber(number); }
  function abilityText(item, level) {
    const rule = item.effectRule || {};
    const directionLabels = { left: "左", right: "右", up: "上", down: "下" };
    const scope = rule.scope === "direction" ? `${(rule.directions || []).map((direction) => directionLabels[direction] || direction).join("、")}方向的` : "相邻的";
    const categories = rule.filter?.category || [];
    const target = categories.length === 4 ? "键盘乐器、弦乐器、管乐器、打击乐器" : categories.join("、") || "任意乐器";
    return `使${scope}${target}增加${formatEffectValue(item, level)}表演值，最多${rule.cap ?? "不限"}件。`;
  }
  function highlightConcepts(text) {
    const terms = new Set(["键盘乐器", "弦乐器", "管乐器", "打击乐器", "舞台装饰", "相邻", "左、右方向", "上、下方向", "方向", ...[...state.sets.values()].map((set) => set.name)]);
    const pattern = new RegExp(`(${[...terms].sort((a, b) => b.length - a.length).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return String(text ?? "").split(pattern).map((part) => terms.has(part) ? `<mark class="concept-term">${escapeHtml(part)}</mark>` : escapeHtml(part)).join("");
  }
  function contributionFormula(breakdown) {
    const parts = [`${formatNumber(breakdown.base)}（基础表演值）`];
    for (const source of breakdown.setSources || []) parts.push(`${formatNumber(source.value)}（${escapeHtml(source.name)}）`);
    const fixed = breakdown.base + breakdown.setFixed + breakdown.specialFixed;
    const abilityGain = breakdown.total - fixed;
    if (abilityGain > 0) {
      const names = [...new Set((breakdown.abilitySources || []).map((source) => source.name))];
      parts.push(`${formatNumber(abilityGain)}（${names.map(escapeHtml).join("、")}能力，共${formatNumber(breakdown.receivedPercent)}%）`);
    }
    return `${formatNumber(breakdown.total)} = ${parts.join(" + ")}`;
  }
  function itemIcon(item, size = "warehouse") {
    const id = escapeHtml(item.id);
    const name = escapeHtml(item.name);
    const src = `assets/item-icons/${encodeURIComponent(item.id)}.webp?v=${ICON_ASSET_VERSION}`;
    return `<span class="item-icon item-icon-${size}" style="--item-width:${item.width};--item-height:${item.height};--quality-color:${state.qualities.get(item.quality)?.color || "#d7b766"}" role="img" aria-label="${name}图标"><img src="${src}" alt="" draggable="false" decoding="async"${size === "placed" ? "" : ' loading="lazy"'} data-item-icon-id="${id}"></span>`;
  }
  function shapePreview(item, size = "warehouse") {
    const gridSize = Math.max(4, item.width, item.height);
    const startRow = Math.floor((gridSize - item.height) / 2);
    const startCol = Math.floor((gridSize - item.width) / 2);
    const cells = [];
    for (let row = 0; row < gridSize; row += 1) {
      for (let col = 0; col < gridSize; col += 1) {
        const occupied = row >= startRow && row < startRow + item.height && col >= startCol && col < startCol + item.width;
        cells.push(`<i class="${occupied ? "occupied" : ""}"></i>`);
      }
    }
    return `<span class="shape-preview shape-preview-${size}" style="--shape-grid:${gridSize}" role="img" aria-label="占格形状：宽${item.width}格，高${item.height}格">${cells.join("")}</span>`;
  }
  function simpleHash(text) { let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

  window.validatorApp = {
    getState: () => ({
      configLoaded: Boolean(state.config), mode: state.mode, performances: state.performances, totalStamina: state.totalStamina,
      totalScore: state.totalScore, expansionTokens: state.expansionTokens, unlockedCells: state.unlocked.size,
      discoveredItems: state.discovered.size, inventoryCount: state.inventory.length, placedCount: state.placed.length,
      previewScore: state.preview.total, runSeed: state.runSeed, performanceRunning: state.performanceRunning, logs: state.logs,
    }),
    reset: () => { localStorage.removeItem(storageKey()); initializeFreshState(state.mode); renderAll(); },
    switchMode,
    perform,
    unlockTo: (count) => { pushHistory(); unlockToCount(clamp(count, state.config.initial_rows * state.config.initial_cols, state.config.backpack_rows * state.config.backpack_cols)); renderAll(); },
    placeItem: (itemId, row, col, level = 1) => {
      const instance = state.inventory.find((entry) => entry.itemId === itemId) || (() => { const created = makeInstance(itemId, level); state.inventory.push(created); state.discovered.add(itemId); return created; })();
      instance.level = level;
      placeFromWarehouse(instance.instanceId, row, col, true, true);
      return state.preview.total;
    },
    simulate: (count = 100, seed = "automation") => {
      els.simulationCountInput.value = count;
      els.simulationSeedInput.value = seed;
      runSimulationBatch();
      return els.simulationOutput.textContent;
    },
  };
})();
