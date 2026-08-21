(() => {
  "use strict";

  class PerformanceStage {
    constructor(elements, rules, categoryTraits = new Map()) {
      this.els = elements;
      this.rules = rules;
      this.categoryTraits = categoryTraits;
      this.speed = 1;
      this.skipRequested = false;
      this.currentBeat = null;
      this.eventResponded = false;
      this.playing = false;
      this.els.rhythmButton.addEventListener("click", () => this.pressBeat());
      this.els.eventAction.addEventListener("click", () => this.respondEvent());
      this.els.skipButton.addEventListener("click", () => { this.skipRequested = true; });
      for (const button of this.els.speedButtons) button.addEventListener("click", () => this.setSpeed(Number(button.dataset.stageSpeed)));
      this.els.dialog.addEventListener("cancel", (event) => { if (this.playing) event.preventDefault(); });
    }

    setRules(rules, categoryTraits = this.categoryTraits) { this.rules = rules; this.categoryTraits = categoryTraits; }

    setSpeed(speed) {
      this.speed = speed === 2 ? 2 : 1;
      for (const button of this.els.speedButtons) button.classList.toggle("active", Number(button.dataset.stageSpeed) === this.speed);
    }

    async play(plan) {
      this.playing = true;
      this.skipRequested = false;
      this.eventResponded = false;
      this.setSpeed(1);
      this.els.dialog.dataset.outcome = "steady";
      this.els.seed.textContent = `种子 ${plan.seed}`;
      this.els.eventCard.hidden = true;
      this.els.rhythmButton.disabled = true;
      this.els.title.textContent = "演出即将开始";
      this.els.subtitle.textContent = "三段聚光会依次落在背包道具上";
      this.els.item.textContent = "";
      this.els.outcome.textContent = "";
      this.renderSegments(plan, -1);
      if (!this.els.dialog.open) this.els.dialog.showModal();
      await this.wait(Number(this.rules.intro_duration_ms) || 650);

      const beats = [];
      for (let index = 0; index < plan.segments.length; index += 1) {
        if (this.skipRequested) break;
        beats[index] = await this.playSegment(plan.segments[index], index, plan);
        if (plan.event && plan.event.afterSegment === index && !this.skipRequested) await this.playEvent(plan.event);
      }
      while (beats.length < plan.segments.length) beats.push(null);
      if (!this.skipRequested) await this.wait(280);
      this.playing = false;
      this.currentBeat = null;
      this.els.dialog.close();
      return { beats, eventResponded: this.eventResponded, skipped: this.skipRequested };
    }

    renderSegments(plan, activeIndex) {
      this.els.segmentRail.innerHTML = plan.segments.map((segment, index) => `<span class="stage-segment${index === activeIndex ? " active" : ""}${index < activeIndex ? " complete" : ""}"><i>${index + 1}</i>${this.escape(segment.itemName)}</span>`).join("");
    }

    async playSegment(segment, index, plan) {
      this.renderSegments(plan, index);
      this.els.dialog.dataset.outcome = segment.outcomeId;
      this.els.title.textContent = `第 ${index + 1} 段 · 聚光时刻`;
      this.els.subtitle.textContent = `${segment.category} / ${segment.styleTag}`;
      this.els.item.textContent = segment.itemName;
      this.els.outcome.textContent = `${segment.outcomeName}${segment.outcomeBonus ? ` · 发挥 +${segment.outcomeBonus}` : ""}`;
      this.els.outcome.style.color = segment.outcomeColor;
      this.els.eventCard.hidden = true;
      this.els.rhythmButton.disabled = false;
      this.els.rhythmButton.textContent = "在中央点击合拍";
      this.els.beatFeedback.textContent = "等待节拍进入中央亮区";
      this.els.beatFeedback.className = "beat-feedback";
      this.els.beatMarker.style.left = "0%";
      this.currentSegment = segment;
      const perfectWindow = Math.max(0.02, Number(this.rules.beat_perfect_window) + (Number(this.categoryTraits.get(segment.category)?.beatWindowModifier) || 0));
      this.els.perfectZone.style.width = `${Math.min(0.9, perfectWindow * 2) * 100}%`;
      this.els.perfectZone.style.left = `${(0.5 - Math.min(0.45, perfectWindow)) * 100}%`;

      const progress = await this.runBeat(Number(this.rules.segment_duration_ms) || 1800);
      this.els.rhythmButton.disabled = true;
      if (!Number.isFinite(progress)) {
        this.els.beatFeedback.textContent = this.skipRequested ? "已跳过操作" : "未操作";
        this.els.beatFeedback.className = "beat-feedback miss";
      }
      await this.wait(360);
      return progress;
    }

    runBeat(duration) {
      return new Promise((resolve) => {
        let progress = 0;
        let previous = performance.now();
        let finished = false;
        this.currentBeat = {
          get progress() { return progress; },
          finish: (value) => {
            if (finished) return;
            finished = true;
            this.currentBeat = null;
            resolve(value);
          },
        };
        const frame = (now) => {
          if (finished) return;
          if (this.skipRequested) return this.currentBeat?.finish(null);
          progress += ((now - previous) * this.speed) / duration;
          previous = now;
          this.els.beatMarker.style.left = `${Math.min(1, progress) * 100}%`;
          if (progress >= 1) this.currentBeat?.finish(null);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }

    pressBeat() {
      if (!this.currentBeat) return;
      const progress = this.currentBeat.progress;
      const distance = Math.abs(progress - 0.5);
      const modifier = Number(this.categoryTraits.get(this.currentSegment?.category)?.beatWindowModifier) || 0;
      const perfect = (Number(this.rules.beat_perfect_window) || 0.12) + modifier;
      const good = (Number(this.rules.beat_good_window) || 0.28) + modifier;
      const label = distance <= perfect ? "精准！" : distance <= good ? "合拍" : "错拍";
      this.els.beatFeedback.textContent = label;
      this.els.beatFeedback.className = `beat-feedback ${distance <= perfect ? "perfect" : distance <= good ? "good" : "miss"}`;
      this.els.rhythmButton.textContent = label;
      this.currentBeat.finish(progress);
    }

    async playEvent(event) {
      this.els.eventCard.hidden = false;
      this.els.eventCard.dataset.eventType = event.type;
      this.els.eventName.textContent = event.name;
      this.els.eventDescription.textContent = event.description;
      this.els.eventAction.hidden = event.type !== "挑战" || !event.responseAction;
      this.els.eventAction.disabled = false;
      this.els.eventAction.textContent = event.responseAction || "";
      this.els.title.textContent = "现场事件";
      this.els.subtitle.textContent = event.type === "挑战" ? "及时回应可以降低损失" : "舞台产生了额外变化";
      const duration = event.type === "挑战" ? Number(this.rules.event_response_window_ms) || 1200 : Number(this.rules.event_duration_ms) || 1600;
      await this.wait(duration);
      this.els.eventAction.disabled = true;
      await this.wait(Math.max(260, (Number(this.rules.event_duration_ms) || 1600) - duration));
      this.els.eventCard.hidden = true;
    }

    respondEvent() {
      if (!this.playing || this.els.eventAction.disabled) return;
      this.eventResponded = true;
      this.els.eventAction.disabled = true;
      this.els.eventAction.textContent = "回应成功";
      this.els.eventDescription.textContent = "已及时处理，事件影响被削弱";
    }

    wait(milliseconds) {
      return new Promise((resolve) => {
        let remaining = milliseconds;
        let previous = performance.now();
        const frame = (now) => {
          if (this.skipRequested) return resolve();
          remaining -= (now - previous) * this.speed;
          previous = now;
          if (remaining <= 0) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }

    escape(value) {
      return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
    }
  }

  window.PerformanceStage = PerformanceStage;
})();
