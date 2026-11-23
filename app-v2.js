"use strict";

const app = document.querySelector("#app");
const helpDialog = document.querySelector("#helpDialog");
const toast = document.querySelector("#toast");
const navItems = [...document.querySelectorAll(".nav-item")];
const bank = (window.SCENARIO_BANK || []).filter(item => item.active !== "0");

const state = {
  page: "home",
  active: null,
  stage: 0,
  answers: [],
  messages: [],
  drawPool: [],
  history: JSON.parse(localStorage.getItem("call-sim-history-v2") || "[]")
};

const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const phoneIcon = `<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4H4.5A1.5 1.5 0 0 0 3 5.5C3 14.1 9.9 21 18.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-4-1-1.2 2c-3.9-1.7-7.1-4.9-8.8-8.8L8 8Z"/></svg>`;

function classify(item) {
  const text = item.title + item.summary;
  if (/瓦斯|油品|氣體|化工|鋼瓶/.test(text)) return { category: "危險物品", icon: "⬡", priority: "立即優先轉報" };
  if (/火警|火煙|黑煙|冒煙/.test(text)) return { category: "火災救助", icon: "◒", priority: "火警優先派遣" };
  if (/氧氣|醫院|頭傷|急診/.test(text)) return { category: "緊急救護", icon: "✚", priority: "救護／量能協調" };
  if (/國道|道路|車站|車輛|電線桿/.test(text)) return { category: "交通事故", icon: "◆", priority: "救助＋安全管制" };
  if (/魚塭|水圳|海堤/.test(text)) return { category: "水域／土石", icon: "≈", priority: "救助優先派遣" };
  if (/停水停電民眾焦慮/.test(text)) return { category: "民眾諮詢", icon: "i", priority: "辨識非緊急案件" };
  return { category: "建築事故", icon: "▥", priority: "立即優先轉報" };
}

function reviewFor(item) {
  const points = ["確認可派遣的完整位置與進入方式", "確認傷者、受困者人數及意識呼吸", "辨識持續危害並先確保報案者安全", "取得姓名與回撥方式，安排安全接應"];
  if (/訊號|電量/.test(item.summary + item.hazards)) points.unshift("通訊可能中斷，先取得位置與最關鍵資訊");
  if (/非緊急|詢問停電停水/.test(item.summary)) points.splice(1, 2, "快速排除火煙、受傷、受困與瓦斯等緊急危害");
  return points.slice(0, 4);
}

function avoidFor(item) {
  const text = item.title + item.summary;
  if (/電線/.test(text)) return "不得讓民眾靠近、跨越或自行移動疑似帶電線路。";
  if (/瓦斯|油品|氣體|化工|鋼瓶/.test(text)) return "不得要求民眾返回危險區關閉設備、辨識物質或自行處理洩漏。";
  if (/火警|火煙|黑煙/.test(text)) return "不得要求民眾返回火煙區取物或確認是否仍有人員。";
  if (/倒塌|坍塌|掉落|裂縫/.test(text)) return "不得要求民眾進入不穩定建物，或承諾已確認結構安全。";
  if (/魚塭|水圳|軌道|國道/.test(text)) return "不得要求報案者冒險接近事故核心或進行超出能力的救援。";
  return "不得承諾確切到場時間，也不得以不確定診斷或猜測取代客觀紀錄。";
}

function decorate(raw) {
  const lines = raw.caller_details.split(/\r?\n/).map(line => line.replace(/^[・•·]\s*/, "").trim()).filter(line => line && !line.startsWith("僅供演練"));
  const meta = classify(raw);
  return {
    ...raw, ...meta, detailLines: lines,
    review: reviewFor(raw), avoid: avoidFor(raw),
    hidden: `${raw.people_affected}；${raw.hazards}`
  };
}

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function drawCase() {
  if (!state.drawPool.length) {
    state.drawPool = shuffle(bank.map(item => item.scenario_id));
    if (state.active && state.drawPool[0] === state.active.scenario_id && state.drawPool.length > 1) {
      [state.drawPool[0], state.drawPool[1]] = [state.drawPool[1], state.drawPool[0]];
    }
  }
  const nextId = state.drawPool.shift();
  return decorate(bank.find(item => item.scenario_id === nextId));
}

function replyGroups(item) {
  const lines = item.detailLines.length ? item.detailLines : [item.location, item.people_affected, item.hazards, "聯絡資料依演練設定提供。"];
  return [
    lines.slice(0, Math.min(2, lines.length)).join(" ") || item.location,
    lines.slice(2, Math.min(5, lines.length)).join(" ") || `${item.people_affected} ${item.hazards}`,
    lines.slice(5).join(" ") || "我會留在安全處等候，聯絡資料依演練設定提供。"
  ];
}

