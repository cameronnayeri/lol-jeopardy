import { sb, $, normCode, uid, fmtScore, fetchGame, saveGame, watchTable, toast, countdown } from "./common.js";
import { GAMES, BASE_VALUES } from "./questions.js";

// Host flow (stream-safe: this screen never shows an answer):
//   click a cell   -> clue reveals word by word; buzzers open at the start (default) or at the end (setting)
//   buzz           -> reveal freezes, screen clears to the buzzer's name; host judges ↑ / ↓
//   wrong          -> player locked out (unless rebuzz allowed), clue re-reveals from the first word
//   space          -> end question, back to board
// Questions live only in this browser (built-in file or a custom JSON kept in localStorage),
// never in Supabase, because players share the same database key.

const DEFAULT_SETTINGS = {
  speed: 3,               // words per second
  delay: 0,               // seconds after the last word before buzzers open (only matters with noBuzzWhileReading)
  noBuzzWhileReading: false,
  rebuzz: false,
  answerTimer: 0,         // seconds, 0 = off; expiry counts as wrong
  ddPerBoard: 1,
  spamPresses: 4,         // presses...
  spamWindow: 2,          // ...within this many seconds...
  spamLockout: 5          // ...locks the player out for this many seconds
};

let code = "";
let state = null;
let game = null;          // the question set in use (built-in or custom)
let resolvingBuzz = false;
let revealTimer = null;
let stopAnswerTimer = null;

// ---------- Setup ----------
const gameSel = $("#gameSel");
GAMES.forEach((g, i) => {
  const o = document.createElement("option");
  o.value = "builtin:" + i;
  o.textContent = g.title;
  gameSel.appendChild(o);
});
const savedCustom = loadCustom();
if (savedCustom) {
  const o = document.createElement("option");
  o.value = "custom";
  o.textContent = "Custom: " + savedCustom.title;
  gameSel.appendChild(o);
  gameSel.value = "custom";
}
$("#code").value = localStorage.getItem("hostCode") || "";

$("#file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const parsed = JSON.parse(await f.text());
    const err = validateGame(parsed);
    if (err) throw new Error(err);
    localStorage.setItem("lj_custom", JSON.stringify(parsed));
    let o = [...gameSel.options].find((x) => x.value === "custom");
    if (!o) { o = document.createElement("option"); o.value = "custom"; gameSel.appendChild(o); }
    o.textContent = "Custom: " + parsed.title;
    gameSel.value = "custom";
    $("#fileMsg").textContent = "Loaded \"" + parsed.title + "\": " + parsed.boards.length + " board(s). Kept in this browser.";
  } catch (err) {
    $("#fileMsg").textContent = "Could not load: " + err.message;
  }
};

