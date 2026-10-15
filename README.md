# LoL Jeopardy

A Jeopardy app for Discord game nights. No build step. The host screen-shares `host.html`; players open `index.html` on their desktops and buzz with the spacebar. Supabase holds the shared game state and decides buzz order.

## Files

| File | What it is |
|---|---|
| `index.html` + `player.js` | Player page: join with a room code, buzz button, live scores. Never loads any questions. |
| `host.html` + `host.js` | Host page: board, clue reveal, buzzing, scoring, Daily Doubles, two boards, Final Jeopardy, settings. |
| `questions.js` | Built-in games (the LoL boards and a Test Game). Only `host.html` imports it. |
| `sample-questions.json` | Template for a custom question file. |
| `common.js` | Supabase client and shared helpers. |
| `config.js` | Your Supabase URL and anon key. |
| `style.css` | Styling. |
| `schema.sql` | Database tables (all prefixed `lj_`), permissions and realtime. Run once. |
| `pdf/` | Host reference sheets with every clue and answer. Regenerate with `node tools/make-pdf.mjs [file.json]`. |

## Setup

1. **Supabase**: create a project, open SQL Editor, paste `schema.sql`, run it. Copy the Project URL and publishable/anon key into `config.js`.
2. **GitHub Pages**: push these files to the root of `main`, then Settings → Pages → Deploy from a branch → main / (root).
3. Players use `https://<you>.github.io/<repo>/`. You use `.../host.html`.

`questions.js` is public in the repo, so share the Pages URL, not the repo link.

## A game

A game is two boards of up to six categories, five clues each, plus one Final Jeopardy. Board 1 is worth 200 to 1000, board 2 is worth 400 to 2000. **Next board** in the side panel moves on; scores carry over.

The built-in LoL game loads by default. To use your own, pick a JSON file on the setup screen. The format is in `sample-questions.json`: `title`, `boards` (1 or 2), each with `categories` (1 to 6), each with `name`, optional `note` (shown under the clue on the host screen, so players see it too) and exactly 5 `clues` of `{ "clue", "answer" }`, plus `final` with `category`, `clue`, `answer`. The file is validated on load and any problem is reported with the board, category and clue number.

Custom questions are kept in the host's browser only, never in Supabase, because players share the database key and could read the answers. Resuming a game from a different computer asks you to pick the file again. Scores are in Supabase and survive that.

## Playing

1. Host opens `host.html`, picks a code and a question set, clicks **Create or resume game**, and screen-shares that window.
2. Players open the Pages URL, enter the code and a name, click **Join**.
3. Host clicks a dollar value. The clue reveals one word at a time on the streamed screen.
4. Buzzers are open during the reveal by default. A buzz freezes the text and swaps it for the player's name. Host judges with **↑** (correct) or **↓** (wrong). Wrong deducts, locks that player out, and the clue re-reveals from the first word for everyone else.
5. **Space** ends the question. There are no automatic timers unless you turn one on.

The host screen never shows an answer, so it is safe to stream. Keep the host sheets in `pdf/` on a second monitor.

### Settings (side panel, saved with the game)

| Setting | What it does |
|---|---|
| Text speed | Words per second for the reveal. |
| Buzz delay after last word | Extra pause before buzzers open, only when "No buzzing while reading" is on. Useful for stream lag. |
| No buzzing while reading | Buzzers stay closed until the last word appears. |
| Wrong player may buzz again | A wrong answer does not lock that player out of the clue. |
| Answer timer | Seconds a buzzer has to answer. When it runs out they're marked wrong. 0 turns it off. |
| Daily Doubles per board | Placed randomly (weighted to the lower rows) when the game is created. Changing it offers a re-roll. Clicking one goes to the wager screen instead of the reveal. Shift+click any cell to force one. |
| Spam lockout | If a player presses the buzzer N times within W seconds, they are locked out for L seconds. Presses while buzzers are closed count too. Set presses to 0 to turn off. |

### Host keys

| Key | Action |
|---|---|
| Space | During reveal: show all. On an open clue: end question. |
| ↑ / ↓ | Correct / wrong |
| Esc | Cancel (during reveal or Daily Double setup, does not use the cell) or end question |
| Shift+click a cell | Force a Daily Double |

**Reopen buzzers** throws out the current round, for a false start. **Cancel buzz** sends it back to the reveal with no penalty.

## How buzz order is decided

Each time buzzers open, the host generates a round id. A buzz is a row inserted into `lj_buzzes` with that id. The `id` column is a database sequence, so rows are numbered in the order the server received them. The host polls four times a second (and also listens on realtime), waits 120 ms after seeing the first buzz so simultaneous ones can land, then takes the lowest id. The winner is whoever reached Supabase first, regardless of whose event reached the host first.