function stagesFor(item) {
  const replies = replyGroups(item);
  const advisory = /民眾諮詢/.test(item.category);
  return [
    {
      prompt: "確認位置與自身安全", reply: replies[0], choices: [
        { text: "請先告訴我確切位置；你現在是否在安全的地方？", hint: "先定位，再確認報案者安全", correct: true },
        { text: "請先靠近一點，看清楚現場再告訴我。", hint: "可能使報案者暴露於危險", correct: false },
        { text: "救援人員很快就到，請先不要說話。", hint: "尚未取得有效派遣位置", correct: false }
      ]
    },
    {
      prompt: advisory ? "排除緊急危害" : "掌握人數、傷況與危害", reply: replies[1], choices: [
        { text: advisory ? "現場有人受傷、受困，或有火煙、瓦斯味、掉落物嗎？" : "有幾人受傷或受困？意識、呼吸如何？現場還有什麼危險？", hint: "詢問可觀察、可轉報的具體事實", correct: true },
        { text: "你覺得事情嚴不嚴重？", hint: "應詢問客觀情況而非主觀判斷", correct: false },
        { text: "先不用管其他人，只告訴我你有沒有受傷。", hint: "可能遺漏更優先的人員與危害", correct: false }
      ]
    },
    {
      prompt: "建立聯絡、接應與安全指示", reply: replies[2], choices: [
        { text: advisory ? "目前未發現緊急危害；請依主管機關資訊查詢。若情況改變請立即再通報。" : "請勿再進入危險區，留在安全處接應並保持電話暢通；請告訴我姓名與回撥方式。", hint: "交代安全、聯絡與後續行動", correct: true },
        { text: "請回現場再確認一次，確認完就可以掛電話。", hint: "不得要求報案者返回危險區", correct: false },
        { text: "資料差不多了，救援人員一定五分鐘內到。", hint: "不得承諾無法確認的到場時間", correct: false }
      ]
    }
  ];
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function startExercise(redraw = false) {
  state.active = drawCase();
  state.stage = 0;
  state.answers = [];
  state.messages = [{ role: "caller", text: state.active.caller_opening }];
  state.page = "exercise";
  setActiveNav("home");
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
  if (redraw) showToast("已換一題，不列入完成紀錄");
}

function answer(index) {
  const stage = stagesFor(state.active)[state.stage];
  const choice = stage.choices[index];
  state.answers.push({ ...choice, prompt: stage.prompt });
  state.messages.push({ role: "operator", text: choice.text }, { role: "caller", text: stage.reply });
  state.stage += 1;
  if (state.stage >= 3) completeExercise();
  render();
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
}

function completeExercise() {
  const score = state.answers.filter(answer => answer.correct).length * 30 + 10;
  state.active.score = score;
  state.active.transcript = [...state.messages];
  const entry = {
    id: `${state.active.scenario_id}-${Date.now()}`, type: state.active.scenario_id,
    category: state.active.category, title: state.active.title, location: state.active.location,
    score, date: new Date().toISOString()
  };
  state.history.unshift(entry);
  state.history = state.history.slice(0, 50);
  localStorage.setItem("call-sim-history-v2", JSON.stringify(state.history));
  state.page = "result";
  showToast("演練完成，已產生講評");
}

function setActiveNav(page) {
  navItems.forEach(item => item.classList.toggle("is-active", item.dataset.nav === page));
}

function stats() {
  const completed = state.history.length;
  return {
    completed,
    average: completed ? Math.round(state.history.reduce((sum, item) => sum + item.score, 0) / completed) : 0,
    best: completed ? Math.max(...state.history.map(item => item.score)) : 0
  };
}

function miniCase(item) {
  const date = new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.date));
  const source = bank.find(row => row.scenario_id === item.type);
  return `<article class="card case-mini"><div class="category-mark">${classify(source || item).icon}</div><div><h3>${esc(item.title)}</h3><p>${esc(item.location)} · ${date}</p></div><span class="score-pill">${item.score} 分</span></article>`;
}

