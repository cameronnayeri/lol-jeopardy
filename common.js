import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function normCode(s) {
  return (s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function normName(s) {
  return (s || "").trim().replace(/\s+/g, " ").slice(0, 20);
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function fmtScore(n) {
  const v = Number(n) || 0;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString();
}

export async function fetchGame(code) {
  const { data, error } = await sb.from("lj_games").select("state").eq("code", code).maybeSingle();
  if (error) throw error;
  return data ? data.state : null;
}

export async function saveGame(code, state) {
  const { error } = await sb
    .from("lj_games")
    .upsert({ code, state, updated_at: new Date().toISOString() }, { onConflict: "code" });
  if (error) throw error;
}

// Subscribe to state changes for one game. cb(state) fires on every update.
export function watchGame(code, cb) {
  return sb
    .channel("game-" + code)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "lj_games", filter: "code=eq." + code },
      (payload) => {
        if (payload.new && payload.new.state) cb(payload.new.state);
      }
    )
    .subscribe();
}

export function watchTable(table, code, event, cb) {
  return sb
    .channel(table + "-" + code + "-" + uid())
    .on("postgres_changes", { event, schema: "public", table, filter: "code=eq." + code }, (p) => cb(p.new))
    .subscribe();
}

export function toast(msg, ms = 1800) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), ms);
}

// Countdown helper: calls onTick(secondsLeft) every 100ms, onDone() at zero.
export function countdown(seconds, onTick, onDone) {
  const end = Date.now() + seconds * 1000;
  const h = setInterval(() => {
    const left = Math.max(0, (end - Date.now()) / 1000);
    onTick(left);
    if (left <= 0) {
      clearInterval(h);
      onDone && onDone();
    }
  }, 100);
  return () => clearInterval(h);
}
