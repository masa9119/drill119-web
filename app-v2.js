"use strict";

const app = document.querySelector("#app");
const helpDialog = document.querySelector("#helpDialog");
const bank = (window.SCENARIO_BANK || []).filter(item => item.active !== "0");
const navItems = [...document.querySelectorAll(".nav-item")];
const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const state = { page: "home", active: null, pool: [], recent: readRecent() };

function readRecent() {
  try {
    const value = JSON.parse(localStorage.getItem("caller-reader-recent") || "[]");
    return Array.isArray(value) ? value.filter(row => bank.some(item => item.scenario_id === row.id)).slice(0, 28) : [];
  } catch { return []; }
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function draw() {
  if (!state.pool.length) {
    state.pool = shuffle(bank.map(item => item.scenario_id));
    if (state.pool[0] === state.active?.scenario_id && state.pool.length > 1) {
      [state.pool[0], state.pool[1]] = [state.pool[1], state.pool[0]];
    }
  }
  openCase(state.pool.shift());
}

function openCase(id) {
  state.active = bank.find(item => item.scenario_id === id);
  state.recent = [{ id, at: new Date().toISOString() }, ...state.recent.filter(row => row.id !== id)].slice(0, 28);
  try { localStorage.setItem("caller-reader-recent", JSON.stringify(state.recent)); } catch { /* Reading works without storage. */ }
  navigate("reader");
}

function recentCards(rows) {
  return rows.map(row => {
    const item = bank.find(record => record.scenario_id === row.id);
    return `<button class="card recent-case" data-case="${esc(item.scenario_id)}"><span class="tag">情境 ${esc(item.scenario_id.slice(-2))}</span><span><b>${esc(item.title)}</b><small>${esc(item.category)}</small></span><span class="read-link">讀稿</span></button>`;
  }).join("");
}

function renderHome() {
  app.innerHTML = `
    <section class="hero"><span class="eyebrow">報案人員專用 · 28 個情境</span><h1>抽一題，<br>照著情境報案。</h1><p>開場怎麼說、被問時怎麼答，完整通話稿一次列出。先讀過一遍，報案時就能順暢應答。</p><div class="hero-actions"><button class="primary-button" id="draw">隨機抽一題</button><button class="secondary-button" data-page="guide">讀稿說明</button></div></section>
    <div class="reader-intro"><span>28 題不重複輪抽</span><span>可無限換題</span><span>完整對話直接看</span></div>
    <div class="section-head"><div><span class="eyebrow">RECENT SCRIPTS</span><h2>最近看過的情境</h2></div>${state.recent.length ? '<button class="text-button" data-page="history">查看全部</button>' : ""}</div>
    ${state.recent.length ? recentCards(state.recent.slice(0, 3)) : '<section class="card empty"><div class="empty-icon">☏</div><h2>先抽取一個情境</h2><p>抽題後即可直接閱讀完整報案稿。</p></section>'}
    <p class="notice-box">僅供演練。姓名、聯絡方式及未確定的地點，請依當次演練設定提供。</p>`;
  document.querySelector("#draw").addEventListener("click", draw);
  bindLinks();
}

function renderReader() {
  const item = state.active;
  app.innerHTML = `
    <div class="reader-toolbar"><button class="text-button" data-page="home">回首頁</button><span class="tag">情境 ${esc(item.scenario_id.slice(-2))} / 28</span><button class="primary-button" id="redraw">換一題</button></div>
    <section class="card case-brief"><div class="case-brief-top"><span class="eyebrow">${esc(item.category)}</span><h1 class="case-title">${esc(item.title)}</h1><p>${esc(item.summary)}</p></div><dl class="case-facts"><div><dt>模擬地點</dt><dd>${esc(item.location)}</dd></div><div><dt>涉及人員</dt><dd>${esc(item.people_affected)}</dd></div><div><dt>現場狀況</dt><dd>${esc(item.hazards)}</dd></div></dl></section>
    <section class="opening-card" aria-label="報案開場白"><span class="eyebrow">電話接通後，先說這句</span><p>「${esc(item.caller_opening.replace(/^【演練】/, ""))}」</p></section>
    <div class="section-head"><div><span class="eyebrow">完整通話稿</span><h2>受理員問，你照著答</h2></div></div>
    <p class="script-note">淺色為受理員提問，綠底為你的台詞。依實際追問回答，不必一次把所有內容念完。</p>
    <section class="script-list" aria-label="完整報案對話">${item.dialogue.map((line, index) => `<div class="script-line ${line.role === "caller" ? "caller-line" : "operator-line"}" data-role="${line.role}"><span class="speaker">${line.role === "caller" ? "你・報案人" : "受理員"}</span><p>${esc(line.text)}</p></div>`).join("")}</section>
    <section class="card details-card teacher-notes"><details><summary>教官補充資料</summary><div class="detail-body"><p class="script-note">以下為教官控制與評核資料，報案人不需主動念出。</p>${[["隱藏情資", item.hidden],["突發注入", item.injection],["應考核事項", item.review],["移交摘要", item.handover],["禁止事項", item.avoid]].map(([label,text]) => `<div class="detail-row"><b>${label}</b><span>${esc(text)}</span></div>`).join("")}</div></details></section>
    <div class="reader-end"><p>本題完整通話稿已列完</p><button class="secondary-button full" id="drawNext">換一題情境</button></div>`;
  document.querySelector("#redraw").addEventListener("click", draw);
  document.querySelector("#drawNext").addEventListener("click", draw);
  bindLinks();
}

function renderHistory() {
  app.innerHTML = `<div class="section-head"><div><span class="eyebrow">RECENT SCRIPTS</span><h1>最近看過</h1></div></div><p class="script-note">點選情境可再次開啟完整通話稿。</p>${state.recent.length ? recentCards(state.recent) : '<section class="card empty"><h2>尚未抽取情境</h2><p>先抽一題，就能直接讀稿。</p></section>'}<button class="primary-button full" id="historyDraw">隨機抽一題</button>`;
  document.querySelector("#historyDraw").addEventListener("click", draw);
  bindLinks();
}

function renderGuide() {
  const tips = [["01","先熟悉情境","先看地址、傷者和現場狀況，再讀一次完整通話稿。"],["02","用開場白開始","電話接通後先說醒目的報案首句，接著等受理員提問。"],["03","看綠底台詞回答","綠底是你扮演報案人的回答；受理員的問句是應答提示。"],["04","依實際追問調整","問句不一定逐字相同，可依問題在稿內找到對應資訊。未知的資訊就說不確定。"],["05","使用演練聯絡資料","姓名、電話與未定的場址，依當次演練設定提供。教官補充資料不必主動念出。"]];
  app.innerHTML = `<div class="section-head"><div><span class="eyebrow">CALLER GUIDE</span><h1>報案讀稿說明</h1></div></div><section class="guide-grid">${tips.map(([n,title,text]) => `<article class="card guide-card" data-step="${n}"><span class="eyebrow">${n}</span><h2>${title}</h2><p>${text}</p></article>`).join("")}</section><button class="primary-button full" id="guideDraw">隨機抽一題</button>`;
  document.querySelector("#guideDraw").addEventListener("click", draw);
}

function bindLinks() {
  app.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  app.querySelectorAll("[data-case]").forEach(button => button.addEventListener("click", () => openCase(button.dataset.case)));
}

function navigate(page) {
  state.page = page;
  navItems.forEach(button => button.classList.toggle("is-active", button.dataset.nav === (page === "reader" ? "home" : page)));
  if (!bank.length) app.innerHTML = '<section class="card warning"><h2>題庫載入失敗</h2><p>請重新整理頁面。</p></section>';
  else if (page === "reader") renderReader();
  else if (page === "history") renderHistory();
  else if (page === "guide") renderGuide();
  else renderHome();
  window.scrollTo({ top: 0, behavior: "auto" });
}

navItems.forEach(button => button.addEventListener("click", () => navigate(button.dataset.nav)));
document.querySelector(".brand").addEventListener("click", event => { event.preventDefault(); navigate("home"); });
document.querySelector("#openHelp").addEventListener("click", () => helpDialog.showModal());
navigate("home");