function loadCustom() {
  try { const s = localStorage.getItem("lj_custom"); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}

function validateGame(g) {
  if (!g || typeof g !== "object") return "not a JSON object";
  if (!g.title) return "missing \"title\"";
  if (!Array.isArray(g.boards) || g.boards.length < 1 || g.boards.length > 2) return "\"boards\" must be a list of 1 or 2 boards";
  for (const [bi, b] of g.boards.entries()) {
    if (!Array.isArray(b.categories) || b.categories.length < 1 || b.categories.length > 6) return `board ${bi + 1}: needs 1 to 6 categories`;
    for (const [ci, c] of b.categories.entries()) {
      if (!c.name) return `board ${bi + 1}, category ${ci + 1}: missing "name"`;
      if (!Array.isArray(c.clues) || c.clues.length !== 5) return `board ${bi + 1}, "${c.name}": needs exactly 5 clues`;
      for (const [qi, q] of c.clues.entries()) {
        if (!q.clue || !q.answer) return `board ${bi + 1}, "${c.name}", clue ${qi + 1}: needs "clue" and "answer"`;
      }
    }
  }
  if (!g.final || !g.final.category || !g.final.clue || !g.final.answer) return "\"final\" needs category, clue and answer";
  return null;
}

function resolveGame(source) {
  if (source.type === "builtin") return GAMES[source.idx] || null;
  const c = loadCustom();
  return c && c.title === source.title ? c : null;
}

$("#startBtn").onclick = async () => {
  code = normCode($("#code").value);
  if (code.length < 3) return toast("Code needs at least 3 letters or numbers");
  const sel = gameSel.value;
  const source = sel === "custom" ? { type: "custom", title: loadCustom().title } : { type: "builtin", idx: Number(sel.split(":")[1]) };
  $("#setupMsg").textContent = "Loading...";
  try {
    const existing = await fetchGame(code);
    if (existing && existing.v === 3 && existing.source && JSON.stringify(existing.source) === JSON.stringify(source)) {
      state = existing;
      log("Resumed game " + code);
    } else {
      state = freshState(source);
      if (existing && existing.players) state.players = existing.players; // keep scores if the question set changes
      log("Created game " + code);
    }
    game = resolveGame(state.source);
    if (!game) {
      $("#setupMsg").textContent = "This game uses a custom file that isn't in this browser. Upload it again, then resume.";
      return;
    }
    state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
    if (!state.dd) state.dd = placeDailyDoubles(game, state.settings.ddPerBoard);
    await saveGame(code, state);
    await loadPlayers();
    localStorage.setItem("hostCode", code);
    enterGame();
  } catch (e) {
    console.error(e);
    $("#setupMsg").textContent = "Could not reach Supabase. Check config.js and that schema.sql was run. (" + (e.message || e) + ")";
  }
};

function freshState(source) {
  return {
    v: 3,
    source,
    players: {},
    boardIdx: 0,
    used: {},
    dd: null,
    phase: "board",
    clue: null,
    round: null,
    buzzer: null,
    lockedOut: [],
    wager: null,
    final: null,
    settings: { ...DEFAULT_SETTINGS }
  };
}

// Pick n random cells per board as Daily Doubles, weighted toward the bottom three rows like the show.
function placeDailyDoubles(g, n) {
  const dd = {};
  g.boards.forEach((b, bi) => {
    const cells = [];
    b.categories.forEach((_, c) => { for (let v = 0; v < 5; v++) cells.push({ c, v, w: v >= 2 ? 3 : 1 }); });
    for (let k = 0; k < n && cells.length; k++) {
      const total = cells.reduce((s, x) => s + x.w, 0);
      let r = Math.random() * total, i = 0;
      while (r >= cells[i].w) { r -= cells[i].w; i++; }
      const pick = cells.splice(i, 1)[0];
      dd[bi + "-" + pick.c + "-" + pick.v] = true;
    }
  });
  return dd;
}

async function loadPlayers() {
  const { data } = await sb.from("lj_players").select("name").eq("code", code);
  (data || []).forEach((p) => { if (!(p.name in state.players)) state.players[p.name] = 0; });
}

// ---------- Enter game ----------
function enterGame() {
  $("#setup").classList.add("hidden");
  $("#game").classList.remove("hidden");
  $("#codeLabel").textContent = code;
  $("#titleLabel").textContent = game.title;

  watchTable("lj_players", code, "INSERT", (row) => addPlayer(row.name));
  watchTable("lj_buzzes", code, "INSERT", () => resolveBuzz());
  setInterval(async () => {
    const { data } = await sb.from("lj_players").select("name").eq("code", code);
    (data || []).forEach((p) => addPlayer(p.name));
  }, 3000);
  setInterval(() => { if (state && buzzable()) resolveBuzz(); }, 250);

  sb.channel("ping-" + code).subscribe((s) => { $("#conn").textContent = s === "SUBSCRIBED" ? "live" : s.toLowerCase(); });

  bindSettings();

  if (state.phase === "reading") openBuzzersOrRead(); // page was refreshed mid-reveal

  const modal = $("#settingsModal");
  $("#settingsBtn").onclick = () => modal.classList.toggle("hidden");
  $("#settingsClose").onclick = () => modal.classList.add("hidden");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.add("hidden"); };

  $("#nextBtn").onclick = nextBoard;
  $("#finalBtn").onclick = startFinal;
  $("#resetBtn").onclick = async () => {
    if (!confirm("Reset the whole game? Scores are kept, board goes back to round 1.")) return;
    const players = state.players, settings = state.settings;
    state = freshState(state.source);
    state.players = players;
    state.settings = settings;
    state.dd = placeDailyDoubles(game, settings.ddPerBoard);
    await save();
  };

  render();
  save();
}