function renderHome() {
  const summary = stats();
  const recent = state.history.slice(0, 3);
  app.innerHTML = `
    <section class="hero"><span class="eyebrow">28 CASES · UNLIMITED DRAW</span><h1>聽見關鍵，<br>做出正確反應。</h1>
      <p>內建 28 則大量話務演練情境。隨機抽取、不喜歡就換一題，全部抽完會自動重新洗牌。</p>
      <div class="hero-actions"><button class="primary-button" id="startExercise">${phoneIcon} 隨機抽一題</button><button class="secondary-button" id="quickGuide">先看受理要點</button></div>
    </section>
    <section class="stats-row" aria-label="演練統計"><div class="stat"><b>28</b><span>內建情境</span></div><div class="stat"><b>${summary.completed}</b><span>已完成</span></div><div class="stat"><b>${summary.average || "—"}</b><span>平均分數</span></div></section>
    <div class="section-head"><div><span class="eyebrow">RECENT</span><h2>最近演練</h2></div>${recent.length ? '<button class="text-button" data-go="history">查看全部</button>' : ""}</div>
    ${recent.length ? recent.map(miniCase).join("") : '<section class="card empty"><div class="empty-icon">◎</div><h2>還沒有演練紀錄</h2><p>第一則案件大約 2–3 分鐘即可完成。</p></section>'}
    <p class="notice-box">本頁所有案件均為演練教材。實際受理與派遣請依所屬機關現行規範辦理。</p>`;
  document.querySelector("#startExercise").addEventListener("click", () => startExercise());
  document.querySelector("#quickGuide").addEventListener("click", () => navigate("guide"));
  app.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
}

function renderExercise() {
  const item = state.active;
  const stages = stagesFor(item);
  const progress = Math.round((state.stage / 3) * 100);
  app.innerHTML = `
    <section class="exercise-head"><div class="topline"><span class="tag">${esc(item.scenario_id)} · ${esc(item.category)}</span><button class="secondary-button compact" id="redraw">換一題</button></div><div class="progress-track" aria-label="演練進度 ${progress}%"><div class="progress-bar" style="width:${progress}%"></div></div></section>
    <section class="card case-brief"><div class="case-brief-top"><span class="eyebrow">隨機情境</span><h2>${esc(item.title)}</h2><p>${esc(item.summary)}</p></div><div class="case-meta"><div class="meta-item"><span>模擬地點</span><b>${esc(item.location)}</b></div><div class="meta-item"><span>建議處理</span><b>${esc(item.priority)}</b></div></div></section>
    <div class="simulation-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg><span>扮演受理員並選擇回應。「換一題」不會列入紀錄，可無限重抽。</span></div>
    <section class="chat-card" aria-label="模擬報案對話">${state.messages.map(message => `<div class="message ${message.role === "operator" ? "operator" : ""}">${message.role === "caller" ? '<div class="avatar">報</div>' : ""}<div class="bubble"><small>${message.role === "caller" ? "模擬報案者" : "你 · 受理員"}</small><p>${esc(message.text)}</p></div></div>`).join("")}</section>
    <div class="section-head"><div><span class="eyebrow">STEP ${state.stage + 1} / 3</span><h2>${esc(stages[state.stage].prompt)}</h2></div></div>
    <div class="choices">${stages[state.stage].choices.map((choice, index) => `<button class="choice-button" data-choice="${index}">${esc(choice.text)}<span>${esc(choice.hint)}</span></button>`).join("")}</div>
    <button class="text-button full" id="leaveExercise">結束本次演練</button>`;
  document.querySelector("#redraw").addEventListener("click", () => startExercise(true));
  document.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => answer(Number(button.dataset.choice))));
  document.querySelector("#leaveExercise").addEventListener("click", () => { if (confirm("確定離開？本次進度不會保留。")) navigate("home"); });
}

function renderResult() {
  const item = state.active;
  const label = item.score >= 90 ? "關鍵資訊掌握完整" : item.score >= 60 ? "基本流程已掌握" : "建議再練習一次";
  app.innerHTML = `
    <section class="card result-hero"><span class="eyebrow">TRAINING COMPLETE</span><div class="score-ring" style="--score:${item.score}%"><div class="score-value">${item.score}<small>本次得分</small></div></div><h1>${label}</h1><p>${esc(item.scenario_id)} · ${esc(item.title)}</p><div class="hero-actions"><button class="primary-button" id="nextCase">再抽一題</button><button class="secondary-button" id="backHome">回到首頁</button></div></section>
    <div class="section-head"><div><span class="eyebrow">REVIEW</span><h2>應答講評</h2></div></div>
    <section class="card"><ul class="review-list">${state.answers.map(answer => `<li class="review-item"><span class="review-icon ${answer.correct ? "" : "miss"}">${answer.correct ? "✓" : "!"}</span><div><b>${esc(answer.prompt)}</b><span>${esc(answer.correct ? "處置方向正確。" : answer.hint)}</span></div></li>`).join("")}</ul></section>
    <div class="section-head"><div><span class="eyebrow">FULL CASE</span><h2>完整案件資料</h2></div><p>對照教材格式</p></div>
    <section class="card details-card">
      <details open><summary>案件摘要</summary><div class="detail-body"><div class="detail-row"><b>分類</b><span>${esc(item.category)}</span></div><div class="detail-row"><b>模擬地點</b><span>${esc(item.location)}</span></div><div class="detail-row"><b>狀況摘要</b><span>${esc(item.summary)}</span></div><div class="detail-row"><b>涉及人員</b><span>${esc(item.people_affected)}</span></div><div class="detail-row"><b>現場危害</b><span>${esc(item.hazards)}</span></div></div></details>
      <details><summary>完整逐字稿</summary><div class="detail-body">${item.transcript.map(message => `<div class="transcript-row"><b>${message.role === "caller" ? "報案人" : "受理員"}</b><p>${esc(message.text)}</p></div>`).join("")}</div></details>
      <details><summary>教育控制與審核</summary><div class="detail-body"><div class="detail-row"><b>隱藏情資</b><span>${esc(item.hidden)}</span></div><div class="detail-row"><b>應核事項</b><span>${esc(item.review.join("；"))}。</span></div><div class="detail-row warning"><b>禁止事項</b><span>${esc(item.avoid)}</span></div><div class="detail-row"><b>移交摘要</b><span>${esc(`${item.location}；${item.summary}；${item.people_affected}；${item.hazards}`)}</span></div></div></details>
    </section>`;
  document.querySelector("#nextCase").addEventListener("click", () => startExercise());
  document.querySelector("#backHome").addEventListener("click", () => navigate("home"));
}

