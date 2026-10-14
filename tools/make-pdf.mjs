// Generates host reference PDFs (one per board) from questions.js.
// Run: node tools/make-pdf.mjs   (needs playwright; Chromium is preinstalled here)
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { BOARDS, VALUES } from "../questions.js";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function html(board, idx) {
  const cats = board.categories
    .map(
      (cat) => `
    <section>
      <h2>${esc(cat.name)}${cat.note ? `<span class="note">${esc(cat.note)}</span>` : ""}</h2>
      <table>
        ${cat.clues
          .map(
            (q, i) => `<tr>
          <td class="val">$${VALUES[i]}</td>
          <td class="clue">${esc(q.clue)}</td>
          <td class="ans">${esc(q.answer)}</td>
        </tr>`
          )
          .join("")}
      </table>
    </section>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>LoL Jeopardy ${esc(board.name)} host sheet</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; color: #111; font-size: 10.5pt; margin: 0; }
    h1 { font-size: 20pt; margin: 0 0 2px; letter-spacing: 0.02em; }
    .sub { color: #666; font-size: 9pt; margin-bottom: 12px; }
    section { break-inside: avoid; margin-bottom: 12px; }
    h2 { font-size: 12.5pt; margin: 0 0 4px; padding: 4px 8px; background: #060ce9; color: #ffcc00; text-transform: uppercase; letter-spacing: 0.04em; border-radius: 3px; }
    h2 .note { float: right; font-weight: normal; text-transform: none; letter-spacing: 0; font-size: 9pt; color: #fff; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #ddd; }
    td.val { width: 48px; font-weight: bold; color: #060ce9; white-space: nowrap; }
    td.clue { width: 62%; }
    td.ans { font-weight: bold; }
    .final { break-inside: avoid; margin-top: 10px; padding: 8px 10px; border: 2px solid #060ce9; border-radius: 4px; }
    .final h2 { background: #ffcc00; color: #060ce9; }
    .final p { margin: 3px 0; }
    .keys { margin-top: 10px; color: #555; font-size: 9pt; }
  </style></head><body>
  <h1>LoL Jeopardy: ${esc(board.name)}</h1>
  <div class="sub">Host reference. Players answer in question form. Clue values 200 to 1000 top to bottom.</div>
  ${cats}
  <div class="final">
    <h2>Final Jeopardy: ${esc(board.final.category)}</h2>
    <p><b>Clue:</b> ${esc(board.final.clue)}</p>
    <p><b>Answer:</b> ${esc(board.final.answer)}</p>
  </div>
  <div class="keys">Host keys: click cell = clue + buzzers open · shift+click = Daily Double · ↑ correct · ↓ wrong · space = end question · esc = end question</div>
  </body></html>`;
}

mkdirSync(new URL("../pdf/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium", args: ["--headless=new"] });
const page = await browser.newPage();
for (const [i, board] of BOARDS.entries()) {
  const out = new URL(`../pdf/board-${i + 1}-host-sheet.pdf`, import.meta.url).pathname;
  await page.setContent(html(board, i), { waitUntil: "load" });
  await page.pdf({ path: out, format: "Letter", printBackground: true, margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" } });
  console.log("wrote", out);
}
await browser.close();
