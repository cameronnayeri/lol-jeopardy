import { sb, $, normCode, normName, fmtScore, fetchGame, watchGame, toast } from "./common.js";

let code = "";
let me = "";
let state = null;
let buzzedRound = null;   // round id we already buzzed in
let presses = [];         // timestamps of recent presses, for spam lockout
let lockedUntil = 0;
let lockTick = null;

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
    if (!s) { $("#joinMsg").textContent = "No game with that code yet. Ask the host."; return; }
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
  setInterval(async () => { try { applyState(await fetchGame(code)); } catch (_) {} }, 700);
  sb.channel("ping-" + code + "-" + me).subscribe((st) => { $("#conn").textContent = st === "SUBSCRIBED" ? "live" : st.toLowerCase(); });
  document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible") applyState(await fetchGame(code)); });

  $("#buzz").onclick = press;
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) { e.preventDefault(); press(); }
  });

  render();
}

const settings = () => (state && state.settings) || {};
const canBuzzNow = () => state && !!state.round && (state.phase === "open" || state.phase === "reading");

// Every press counts toward the spam lockout, whether or not buzzers are open.
function press() {
  const now = Date.now();
  if (now < lockedUntil) return;
  const s = settings();
  if (s.spamPresses > 0) {
    presses.push(now);
    presses = presses.filter((t) => now - t <= (s.spamWindow || 2) * 1000);
    if (presses.length >= s.spamPresses) {
      presses = [];
      lockedUntil = now + (s.spamLockout || 5) * 1000;
      startLockTick();
      render();
      return;
    }
  }
  buzz();
}

async function buzz() {
  if (!canBuzzNow()) return;
  if ((state.lockedOut || []).includes(me)) return;
  if (buzzedRound === state.round) return;

  buzzedRound = state.round;
  const b = $("#buzz");
  b.classList.remove("open");
  b.classList.add("off");
  b.textContent = "Buzzed";
  const { error } = await sb.from("lj_buzzes").insert({ code, round: state.round, name: me });
  if (error) { buzzedRound = null; toast("Buzz failed, try again"); render(); }
}

function startLockTick() {
  clearInterval(lockTick);
  lockTick = setInterval(() => {
    if (Date.now() >= lockedUntil) { clearInterval(lockTick); lockTick = null; }
    render();
  }, 200);
}

function render() {
  if (!state) return;
  const b = $("#buzz");
  const st = $("#statusline");
  const hint = $("#hint");
  const locked = (state.lockedOut || []).includes(me);
  const spamLeft = Math.max(0, (lockedUntil - Date.now()) / 1000);
  // Never use the disabled attribute: a disabled button swallows clicks, and spam presses must count.
  b.classList.remove("open", "won", "early");
  b.classList.add("off");
  b.textContent = "Buzz";
  st.className = "statusline dim";
  hint.textContent = "Space or click to buzz";

  const showOpen = () => {
    if (locked) { st.textContent = "You're out of this one"; return; }
    if (buzzedRound === state.round) { st.textContent = "Buzzed..."; st.className = "statusline"; b.textContent = "Buzzed"; return; }
    st.textContent = state.phase === "reading" ? "Reading... buzz any time" : "Buzzers open!";
    st.className = "statusline";
    b.classList.remove("off");
    b.classList.add("open");
  };

  switch (state.phase) {
    case "board":
      st.textContent = state.boardIdx === 1 ? "Double board: host is picking" : "Host is picking a clue";
      break;
    case "reading":
      if (state.round) showOpen();
      else { st.textContent = locked ? "You're out of this one" : "Reading the clue..."; st.className = "statusline"; hint.textContent = "Buzzers open when the text finishes"; }
      break;
    case "open":
      showOpen();
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

  if (spamLeft > 0) {
    b.classList.add("off");
    b.classList.remove("open");
    b.classList.add("early");
    b.textContent = Math.ceil(spamLeft) + "s";
    hint.textContent = "Locked out for spamming the buzzer";
  }

  renderMini();
  renderScores();
}

function renderMini() {
  const el = $("#mini");
  el.innerHTML = "";
  const used = state.used || {};
  const cols = state.cols || 6;
  el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  for (let v = 0; v < 5; v++) for (let c = 0; c < cols; c++) {
    const d = document.createElement("div");
    d.className = "m" + (used[c + "-" + v] ? " used" : "");
    el.appendChild(d);
  }
}

function renderScores() {
  const el = $("#pscores");
  el.innerHTML = "";
  const players = state.players || {};
  Object.keys(players).sort((a, b) => players[b] - players[a]).forEach((n) => {
    const d = document.createElement("div");
    d.className = "pscore" + (n === me ? " me" : "");
    d.innerHTML = `${n} <b>${fmtScore(players[n])}</b>`;
    el.appendChild(d);
  });
}