function renderHistory() {
  const summary = stats();
  app.innerHTML = `<div class="section-head"><div><span class="eyebrow">HISTORY</span><h1>演練紀錄</h1></div></div><section class="stats-row"><div class="stat"><b>${summary.completed}</b><span>已完成</span></div><div class="stat"><b>${summary.average || "—"}</b><span>平均分數</span></div><div class="stat"><b>${summary.best || "—"}</b><span>最佳成績</span></div></section>${state.history.length ? state.history.map(miniCase).join("") : '<section class="card empty"><div class="empty-icon">◎</div><h2>尚無紀錄</h2><p>完成一則案件後，結果會顯示在這裡。</p><button class="primary-button" id="historyStart">開始第一題</button></section>'}${state.history.length ? '<button class="secondary-button full" id="clearHistory">清除本機紀錄</button>' : ""}`;
  document.querySelector("#historyStart")?.addEventListener("click", () => startExercise());
  document.querySelector("#clearHistory")?.addEventListener("click", () => { if (confirm("確定清除這台裝置上的演練紀錄？")) { state.history = []; localStorage.removeItem("call-sim-history-v2"); renderHistory(); showToast("紀錄已清除"); } });
}

function renderGuide() {
  const guides = [["01","先定位，再深入","優先取得可派遣的完整位置，包含路段、門牌、樓層、方向或明顯地標。"],["02","先確保報案者安全","遇到火煙、交通、坍塌、電線或化學危害，先請報案者退到安全位置。"],["03","問可觀察的事實","以人數、意識、呼吸、受困、火煙與危害等具體問題取代主觀判斷。"],["04","重述關鍵資訊","簡短核對地址、傷者人數與主要危害，降低聽誤。"],["05","建立接應與聯絡","確認姓名與回撥方式，請安全的人員至明顯處接應並保持電話暢通。"]];
  app.innerHTML = `<div class="section-head"><div><span class="eyebrow">FIELD GUIDE</span><h1>受理五要點</h1></div></div><p class="simulation-note">以下為一般化教學架構；實際勤務請以所屬機關最新作業規範與派遣系統為準。</p><section class="guide-grid">${guides.map(([step,title,text]) => `<article class="card guide-card" data-step="${step}"><span class="eyebrow">${step}</span><h2>${title}</h2><p>${text}</p></article>`).join("")}</section><button class="primary-button full" id="guideStart">隨機抽一題</button>`;
  document.querySelector("#guideStart").addEventListener("click", () => startExercise());
}

function navigate(page) {
  state.page = page;
  setActiveNav(["exercise","result"].includes(page) ? "home" : page);
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function render() {
  if (!bank.length) { app.innerHTML = '<section class="card warning"><h2>題庫載入失敗</h2><p>請確認 scenarios.js 與 index.html 位於同一資料夾。</p></section>'; return; }
  if (state.page === "exercise") renderExercise();
  else if (state.page === "result") renderResult();
  else if (state.page === "history") renderHistory();
  else if (state.page === "guide") renderGuide();
  else renderHome();
}

navItems.forEach(item => item.addEventListener("click", () => navigate(item.dataset.nav)));
document.querySelector(".brand").addEventListener("click", event => { event.preventDefault(); navigate("home"); });
document.querySelector("#openHelp").addEventListener("click", () => helpDialog.showModal());
render();
