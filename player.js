import { sb, $, normCode, normName, fmtScore, fetchGame, watchGame, toast } from "./common.js";

let code = "";
let me = "";
let state = null;
let buzzedRound = null; // round id we already buzzed in

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

function applyState(s) {
  if (!s) return;
  state = s;
  render();
}

function enterPlay() {
  $("#join").classList.add("hidden");
  $("#play").classList.remove("hidden");
  $("#codeLabel").textContent = code;
  $("#me").textContent = me;

  watchGame(code, applyState);
  // Fallback poll in case realtime is slow or off.
  setInterval(async () => {
    try { applyState(await fetchGame(code)); } catch (_) {}
  }, 700);

  sb.channel("ping-" + code + "-" + me).subscribe((st) => {
    $("#conn").textContent = st === "SUBSCRIBED" ? "live" : st.toLowerCase();
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") applyState(await fetchGame(code));
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
  if (!state || state.phase !== "open" || !state.round) return;
  if (state.lockedOut && state.lockedOut.includes(me)) return;
  if (buzzedRound === state.round) return;

  buzzedRound = state.round;
  const b = $("#buzz");
  b.classList.remove("open");
  b.textContent = "Buzzed";
  b.disabled = true;
  const { error } = await sb.from("lj_buzzes").insert({ code, round: state.round, name: me });
  if (error) {
    buzzedRound = null;
    toast("Buzz failed, try again");
    render();
  }
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
  hint.textContent = "Space or click to buzz";

  switch (state.phase) {
    case "board":
      st.textContent = "Host is picking a clue";
      break;
    case "open":
      if (locked) {
        st.textContent = "You're out of this one";
      } else if (buzzedRound === state.round) {
        st.textContent = "Buzzed...";
        st.className = "statusline";
        b.textContent = "Buzzed";
      } else {
        st.textContent = "Buzzers open!";
        st.className = "statusline";
        b.disabled = false;
        b.classList.add("open");
      }
      break;
    case "dd":
      st.textContent = "Daily Double";
      st.className = "statusline";
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
