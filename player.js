import { sb, $, normCode, normName, fmtScore, fetchGame, watchGame, toast } from "./common.js";
import { EARLY_LOCKOUT } from "./config.js";

let code = "";
let me = "";
let state = null;
let buzzedRound = null;   // round id we already buzzed in
let lockedUntil = 0;      // early-buzz penalty

$("#code").value = localStorage.getItem("playerCode") || "";
$("#name").value = localStorage.getItem("playerName") || "";

$("#joinBtn").onclick = join;
$("#name").addEventListener("keydown", (e) => e.key === "Enter" && join());

async function join() {
  code = normCode($("#code").value);
  me = normName($("#name").value);
  if (code.length < 3) return toast("Enter the room code");
  if (!me) return toast("Enter a name");
  $("#joinMsg").textContent = "Joining...";
  try {
    const s = await fetchGame(code);
    if (!s) {
      $("#joinMsg").textContent = "No game with that code yet. Ask the host.";
      return;
    }
    const { error } = await sb.from("lj_players").upsert({ code, name: me }, { onConflict: "code,name", ignoreDuplicates: true });
    if (error) throw error;
    localStorage.setItem("playerCode", code);
    localStorage.setItem("playerName", me);
    state = s;
    enterPlay();
  } catch (e) {
    console.error(e);
    $("#joinMsg").textContent = "Could not join: " + (e.message || e);
  }
}

function enterPlay() {
  $("#join").classList.add("hidden");
  $("#play").classList.remove("hidden");
  $("#codeLabel").textContent = code;
  $("#me").textContent = me;

  watchGame(code, (s) => {
    state = s;
    render();
  });
  sb.channel("ping-" + code + "-" + me).subscribe((st) => {
    $("#conn").textContent = st === "SUBSCRIBED" ? "live" : st.toLowerCase();
  });

  // Refresh state if the tab was asleep.
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      const s = await fetchGame(code);
      if (s) { state = s; render(); }
    }
  });

  $("#buzz").onclick = buzz;
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      buzz();
    }
  });

  render();
}

async function buzz() {
  if (!state) return;
  const now = Date.now();
  if (now < lockedUntil) return;

  if (state.phase !== "open") {
    // Too early: short lockout so mashing doesn't pay.
    if (state.phase === "clue") {
      lockedUntil = now + EARLY_LOCKOUT * 1000;
      flash("early", "Too early");
    }
    return;
  }
  if (state.lockedOut && state.lockedOut.includes(me)) return;
  if (buzzedRound === state.round) return;

  buzzedRound = state.round;
  flash("", "Buzzed");
  const { error } = await sb.from("lj_buzzes").insert({ code, round: state.round, name: me });
  if (error) {
    buzzedRound = null;
    toast("Buzz failed, try again");
  }
}

function flash(cls, text) {
  const b = $("#buzz");
  b.classList.remove("early", "won", "open");
  if (cls) b.classList.add(cls);
  b.textContent = text;
  setTimeout(render, EARLY_LOCKOUT * 1000);
}

function render() {
  if (!state) return;
  const b = $("#buzz");
  const st = $("#statusline");
  const hint = $("#hint");
  const locked = (state.lockedOut || []).includes(me);
  b.classList.remove("open", "won", "early");
  b.disabled = true;
  b.textContent = "Buzz";
  st.className = "statusline dim";
  hint.textContent = "Space or click when buzzers open";

  switch (state.phase) {
    case "board":
      st.textContent = "Host is picking a clue";
      break;
    case "clue":
      st.textContent = "Listen";
      st.className = "statusline";
      hint.textContent = "Buzzing early locks you out for a moment";
      break;
    case "open":
      if (locked) {
        st.textContent = "You're out of this one";
      } else if (buzzedRound === state.round) {
        st.textContent = "Buzzed...";
        st.className = "statusline";
      } else {
        st.textContent = "Buzzers open!";
        st.className = "statusline";
        b.disabled = false;
        b.classList.add("open");
      }
      break;
    case "buzzed":
      if (state.buzzer === me) {
        st.textContent = state.wager != null ? "Daily Double: answer!" : "You buzzed first! Answer!";
        st.className = "statusline";
        b.classList.add("won");
        b.textContent = "You";
      } else {
        st.textContent = state.buzzer + (state.wager != null ? " has a Daily Double" : " buzzed first");
      }
      break;
    case "reveal":
      st.textContent = "Clue over";
      break;
    case "final":
      st.textContent = "Final Jeopardy";
      st.className = "statusline";
      hint.textContent = "Watch the host's screen";
      break;
    default:
      st.textContent = "";
  }

  renderMini();
  renderScores();
}

function renderMini() {
  const el = $("#mini");
  el.innerHTML = "";
  const used = state.used || {};
  for (let v = 0; v < 5; v++) {
    for (let c = 0; c < 6; c++) {
      const d = document.createElement("div");
      d.className = "m" + (used[c + "-" + v] ? " used" : "");
      el.appendChild(d);
    }
  }
}

function renderScores() {
  const el = $("#pscores");
  el.innerHTML = "";
  const players = state.players || {};
  Object.keys(players)
    .sort((a, b) => players[b] - players[a])
    .forEach((n) => {
      const d = document.createElement("div");
      d.className = "pscore" + (n === me ? " me" : "");
      d.innerHTML = `${n} <b>${fmtScore(players[n])}</b>`;
      el.appendChild(d);
    });
}
