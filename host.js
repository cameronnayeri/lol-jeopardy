import { sb, $, normCode, uid, fmtScore, fetchGame, saveGame, watchTable, toast, countdown } from "./common.js";
import { BUZZ_WINDOW, ANSWER_WINDOW } from "./config.js";
import { BOARDS, VALUES } from "./questions.js";

let code = "";
let state = null;
let stopTimer = null;
let resolvingBuzz = false;
let channels = [];

// ---------- Setup ----------
const boardSel = $("#boardSel");
BOARDS.forEach((b, i) => {
  const o = document.createElement("option");
  o.value = i;
  o.textContent = b.name;
  boardSel.appendChild(o);
});
$("#code").value = localStorage.getItem("hostCode") || "";

$("#startBtn").onclick = async () => {
  code = normCode($("#code").value);
  if (code.length < 3) return toast("Code needs at least 3 letters or numbers");
  const boardIdx = Number(boardSel.value);
  $("#setupMsg").textContent = "Loading...";
  try {
    const existing = await fetchGame(code);
    if (existing && existing.board === boardIdx && existing.phase) {
      state = existing;
      log("Resumed game " + code);
    } else {
      state = freshState(boardIdx);
      if (existing && existing.players) state.players = existing.players; // keep scores if switching boards
      await saveGame(code, state);
      log("Created game " + code);
    }
    await loadPlayers();
    localStorage.setItem("hostCode", code);
    enterGame();
  } catch (e) {
    console.error(e);
    $("#setupMsg").textContent = "Could not reach Supabase. Check config.js and that schema.sql was run. (" + (e.message || e) + ")";
  }
};

function freshState(boardIdx) {
  return {
    board: boardIdx,
    players: {},
    used: {},
    phase: "board",
    clue: null,
    round: null,
    buzzer: null,
    lockedOut: [],
    wager: null,
    final: null,
    v: 1
  };
}

async function loadPlayers() {
  const { data } = await sb.from("players").select("name").eq("code", code);
  (data || []).forEach((p) => {
    if (!(p.name in state.players)) state.players[p.name] = 0;
  });
}

// ---------- Enter game ----------
function enterGame() {
  $("#setup").classList.add("hidden");
  $("#game").classList.remove("hidden");
  $("#codeLabel").textContent = code;
  $("#boardLabel").textContent = BOARDS[state.board].name;

  channels.push(
    watchTable("players", code, "INSERT", (row) => {
      if (!(row.name in state.players)) {
        state.players[row.name] = 0;
        log(row.name + " joined");
        // Save without re-rendering the overlay so a join doesn't wipe Daily Double / Final inputs mid-typing.
        saveGame(code, state).catch((e) => toast("Save failed: " + (e.message || e)));
        renderScores();
      }
    })
  );
  channels.push(watchTable("buzzes", code, "INSERT", onBuzzInsert));

  sb.channel("ping-" + code).subscribe((s) => {
    $("#conn").textContent = s === "SUBSCRIBED" ? "live" : s.toLowerCase();
  });

  $("#finalBtn").onclick = startFinal;
  $("#resetBtn").onclick = async () => {
    if (!confirm("Reset the board? Scores are kept.")) return;
    const players = state.players;
    state = freshState(state.board);
    state.players = players;
    await save();
  };

  render();
  save();
}

async function save() {
  try {
    await saveGame(code, state);
  } catch (e) {
    console.error(e);
    toast("Save failed: " + (e.message || e));
  }
  render();
}

function log(msg) {
  const el = $("#log");
  const line = document.createElement("div");
  line.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + "  " + msg;
  el.prepend(line);
  while (el.children.length > 30) el.lastChild.remove();
}

// ---------- Board ----------
function render() {
  renderBoard();
  renderScores();
  renderOverlay();
}

function renderBoard() {
  const board = BOARDS[state.board];
  const el = $("#board");
  el.innerHTML = "";
  board.categories.forEach((cat) => {
    const c = document.createElement("div");
    c.className = "cell cat";
    c.textContent = cat.name;
    el.appendChild(c);
  });
  VALUES.forEach((val, v) => {
    board.categories.forEach((cat, c) => {
      const key = c + "-" + v;
      const cell = document.createElement("div");
      cell.className = "cell value" + (state.used[key] ? " used" : "");
      cell.textContent = "$" + val;
      if (!state.used[key]) cell.onclick = () => openClue(c, v);
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
        const amt = Number(prompt("Amount for " + name + ":", state.clue ? state.clue.value : 200));
        if (!amt) return;
        state.players[name] += amt * Number(b.dataset.d);
        save();
      };
    });
    row.querySelector("button[data-x]").onclick = async () => {
      if (!confirm("Remove " + name + "?")) return;
      delete state.players[name];
      await sb.from("players").delete().eq("code", code).eq("name", name);
      save();
    };
    el.appendChild(row);
  });
}

