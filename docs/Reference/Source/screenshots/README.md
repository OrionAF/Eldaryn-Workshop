# Source/screenshots — game captures

Screenshots of the game itself, filed by system. Raw evidence: what the game
displayed on a given date.

| Folder | Contents |
|---|---|
| `mounts/` | Mount cards and star/level tables |
| `relics/` | Relic lists and level tables (text scrapes in `../game-data/`) |
| `talents/` | Talent trees |
| `transcendence/` | The transcendence board (text scrape in `../game-data/`) |
| `misc/` | Everything else, including cited evidence — see below |

## Cited captures

`misc/IMG_7384-mutual-kill-defeated.png` is referenced by `pvpSimulation.js`
as the evidence that a mutual kill (both fighters at 0 HP in the same instant)
is scored as a **loss** for the player — the arena shows "Defeated". Renaming
or moving it breaks that citation.

## Dating

A capture is permanently true of its date, so nothing here is ever "outdated".
When a patch changes what a screen shows, add the new capture alongside rather
than replacing — the pair is how we know what changed. File modification dates
are the current record; prefer a dated filename for anything you expect to
cite.
