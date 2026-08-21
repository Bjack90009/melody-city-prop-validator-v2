(() => {
  "use strict";

  function hash32(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function rngFromSeed(seed) {
    let value = hash32(seed) || 0x6d2b79f5;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weightedPick(rows, getWeight, rng) {
    if (!rows.length) return null;
    const total = rows.reduce((sum, row) => sum + Math.max(0, Number(getWeight(row)) || 0), 0);
    if (total <= 0) return rows[Math.floor(rng() * rows.length)];
    let roll = rng() * total;
    for (const row of rows) {
      roll -= Math.max(0, Number(getWeight(row)) || 0);
      if (roll <= 0) return row;
    }
    return rows.at(-1);
  }

  function chooseSpotlights(placed, count, getWeight, rng) {
    const chosen = [];
    let pool = [...placed];
    while (chosen.length < count && placed.length) {
      if (!pool.length) pool = placed.filter((entry) => placed.length === 1 || entry.instanceId !== chosen.at(-1)?.instanceId);
      const row = weightedPick(pool, getWeight, rng);
      chosen.push(row);
      pool = pool.filter((entry) => entry.instanceId !== row.instanceId);
    }
    return chosen;
  }

  function createPlan({ seed, baseScore, placed, items, breakdown, rules, outcomes, events, categoryTraits, lastEventId }) {
    const normalizedSeed = String(seed || "love-city-demo");
    const rng = rngFromSeed(normalizedSeed);
    const segmentCount = Math.max(1, Math.round(Number(rules.spotlight_segments) || 3));
    const spotlights = chooseSpotlights(placed, segmentCount, (placedEntry) => {
      const item = items.get(placedEntry.itemId);
      const trait = categoryTraits.get(item.category);
      const contribution = breakdown.get(placedEntry.instanceId)?.total || 0;
      return Math.max(1, contribution) * Math.max(0.1, Number(trait?.spotlightWeight) || 1);
    }, rng);

    const segments = spotlights.map((placedEntry, index) => {
      const item = items.get(placedEntry.itemId);
      const contribution = breakdown.get(placedEntry.instanceId)?.total || 0;
      const outcome = weightedPick(outcomes, (row) => row.weight, rng);
      const variableBase = contribution * (Number(rules.spotlight_variable_share) || 0.25);
      return {
        index,
        instanceId: placedEntry.instanceId,
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        styleTag: item.styleTag,
        quality: item.quality,
        contribution,
        outcomeId: outcome.id,
        outcomeName: outcome.name,
        outcomeColor: outcome.color,
        outcomeDescription: outcome.description,
        outcomeBonus: Math.round(variableBase * outcome.bonusRate),
      };
    });

    let event = null;
    if (events.length && rng() < Number(rules.event_chance ?? 1)) {
      const candidates = events.filter((row) => events.length === 1 || row.id !== lastEventId);
      const selected = weightedPick(candidates.length ? candidates : events, (row) => row.weight, rng);
      event = {
        ...selected,
        afterSegment: Math.min(Math.max(0, Math.floor(rng() * Math.max(1, segments.length - 1))), Math.max(0, segments.length - 2)),
        rawAdjustment: Math.round(baseScore * selected.scoreRate),
      };
    }

    return { seed: normalizedSeed, baseScore: Math.round(baseScore), segments, event };
  }

  function gradeBeat(progress, segment, rules, categoryTraits) {
    if (!Number.isFinite(progress)) return { grade: "miss", name: "未操作", bonus: 0, progress: null };
    const trait = categoryTraits.get(segment.category);
    const modifier = Number(trait?.beatWindowModifier) || 0;
    const distance = Math.abs(progress - 0.5);
    const perfectWindow = Math.max(0.02, Number(rules.beat_perfect_window) + modifier);
    const goodWindow = Math.max(perfectWindow, Number(rules.beat_good_window) + modifier);
    if (distance <= perfectWindow) return { grade: "perfect", name: "精准", bonus: Math.round(segment.contribution * Number(rules.beat_perfect_bonus_rate)), progress };
    if (distance <= goodWindow) return { grade: "good", name: "合拍", bonus: Math.round(segment.contribution * Number(rules.beat_good_bonus_rate)), progress };
    return { grade: "miss", name: "错拍", bonus: 0, progress };
  }

  function scorePlan(plan, interactions, rules, categoryTraits) {
    const beats = plan.segments.map((segment, index) => gradeBeat(interactions.beats?.[index], segment, rules, categoryTraits));
    const outcomeBonus = plan.segments.reduce((sum, segment) => sum + segment.outcomeBonus, 0);
    const beatBonus = beats.reduce((sum, beat) => sum + beat.bonus, 0);
    let eventAdjustment = plan.event?.rawAdjustment || 0;
    if (plan.event?.type === "挑战" && interactions.eventResponded) {
      eventAdjustment = Math.round(eventAdjustment * (1 - plan.event.responseRate));
    }
    const score = Math.max(0, Math.round(plan.baseScore + outcomeBonus + beatBonus + eventAdjustment));
    return { score, baseScore: plan.baseScore, outcomeBonus, beatBonus, eventAdjustment, beats, eventResponded: Boolean(interactions.eventResponded) };
  }

  function autoInteractions(plan, seed) {
    const rng = rngFromSeed(`${seed}:skill`);
    return {
      beats: plan.segments.map(() => {
        const roll = rng();
        if (roll < 0.25) return 0.5 + (rng() - 0.5) * 0.12;
        if (roll < 0.70) return 0.5 + (rng() < 0.5 ? -1 : 1) * (0.14 + rng() * 0.16);
        return rng() < 0.5 ? rng() * 0.12 : 0.88 + rng() * 0.12;
      }),
      eventResponded: Boolean(plan.event?.type === "挑战" && rng() < 0.65),
    };
  }

  function percentile(sorted, ratio) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
  }

  function summarize(scores, baseScore) {
    const sorted = [...scores].sort((a, b) => a - b);
    const mean = scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
    const variance = scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, scores.length);
    return {
      count: scores.length,
      min: sorted[0] || 0,
      p5: percentile(sorted, 0.05),
      p50: percentile(sorted, 0.50),
      p95: percentile(sorted, 0.95),
      max: sorted.at(-1) || 0,
      mean,
      cv: mean ? Math.sqrt(variance) / mean : 0,
      baseRepeatRate: scores.length ? scores.filter((score) => score === baseScore).length / scores.length : 0,
    };
  }

  window.PerformanceSimulation = { hash32, rngFromSeed, createPlan, scorePlan, autoInteractions, summarize };
})();