// ---------- Clue flow ----------
function currentClue() {
  const { c, v } = state.clue;
  const cat = BOARDS[state.board].categories[c];
  return { cat, item: cat.clues[v], value: VALUES[v] };
}

function openClue(c, v) {
  state.clue = { c, v, value: VALUES[v] };
  state.phase = "clue";
  state.round = null;
  state.buzzer = null;
  state.lockedOut = [];
  state.wager = null;
  save();
}

function openBuzzers() {
  state.phase = "open";
  state.round = uid();
  state.buzzer = null;
  state.openedAt = Date.now();
  save();
  startTimer(BUZZ_WINDOW, false, () => {
    if (state.phase === "open") {
      state.phase = "reveal";
      state.round = null;
      log("Nobody buzzed");
      save();
    }
  });
}

async function onBuzzInsert(row) {
  if (!state || state.phase !== "open" || row.round !== state.round) return;
  if (state.lockedOut.includes(row.name)) return;
  if (resolvingBuzz) return;
  resolvingBuzz = true;
  // Short grace window so near-simultaneous buzzes are ordered by the database, not by whose event reached us first.
  setTimeout(async () => {
    try {
      const { data } = await sb
        .from("buzzes")
        .select("name,id")
        .eq("code", code)
        .eq("round", state.round)
        .order("id", { ascending: true })
        .limit(10);
      const winner = (data || []).find((b) => !state.lockedOut.includes(b.name) && b.name in state.players);
      if (winner && state.phase === "open") {
        state.phase = "buzzed";
        state.buzzer = winner.name;
        state.buzzedAt = Date.now();
        log(winner.name + " buzzed first");
        await save();
        startTimer(ANSWER_WINDOW, true, () => toast("Answer time is up"));
      }
    } finally {
      resolvingBuzz = false;
    }
  }, 150);
}

function judge(correct) {
  const amount = state.wager != null ? state.wager : state.clue.value;
  const name = state.buzzer;
  if (correct) {
    state.players[name] += amount;
    log(name + " +" + amount);
    closeClue();
  } else {
    state.players[name] -= amount;
    log(name + " -" + amount);
    if (state.wager != null) {
      // Daily Double: only one shot.
      state.phase = "reveal";
      state.buzzer = null;
      save();
      return;
    }
    state.lockedOut.push(name);
    state.buzzer = null;
    const eligible = Object.keys(state.players).filter((n) => !state.lockedOut.includes(n));
    if (eligible.length === 0) {
      state.phase = "reveal";
      state.round = null;
      save();
    } else {
      openBuzzers();
    }
  }
}

function closeClue() {
  stopTimerNow();
  if (state.clue) state.used[state.clue.c + "-" + state.clue.v] = true;
  state.phase = "board";
  state.clue = null;
  state.round = null;
  state.buzzer = null;
  state.lockedOut = [];
  state.wager = null;
  save();
}

function cancelBuzz() {
  // Back to the clue with buzzers closed; no penalty.
  stopTimerNow();
  state.phase = "clue";
  state.round = null;
  state.buzzer = null;
  save();
}

function startDailyDouble() {
  const names = Object.keys(state.players);
  if (!names.length) return toast("No players");
  const foot = $("#ovFoot");
  foot.innerHTML = "";
  const sel = document.createElement("select");
  names.forEach((n) => {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  });
  const inp = document.createElement("input");
  inp.type = "number";
  inp.placeholder = "Wager";
  inp.value = state.clue.value;
  inp.style.width = "120px";
  const go = document.createElement("button");
  go.textContent = "Lock in";
  go.onclick = () => {
    const w = Math.max(0, Number(inp.value) || 0);
    state.wager = w;
    state.buzzer = sel.value;
    state.phase = "buzzed";
    state.round = null;
    log("Daily Double: " + sel.value + " wagers " + w);
    save();
    startTimer(ANSWER_WINDOW, true, () => toast("Answer time is up"));
  };
  const back = btn("Back", () => render(), "ghost");
  foot.append(sel, inp, go, back);
}