function bindSettings() {
  const s = state.settings;
  const fmt = {
    speed: (v) => v + " words/s", delay: (v) => v + " s", answerTimer: (v) => (v ? v + " s" : "off"),
    ddPerBoard: (v) => String(v), spamPresses: (v) => (v ? v + " presses" : "off"), spamWindow: (v) => v + " s", spamLockout: (v) => v + " s"
  };
  document.querySelectorAll("[data-s]").forEach((el) => {
    const k = el.dataset.s;
    const show = () => { const sp = document.querySelector(`[data-v="${k}"]`); if (sp) sp.textContent = fmt[k] ? fmt[k](s[k]) : s[k]; };
    if (el.type === "checkbox") el.checked = !!s[k]; else el.value = s[k];
    show();
    el.oninput = () => {
      s[k] = el.type === "checkbox" ? el.checked : Number(el.value);
      show();
      if (k === "ddPerBoard" && confirm("Re-roll Daily Double positions for both boards?")) state.dd = placeDailyDoubles(game, s.ddPerBoard);
      saveGame(code, state).catch((e) => toast("Save failed: " + (e.message || e)));
    };
  });
}

function addPlayer(name) {
  if (!state || name in state.players) return;
  state.players[name] = 0;
  log(name + " joined");
  saveGame(code, state).catch((e) => toast("Save failed: " + (e.message || e)));
  renderScores();
}

async function save() {
  state.cols = board().categories.length; // for the players' mini board
  try { await saveGame(code, state); } catch (e) { console.error(e); toast("Save failed: " + (e.message || e)); }
  render();
}

function log(msg) {
  const el = $("#log");
  const line = document.createElement("div");
  line.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + "  " + msg;
  el.prepend(line);
  while (el.children.length > 30) el.lastChild.remove();
}

// ---------- Helpers ----------
const board = () => game.boards[state.boardIdx];
const values = () => BASE_VALUES.map((v) => v * (state.boardIdx + 1));
const isDD = (c, v) => !!state.dd[state.boardIdx + "-" + c + "-" + v];
const buzzable = () => state.phase === "open" || (state.phase === "reading" && !!state.round);

function currentClue() {
  const { c, v } = state.clue;
  const cat = board().categories[c];
  return { cat, item: cat.clues[v], value: values()[v] };
}

// ---------- Render ----------
function render() {
  renderBoard();
  renderScores();
  renderOverlay();
  $("#boardLabel").textContent = board().name + (state.boardIdx === 1 ? " (double)" : "");
  $("#nextBtn").disabled = state.boardIdx >= game.boards.length - 1;
}

function renderBoard() {
  const b = board();
  const el = $("#board");
  el.innerHTML = "";
  el.style.gridTemplateColumns = `repeat(${b.categories.length}, 1fr)`;
  b.categories.forEach((cat) => {
    const c = document.createElement("div");
    c.className = "cell cat";
    c.textContent = cat.name;
    el.appendChild(c);
  });
  const vals = values();
  vals.forEach((val, v) => {
    b.categories.forEach((cat, c) => {
      const key = c + "-" + v;
      const cell = document.createElement("div");
      cell.className = "cell value" + (state.used[key] ? " used" : "");
      cell.textContent = "$" + val;
      cell.title = "Click: open clue. Shift+click: force Daily Double.";
      if (!state.used[key]) cell.onclick = (e) => (e.shiftKey || isDD(c, v) ? openDailyDouble(c, v) : openClue(c, v));
      el.appendChild(cell);
    });
  });
}

function renderScores() {
  const el = $("#scores");
  el.innerHTML = "";
  const names = Object.keys(state.players).sort((a, b) => state.players[b] - state.players[a]);
  if (!names.length) {
    el.innerHTML = '<div class="score"><span class="name" style="color:var(--muted)">No players yet. Send them the code.</span></div>';
    return;
  }
  names.forEach((name) => {
    const row = document.createElement("div");
    row.className = "score" + (state.buzzer === name ? " buzzer" : "") + (state.lockedOut.includes(name) ? " locked" : "");
    const pts = state.players[name];
    row.innerHTML = `<span class="name" title="${name}">${name}</span>
      <span class="pts ${pts < 0 ? "neg" : ""}">${fmtScore(pts)}</span>
      <span class="adj"><button class="ghost" data-d="1">+</button><button class="ghost" data-d="-1">−</button><button class="ghost" data-x="1" title="Remove">×</button></span>`;
    row.querySelectorAll("button[data-d]").forEach((b) => {
      b.onclick = () => {
        const amt = Number(prompt("Amount for " + name + ":", state.clue ? state.clue.value : values()[0]));
        if (!amt) return;
        state.players[name] += amt * Number(b.dataset.d);
        save();
      };
    });
    row.querySelector("button[data-x]").onclick = async () => {
      if (!confirm("Remove " + name + "?")) return;
      delete state.players[name];
      await sb.from("lj_players").delete().eq("code", code).eq("name", name);
      save();
    };
    el.appendChild(row);
  });
}

