// Generates host reference PDFs (one per board, plus Final) for a game.
//   node tools/make-pdf.mjs                   -> built-in games from questions.js
//   node tools/make-pdf.mjs my-questions.json -> a custom game file
// Needs playwright (npm i playwright). Set CHROME_PATH if Chromium isn't at the default location.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { GAMES, BASE_VALUES } from "../questions.js";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function boardHtml(game, bi) {
  const board = game.boards[bi];
  const vals = BASE_VALUES.map((v) => v * (bi + 1));
  const cats = board.categories.map((cat) => `
    <section>
      <h2>${esc(cat.name)}${cat.note ? `<span class="note">${esc(cat.note)}</span>` : ""}</h2>
      <table>${cat.clues.map((q, i) => `<tr><td class="val">$${vals[i]}</td><td class="clue">${esc(q.clue)}</td><td class="ans">${esc(q.answer)}</td></tr>`).join("")}</table>
    </section>`).join("");
  const last = bi === game.boards.length - 1;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(game.title)}: ${esc(board.name)}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; color: #111; font-size: 10.5pt; margin: 0; }
    h1 { font-size: 20pt; margin: 0 0 2px; }
    .sub { color: #666; font-size: 9pt; margin-bottom: 12px; }
    section { break-inside: avoid; margin-bottom: 12px; }
    h2 { font-size: 12.5pt; margin: 0 0 4px; padding: 4px 8px; background: #060ce9; color: #ffcc00; text-transform: uppercase; letter-spacing: 0.04em; border-radius: 3px; }
    h2 .note { float: right; font-weight: normal; text-transform: none; letter-spacing: 0; font-size: 9pt; color: #fff; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #ddd; }
    td.val { width: 52px; font-weight: bold; color: #060ce9; white-space: nowrap; }
    td.clue { width: 62%; }
    td.ans { font-weight: bold; }
    .final { break-inside: avoid; margin-top: 10px; padding: 8px 10px; border: 2px solid #060ce9; border-radius: 4px; }
    .final h2 { background: #ffcc00; color: #060ce9; }
    .final p { margin: 3px 0; }
    .keys { margin-top: 10px; color: #555; font-size: 9pt; }
  </style></head><body>
  <h1>${esc(game.title)}: ${esc(board.name)}${bi === 1 ? " (values doubled)" : ""}</h1>
  <div class="sub">Host reference. Players answer in question form.</div>
  ${cats}
  ${last ? `<div class="final"><h2>Final Jeopardy: ${esc(game.final.category)}</h2><p><b>Clue:</b> ${esc(game.final.clue)}</p><p><b>Answer:</b> ${esc(game.final.answer)}</p></div>` : ""}
  <div class="keys">Host keys: click cell = clue · shift+click = Daily Double · space = show all / end question · ↑ correct · ↓ wrong · esc = cancel</div>
  </body></html>`;
}

const games = process.argv[2] ? [JSON.parse(readFileSync(process.argv[2], "utf8"))] : GAMES;
mkdirSync(new URL("../pdf/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium", args: ["--headless=new"] });
const page = await browser.newPage();
for (const game of games) {
  for (const [bi] of game.boards.entries()) {
    const out = new URL(`../pdf/${slug(game.title)}-board-${bi + 1}.pdf`, import.meta.url).pathname;
    await page.setContent(boardHtml(game, bi), { waitUntil: "load" });
    await page.pdf({ path: out, format: "Letter", printBackground: true, margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" } });
    console.log("wrote", out);
  }
}
await browser.close();
