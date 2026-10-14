// Two boards. Only host.html loads this file. Players never fetch it.
// Each category: { name, clues: [ {clue, answer}, ... ] } ordered 200 -> 1000.
// Final Jeopardy per board under "final".

export const VALUES = [200, 400, 600, 800, 1000];

export const BOARDS = [
  {
    name: "Board 1",
    categories: [
      {
        name: "Jungle Lore",
        clues: [
          { clue: "This camp's resident toad carries the full title \"Lord Grompulus Kevin Ribbiton of Croaksworth.\"", answer: "Gromp" },
          { clue: "\"Nashor\" is an anagram of this DotA boss.", answer: "Roshan" },
          { clue: "The Rift Scuttler's dash reuses the Shadow Dash VFX of this champion, a likely nod to his \"river\" meme.", answer: "Shen" },
          { clue: "Hextech and Chemtech drakes arrived in 11.23 to replace this short-lived dragon from the 2021 Sentinels of Light event.", answer: "The Ruined Dragon" },
          { clue: "Part of Elder Dragon's roar was recorded by dragging a violin bow across chicken wire and this household object.", answer: "A trash can" }
        ]
      },
      {
        name: "Regions of Runeterra",
        clues: [
          { clue: "Noxus's Trifarix: Swain holds Vision, Darius holds Might, and the seat of Guile belongs to this anonymous member.", answer: "The Faceless" },
          { clue: "Ixtal sealed its borders at the urging of this founding member of the Yun Tal.", answer: "Skarner" },
          { clue: "Of the Three Sisters, Avarosa was deafened and Serylda lost her voice; Lissandra was blinded by this demigod.", answer: "Volibear" },
          { clue: "In Camavor, heirs must bind their souls to this named sword to be crowned.", answer: "Sanctity (the Blade of the Ruined King)" },
          { clue: "This last Mage King of Icathia fell to the Shuriman Sun Empress, beginning a thousand years of vassalage.", answer: "Axamuk" }
        ]
      },
      {
        name: "Real Skin or Fake Skin",
        note: "Answer is Real or Fake. Naming the real skin breaks ties.",
        clues: [
          { clue: "\"I, not a robot.\"", answer: "Real (Definitely Not Blitzcrank)" },
          { clue: "\"Crikey, what a ripper.\"", answer: "Real (Outback Renekton)" },
          { clue: "\"Not every yordle grows up dreaming of the circus. Just the ones with the tightrope.\"", answer: "Fake" },
          { clue: "\"The dentists of Piltover have a saying: never turn your back on a patient with a tail.\"", answer: "Fake" },
          { clue: "\"Consistently in a near-comatose state from peering across the space-time continuum, Zilean's more recent hobbies include being terrible at hacky-sack, paying way too much for a ticket for awful music festivals, and ordering too many pizzas. He also owns New Age bookstore, which is closed most days.\"", answer: "Real (Groovy Zilean)" }
        ]
      },
      {
        name: "Bad Translations",
        clues: [
          { clue: "In German, Sona is \"Die Virtuosin\" and this champion is her masculine counterpart, \"Der Virtuose.\"", answer: "Jhin" },
          { clue: "Brazil renamed Toxic Dr. Mundo's skin to this, a nod to a certain green Marvel hero.", answer: "Dr. Mulko" },
          { clue: "Brazil changed Gnar's title from \"The Missing Link\" to \"The Prehistoric Yordle\" to stop jokes about this.", answer: "Elo (the rating)" },
          { clue: "A Russian naming error originally shipped this champion's Soulhunter skin as \"Showerhunter.\"", answer: "Kayn" },
          { clue: "In Chinese, all four of this champion's abilities are named after Hong Kong triad and Bruce Lee film titles, like \"Ferocious Dragon Crossing the River.\"", answer: "Graves" }
        ]
      },
      {
        name: "Reworked",
        clues: [
          { clue: "His old ultimate, Children of the Grave, enslaved a dead champion's ghost for 30 seconds.", answer: "Mordekaiser" },
          { clue: "Idol of Durand: a 2-second channel that turned this champion into a taunting statue.", answer: "Galio" },
          { clue: "\"Agony's Embrace\" was the name of her old ultimate before it became her title.", answer: "Evelynn" },
          { clue: "His old W was meant to be called \"Nevermore,\" but Phreak's pun \"Nevermove\" stuck.", answer: "Swain" },
          { clue: "In Alpha this champion was a girl named Yuralia; the shipped version is named after Guinsoo's dog.", answer: "Nunu" }
        ]
      },
      {
        name: "Dead Items",
        clues: [
          { clue: "Luden's Echo was created in 5.2 to replace this item and its 15% max-health active.", answer: "Deathfire Grasp" },
          { clue: "Its active disabled nearby turrets for 3 seconds; its name is both a player's handle and a pun on \"homewrecker.\"", answer: "Ohmwrecker" },
          { clue: "Fully stacked, this item had 30 more attack damage than a Bloodthirster.", answer: "Sword of the Occult" },
          { clue: "At 30 stacks it transformed into Feral Flare; it's named after a beta tester and a Touhou character.", answer: "Wriggle's Lantern" },
          { clue: "Guardsman Bob used it on Udyr in the Ionia vs Noxus showmatch; Riot removed it a week later.", answer: "Innervating Locket" }
        ]
      }
    ],
    final: {
      category: "Regions of Runeterra",
      clue: "Ezreal and this champion are the only named outsiders known to have crossed Ixtal's hidden border.",
      answer: "Neeko"
    }
  },
  {
    name: "Board 2",
    categories: [
      {
        name: "Numbers",
        clues: [
          { clue: "Not counting the 0.5-second cast, a normal Recall channels for this many seconds.", answer: "8" },
          { clue: "This many champions were playable when League launched on October 27, 2009.", answer: "40" },
          { clue: "After a full season at 25:00, patch 26.01 moved Baron's first spawn back to this time.", answer: "20:00" },
          { clue: "Rift Herald's Leap Attack deals this much true damage to a structure on the first charge.", answer: "3000" },
          { clue: "As of Locke's release in June 2026, this is the total number of released champions.", answer: "173" }
        ]
      },
      {
        name: "Voice Line Said By?",
        clues: [
          { clue: "\"Weather forecast for tonight: dark, with a chance of pain!\"", answer: "Nocturne" },
          { clue: "To Aurelion Sol: \"Space called, it wants its arrogant jerk back.\"", answer: "Ryze" },
          { clue: "On buying Mercury's Treads: \"I have a hunger for... fine shoes.\"", answer: "Tahm Kench" },
          { clue: "After blocking Riven's Wind Slash: \"Hm. It is windy today.\"", answer: "Braum" },
          { clue: "Pre-rework joke: \"So, uh, Urgot. We can't hang out anymore. I'm cool now.\"", answer: "Sion (old)" }
        ]
      },
      {
        name: "Riot Said What",
        clues: [
          { clue: "Ultra Rapid Fire debuted on this exact date.", answer: "April 1, 2014" },
          { clue: "The 2011 April Fools patch: \"Akali is no longer a ninja.\" This champion \"is now a ninja.\"", answer: "Alistar" },
          { clue: "Urf the Manatee Warwick launched in 2010 at this RP price, before a \"99% off\" week dropped it to 50.", answer: "5000 RP" },
          { clue: "Patch 4.6 renamed Twitch's ultimate from Spray and Pray to this, before 6.22 changed it back.", answer: "Rat-Ta-Tat-Tat" },
          { clue: "Patch 6.17 fixed a bug where this champion's corpse got stuck in a T-pose if he died mid-cast.", answer: "Thresh" }
        ]
      },
      {
        name: "Anagrams of Runeterra",
        note: "The hint in parentheses says what kind of thing the answer is.",
        clues: [
          { clue: "CORN TUNE (champion)", answer: "Nocturne" },
          { clue: "DREAM ENTRY (champion)", answer: "Tryndamere" },
          { clue: "MARKED ROSIE (champion)", answer: "Mordekaiser" },
          { clue: "WISHED LASSO (region)", answer: "Shadow Isles" },
          { clue: "HEADFIRST GRAPE (dead item)", answer: "Deathfire Grasp" }
        ]
      },
      {
        name: "Worlds History",
        clues: [
          { clue: "This team won Worlds 2022.", answer: "DRX" },
          { clue: "The Season 1 World Championship was a side event at this convention in Jönköping, Sweden.", answer: "DreamHack Summer 2011" },
          { clue: "Championship Riven, the only Limited Championship skin, could be earned free in 2015 with a perfect run of this.", answer: "Worlds Pick'em" },
          { clue: "SKT T1 Kalista was originally going to be a skin for this champion until Bang asked for a swap.", answer: "Sivir" },
          { clue: "The 2022 redesign of the Summoner's Cup, 44 pounds and 27 inches tall, was made by this jeweler.", answer: "Tiffany & Co." }
        ]
      },
      {
        name: "Passive Aggressive",
        clues: [
          { clue: "This champion has no base health regen; instead her healing is amplified up to 40% based on missing health.", answer: "Briar" },
          { clue: "His passive stacks 25% bonus movement speed up to 25 times, a theoretical 625%.", answer: "Singed" },
          { clue: "At 225 stacks, this champion's passive adds a true-damage burn that executes below 6.5% max health.", answer: "Smolder" },
          { clue: "Her passive stores damage on a target and detonates it all once it exceeds current health plus shields.", answer: "Mel (Overwhelm)" },
          { clue: "Released November 2025, this champion's passive resurrects him for 4 invulnerable seconds at 12 Determination stacks.", answer: "Zaahen" }
        ]
      }
    ],
    final: {
      category: "Numbers",
      clue: "Total experience needed to go from level 1 to level 18 on Summoner's Rift. (Accept within 500.)",
      answer: "18,360"
    }
  }
];