// ---------- Clue flow ----------
function openClue(c, v) {
  state.clue = { c, v, value: values()[v] };
  state.lockedOut = [];
  state.wager = null;
  state.buzzer = null;
  startReading();
}

// Enter the reading phase. Buzzers open now unless the setting says to wait for the last word.
function startReading() {
  stopReveal();
  state.phase = "reading";
  state.round = state.settings.noBuzzWhileReading ? null : uid();
  state.buzzer = null;
  save(); // render() starts the animation
}

function openBuzzers() {
  stopReveal();
  state.phase = "open";
  state.round = uid();
  state.buzzer = null;
  save();
}

function openBuzzersOrRead() {
  if (state.settings.noBuzzWhileReading) openBuzzers();
  else { state.phase = "open"; state.round = state.round || uid(); save(); }
}

// Word-by-word reveal on the host (streamed) screen.
function startReveal(text) {
  stopReveal();
  const body = $("#ovBody");
  const words = text.split(/\s+/).filter(Boolean);
  body.innerHTML = `<div>${words.map((w) => `<span class="w">${escapeHtml(w)}</span>`).join("")}</div>`;
  body.classList.add("reading");
  if (text.length > 160) body.classList.add("small");
  const spans = [...body.querySelectorAll(".w")];
  let i = 0;
  const step = 1000 / state.settings.speed;
  body.style.setProperty("--wipe", step + "ms"); // each word wipes left to right over one step, back to back
  const tick = () => {
    if (i < spans.length) {
      spans[i++].classList.add("on");
      revealTimer = setTimeout(tick, step);
    } else {
      const wait = state.settings.noBuzzWhileReading ? state.settings.delay * 1000 : 0;
      revealTimer = setTimeout(() => {
        revealTimer = null;
        if (state.phase === "reading") openBuzzersOrRead();
      }, wait);
    }
  };
  tick();
}

function stopReveal() {
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = null;
}

function skipReveal() {
  $("#ovBody").querySelectorAll(".w").forEach((s) => s.classList.add("instant", "on"));
  openBuzzersOrRead();
}

async function resolveBuzz() {
  if (!state || !buzzable() || !state.round || resolvingBuzz) return;
  resolvingBuzz = true;
  const round = state.round;
  try {
    const q = () => sb.from("lj_buzzes").select("name,id").eq("code", code).eq("round", round).order("id", { ascending: true }).limit(10);
    const { data } = await q();
    if (!data || !data.length) return;
    await new Promise((r) => setTimeout(r, 120)); // let near-simultaneous buzzes land; the DB orders them
    const { data: data2 } = await q();
    const winner = (data2 || data).find((b) => !state.lockedOut.includes(b.name) && b.name in state.players);
    if (winner && buzzable() && state.round === round) {
      stopReveal();
      state.phase = "buzzed";
      state.buzzer = winner.name;
      state.round = null;
      log(winner.name + " buzzed first");
      await save();
    }
  } finally {
    resolvingBuzz = false;
  }
}

function judge(correct) {
  stopAnswerTimerNow();
  const amount = state.wager != null ? state.wager : state.clue.value;
  const name = state.buzzer;
  if (correct) {
    state.players[name] += amount;
    log(name + " +" + amount);
    closeClue();
    return;
  }
  state.players[name] -= amount;
  log(name + " -" + amount);
  if (state.wager != null) { closeClue(); return; } // Daily Double: one shot
  if (!state.settings.rebuzz) state.lockedOut.push(name);
  state.buzzer = null;
  const eligible = Object.keys(state.players).filter((n) => !state.lockedOut.includes(n));
  if (eligible.length === 0) closeClue();
  else startReading(); // re-reveal from the first word for everyone else
}

function closeClueNoMark() {
  stopReveal(); stopAnswerTimerNow();
  state.phase = "board"; state.clue = null; state.round = null; state.buzzer = null; state.wager = null;
  save();
}

function closeClue() {
  stopReveal(); stopAnswerTimerNow();
  if (state.clue) state.used[state.clue.c + "-" + state.clue.v] = true;
  state.phase = "board"; state.clue = null; state.round = null; state.buzzer = null; state.lockedOut = []; state.wager = null;
  save();
}

function cancelBuzz() {
  stopAnswerTimerNow();
  state.buzzer = null;
  startReading();
}