// ---------- Timer ----------
function startTimer(seconds, red, onDone) {
  stopTimerNow();
  const bar = $("#timer");
  bar.classList.remove("hidden");
  bar.classList.toggle("red", !!red);
  const fill = bar.querySelector("i");
  stopTimer = countdown(
    seconds,
    (left) => (fill.style.transform = "scaleX(" + left / seconds + ")"),
    () => {
      stopTimer = null;
      onDone && onDone();
    }
  );
}
function stopTimerNow() {
  if (stopTimer) stopTimer();
  stopTimer = null;
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
  body.className = "body";
  foot.innerHTML = "";

  if (state.phase === "final") return renderFinal();
  if (state.phase === "board" || !state.clue) {
    ov.classList.add("hidden");
    stopTimerNow();
    return;
  }
  ov.classList.remove("hidden");
  const { cat, item, value } = currentClue();
  $("#ovCat").textContent = cat.name;
  $("#ovVal").textContent = state.wager != null ? "Daily Double: $" + state.wager : "$" + value;

  if (state.phase === "clue") {
    body.innerHTML = `<div>${escapeHtml(item.clue)}</div>`;
    if (item.clue.length > 160) body.classList.add("small");
    foot.append(
      btn("Open buzzers (space)", openBuzzers),
      btn("Daily Double", startDailyDouble, "ghost"),
      btn("Skip", closeClue, "ghost")
    );
    const ans = document.createElement("span");
    ans.className = "answer";
    ans.textContent = "Answer: " + item.answer + (cat.note ? "  ·  " + cat.note : "");
    foot.append(ans);
  }

  if (state.phase === "open") {
    body.innerHTML = `<div>${escapeHtml(item.clue)}</div>`;
    if (item.clue.length > 160) body.classList.add("small");
    foot.append(btn("Nobody buzzed: reveal", () => { stopTimerNow(); state.phase = "reveal"; state.round = null; save(); }, "ghost"));
    const ans = document.createElement("span");
    ans.className = "answer";
    ans.textContent = "Answer: " + item.answer;
    foot.append(ans);
  }

  if (state.phase === "buzzed") {
    // Clue is hidden from the shared screen; host keeps a greyed copy to judge the answer.
    body.innerHTML = `<div class="buzzed">
        <div class="who">${escapeHtml(state.buzzer)}</div>
        <div class="sub">${state.wager != null ? "Daily Double" : "buzzed first"}</div>
        <div class="hostpeek"><b>Clue:</b> ${escapeHtml(item.clue)}<br/><b>Answer:</b> ${escapeHtml(item.answer)}</div>
      </div>`;
    foot.append(
      btn("Correct (↑)", () => judge(true), "good"),
      btn("Wrong (↓)", () => judge(false), "danger"),
      btn("Cancel", cancelBuzz, "ghost")
    );
  }

  if (state.phase === "reveal") {
    body.innerHTML = `<div class="answer reveal">${escapeHtml(item.answer)}</div>`;
    foot.append(btn("Back to board (space)", closeClue));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// Keyboard shortcuts for the host.
document.addEventListener("keydown", (e) => {
  if (!state || $("#game").classList.contains("hidden")) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.code === "Space") {
    e.preventDefault();
    if (state.phase === "clue") openBuzzers();
    else if (state.phase === "reveal") closeClue();
  }
  if (state.phase === "buzzed") {
    if (e.code === "ArrowUp") { e.preventDefault(); judge(true); }
    if (e.code === "ArrowDown") { e.preventDefault(); judge(false); }
  }
  if (e.code === "Escape" && (state.phase === "clue" || state.phase === "open")) { stopTimerNow(); closeClue(); }
});

// ---------- Final Jeopardy ----------
function startFinal() {
  if (!confirm("Start Final Jeopardy? This hides the board.")) return;
  stopTimerNow();
  const wagers = {};
  Object.keys(state.players).forEach((n) => (wagers[n] = 0));
  state.phase = "final";
  state.clue = null;
  state.round = null;
  state.buzzer = null;
  state.lockedOut = [];
  state.final = { stage: "category", wagers, results: {} };
  save();
}

function renderFinal() {
  const ov = $("#overlay");
  ov.classList.remove("hidden");
  const fin = BOARDS[state.board].final;
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
      inp.type = "number";
      inp.placeholder = "wager";
      inp.value = f.wagers[n] || 0;
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
      row.innerHTML = `<span>${escapeHtml(n)} <small style="color:var(--muted)">wager $${f.wagers[n] || 0}</small></span><span>${res === true ? "✔ correct" : res === false ? "✘ wrong" : ""}</span>`;
      row.append(
        btn("Correct", () => { if (f.results[n] !== undefined) return; f.results[n] = true; state.players[n] += f.wagers[n] || 0; save(); }, "good"),
        btn("Wrong", () => { if (f.results[n] !== undefined) return; f.results[n] = false; state.players[n] -= f.wagers[n] || 0; save(); }, "danger")
      );
      grid.appendChild(row);
    });
    foot.appendChild(grid);
    const ans = document.createElement("span");
    ans.className = "answer";
    ans.textContent = "Answer: " + fin.answer;
    foot.append(ans);
    foot.append(btn("Show final scores", () => { f.stage = "done"; save(); }));
  }

  if (f.stage === "done") {
    const names = Object.keys(state.players).sort((a, b) => state.players[b] - state.players[a]);
    body.innerHTML = `<div style="display:grid;gap:10px">
      <div style="font-size:0.6em;color:var(--gold)">Final scores</div>
      ${names.map((n, i) => `<div>${i === 0 ? "🏆 " : ""}${escapeHtml(n)} <span style="color:var(--gold)">${fmtScore(state.players[n])}</span></div>`).join("")}
    </div>`;
    foot.append(btn("Back to board", () => { state.phase = "board"; state.final = null; save(); }, "ghost"));
  }
}
