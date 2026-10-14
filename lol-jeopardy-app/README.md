# LoL Jeopardy

A static Jeopardy app for Discord game nights. No build step. Host screen-shares `host.html`; players open `index.html` on their desktops and buzz with the spacebar. Supabase holds the shared game state and decides buzz order.

## Files

| File | What it is |
|---|---|
| `index.html` + `player.js` | Player page: join with a room code, big buzz button, live scores. Never loads the clues. |
| `host.html` + `host.js` | Host page: the board, clue overlay, buzz handling, scoring, Daily Doubles, Final Jeopardy. |
| `questions.js` | Both boards. Only `host.html` imports it. |
| `common.js` | Supabase client and shared helpers. |
| `config.js` | Your Supabase URL and anon key, plus timer settings. |
| `style.css` | Styling. |
| `schema.sql` | Database tables, permissions and realtime. Run once. |

## Setup (about 10 minutes)

### 1. Supabase
1. Create a free project at supabase.com.
2. Open **SQL Editor**, paste the contents of `schema.sql`, run it.
3. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `config.js`.

The anon key is designed to live in client-side code. The schema gives it full read/write on the three game tables, which is fine for a party game but means anyone with your URL and key can mess with games. Don't reuse this project for anything else.

### 2. GitHub Pages
1. Make a new repo and push these files to the root of `main`.
2. **Settings → Pages → Source: Deploy from a branch → main / (root)**. Save.
3. Your site will be at `https://<you>.github.io/<repo>/`. Players use that URL; you use `.../host.html`.

Note: `questions.js` is a public file in the repo. Players who go looking for it will find the answers, so don't post the repo link in the server, only the Pages URL. If you want it airtight, keep the repo private and deploy Pages from a private repo (requires GitHub Pro) or host elsewhere.

### 3. Game night
1. Host opens `host.html`, picks a room code (like `LOL1`) and a board, clicks **Create or resume game**.
2. Host screen-shares that browser window in a Discord voice channel.
3. Players open the Pages URL, enter the code and their name, click **Join**. They show up in the host's side panel.
4. Host clicks a dollar value, reads the clue aloud, then hits **Space** to open buzzers.
5. First buzz lands: the shared screen swaps the clue for the player's name. Host judges with **↑** (correct) or **↓** (wrong). Wrong reopens buzzers for everyone else and locks that player out of the clue.
6. **Space** on the reveal screen goes back to the board.

Refreshing either page resumes where you were. Switching the host to the other board keeps everyone's scores.

## How buzz order is decided

Every "open buzzers" generates a round id. A player's buzz is a row inserted into `buzzes` with that round id. The `id` column is a database sequence, so rows are numbered in the order the server received them. When the host sees the first buzz event, it waits 150 ms and then asks the database for the lowest-id buzz in that round. That means the winner is whoever reached Supabase first, not whoever's event reached the host first.

Typical latency from tap to "your name on the host's screen" is 100 to 400 ms. Simultaneous taps within a few milliseconds are ordered by the database, which is as fair as any online buzzer gets.

## Rules built in

- Buzzing before the host opens buzzers locks that player out for 0.5 s (`EARLY_LOCKOUT`).
- Buzzers close after 5 s if nobody buzzes (`BUZZ_WINDOW`); the host can reveal the answer.
- The answer timer bar runs for 10 s after a buzz (`ANSWER_WINDOW`). It only warns the host; it doesn't auto-fail anyone.
- A wrong answer costs the clue value and reopens buzzers for the remaining players.
- **Daily Double**: on the clue screen, click Daily Double, pick the player and wager. One shot, no buzzers.
- **Final Jeopardy**: side panel button. Shows the category, you type each player's wager, then reveal the clue and mark each player right or wrong. Collect wagers and answers over voice.
- **+ / −** next to each score adjusts manually. **×** removes a player.

## Host keyboard shortcuts

| Key | Action |
|---|---|
| Space | Open buzzers / back to board |
| ↑ | Correct |
| ↓ | Wrong |
| Esc | Skip clue |

## Editing the questions

`questions.js` is plain data: two boards, six categories each, five clues each, plus a `final`. Edit the text, push, done.