function openDailyDouble(c, v) {
  state.clue = { c, v, value: values()[v] };
  state.lockedOut = [];
  state.phase = "dd"; state.round = null; state.buzzer = null; state.wager = null;
  save();
}

// ---------- Answer timer ----------
function startAnswerTimer() {
  stopAnswerTimerNow();
  const secs = state.settings.answerTimer;
  if (!secs) return;
  const bar = $("#timer");
  bar.classList.remove("hidden");
  bar.classList.add("red");
  const fill = bar.querySelector("i");
  stopAnswerTimer = countdown(secs, (left) => (fill.style.transform = "scaleX(" + left / secs + ")"), () => {
    stopAnswerTimer = null;
    if (state.phase === "buzzed") { toast("Time's up: marked wrong"); judge(false); }
  });
}
function stopAnswerTimerNow() {
  if (stopAnswerTimer) stopAnswerTimer();
  stopAnswerTimer = null;
  $("#timer").classList.add("hidden");
}

// ---------- Overlay ----------
function btn(label, fn, cls = "") {
  const b = document.createElement("button");
  b.textContent = label;
  if (cls) b.className = cls;
  b.onclick = fn;
  return b;
}

function renderOverlay() {
  const ov = $("#overlay");
  const body = $("#ovBody");
  const foot = $("#ovFoot");
  if (state.phase === "reading" && revealTimer) return; // animation running; leave the DOM alone
  body.className = "body";
  foot.innerHTML = "";

  if (state.phase === "final") return renderFinal();
  if (state.phase === "board" || !state.clue) { ov.classList.add("hidden"); stopAnswerTimerNow(); return; }
  ov.classList.remove("hidden");
  const { cat, item, value } = currentClue();
  $("#ovCat").textContent = cat.name;
  $("#ovVal").textContent = state.wager != null ? "Daily Double: $" + state.wager : "$" + value;

  if (state.phase === "reading") {
    startReveal(item.clue);
    foot.append(btn("Show all (space)", skipReveal), btn("Cancel", closeClueNoMark, "ghost"));
    if (cat.note) foot.append(note(cat.note));
    return;
  }

  if (state.phase === "open") {
    body.innerHTML = `<div>${escapeHtml(item.clue)}</div>`;
    if (item.clue.length > 160) body.classList.add("small");
    foot.append(btn("End question (space)", closeClue), btn("Reopen buzzers", openBuzzers, "ghost"));
    if (cat.note) foot.append(note(cat.note));
  }

  if (state.phase === "dd") {
    body.innerHTML = `<div class="buzzed"><div class="who">Daily Double</div><div class="sub">Pick the player and wager</div></div>`;
    const names = Object.keys(state.players);
    const sel = document.createElement("select");
    names.forEach((n) => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
    const inp = document.createElement("input");
    inp.type = "number"; inp.placeholder = "Wager"; inp.value = value; inp.style.width = "120px";
    foot.append(sel, inp,
      btn("Show clue", () => {
        if (!names.length) return toast("No players");
        state.wager = Math.max(0, Number(inp.value) || 0);
        state.buzzer = sel.value;
        state.phase = "buzzed";
        log("Daily Double: " + sel.value + " wagers " + state.wager);
        save();
      }),
      btn("Cancel", closeClueNoMark, "ghost"));
  }

  if (state.phase === "buzzed") {
    if (state.wager != null) {
      body.innerHTML = `<div>${escapeHtml(item.clue)}</div>`; // Daily Double: only one player answers, so the clue stays up
      if (item.clue.length > 160) body.classList.add("small");
    } else {
      body.innerHTML = `<div class="buzzed"><div class="who">${escapeHtml(state.buzzer)}</div><div class="sub">buzzed first</div></div>`;
    }
    foot.append(btn("Correct (↑)", () => judge(true), "good"), btn("Wrong (↓)", () => judge(false), "danger"));
    if (state.wager == null) foot.append(btn("Cancel buzz", cancelBuzz, "ghost"));
    if (!stopAnswerTimer) startAnswerTimer();
  }
}

function note(text) {
  const n = document.createElement("span");
  n.className = "answer";
  n.textContent = text;
  return n;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

document.addEventListener("keydown", (e) => {
  if (!state || $("#game").classList.contains("hidden")) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (state.phase === "reading") skipReveal();
    else if (state.phase === "open") closeClue();
  }
  if (state.phase === "buzzed") {
    if (e.code === "ArrowUp") { e.preventDefault(); judge(true); }
    if (e.code === "ArrowDown") { e.preventDefault(); judge(false); }
  }
  if (e.code === "Escape" && !$("#settingsModal").classList.contains("hidden")) { $("#settingsModal").classList.add("hidden"); return; }
  if (e.code === "Escape") {
    if (state.phase === "reading" || state.phase === "dd") closeClueNoMark();
    else if (state.phase === "open" || state.phase === "buzzed") closeClue();
  }
});

// ---------- Boards and Final ----------
function nextBoard() {
  if (state.boardIdx >= game.boards.length - 1) return;
  if (!confirm("Move to " + game.boards[state.boardIdx + 1].name + "? Values double. Scores carry over.")) return;
  stopReveal(); stopAnswerTimerNow();
  state.boardIdx++;
  state.used = {};
  state.phase = "board"; state.clue = null; state.round = null; state.buzzer = null; state.lockedOut = []; state.wager = null;
  log("Now on " + board().name);
  save();
}

function startFinal() {
  if (!confirm("Start Final Jeopardy? This hides the board.")) return;
  stopReveal(); stopAnswerTimerNow();
  const wagers = {};
  Object.keys(state.players).forEach((n) => (wagers[n] = 0));
  state.phase = "final"; state.clue = null; state.round = null; state.buzzer = null; state.lockedOut = [];
  state.final = { stage: "category", wagers, results: {} };
  save();
}

function renderFinal() {
  const ov = $("#overlay");
  ov.classList.remove("hidden");
  const fin = game.final;
  const f = state.final;
  const body = $("#ovBody");
  const foot = $("#ovFoot");
  $("#ovCat").textContent = "Final Jeopardy";
  $("#ovVal").textContent = fin.category;

  if (f.stage === "category") {
    body.innerHTML = `<div><div style="font-size:0.6em;color:var(--gold)">Category</div>${escapeHtml(fin.category)}</div>`;
    const grid = document.createElement("div");
    grid.className = "finalgrid";
    Object.keys(state.players).forEach((n) => {
      const row = document.createElement("div");
      row.className = "finalrow";
      row.innerHTML = `<span>${escapeHtml(n)} <small style="color:var(--muted)">(${fmtScore(state.players[n])})</small></span>`;
      const inp = document.createElement("input");
      inp.type = "number"; inp.placeholder = "wager"; inp.value = f.wagers[n] || 0;
      inp.oninput = () => (f.wagers[n] = Math.max(0, Number(inp.value) || 0));
      row.appendChild(inp);
      grid.appendChild(row);
    });
    foot.appendChild(grid);
    foot.append(btn("Lock wagers and reveal clue", () => { f.stage = "clue"; save(); }));
    foot.append(btn("Cancel", () => { state.phase = "board"; state.final = null; save(); }, "ghost"));
  }

  if (f.stage === "clue") {
    body.innerHTML = `<div>${escapeHtml(fin.clue)}</div>`;
    if (fin.clue.length > 160) body.classList.add("small");
    const grid = document.createElement("div");
    grid.className = "finalgrid";
    Object.keys(state.players).forEach((n) => {
      const row = document.createElement("div");
      row.className = "finalrow";
      const res = f.results[n];
      row.innerHTML = `<span>${escapeHtml(n)} <small style="color:var(--muted)">wager $${f.wagers[n] || 0}</small></span><span>${res === true ? "✔" : res === false ? "✘" : ""}</span>`;
      row.append(
        btn("Correct", () => { if (f.results[n] !== undefined) return; f.results[n] = true; state.players[n] += f.wagers[n] || 0; save(); }, "good"),
        btn("Wrong", () => { if (f.results[n] !== undefined) return; f.results[n] = false; state.players[n] -= f.wagers[n] || 0; save(); }, "danger")
      );
      grid.appendChild(row);
    });
    foot.appendChild(grid);
    foot.append(btn("Show final scores", () => { f.stage = "done"; save(); }));
  }

  if (f.stage === "done") {
    const names = Object.keys(state.players).sort((a, b) => state.players[b] - state.players[a]);
    body.innerHTML = `<div style="display:grid;gap:10px"><div style="font-size:0.6em;color:var(--gold)">Final scores</div>
      ${names.map((n, i) => `<div>${i === 0 ? "🏆 " : ""}${escapeHtml(n)} <span style="color:var(--gold)">${fmtScore(state.players[n])}</span></div>`).join("")}</div>`;
    foot.append(btn("Back to board", () => { state.phase = "board"; state.final = null; save(); }, "ghost"));
  }
}
