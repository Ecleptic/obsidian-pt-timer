# PT Timer

A physical therapy workout timer plugin for [Obsidian](https://obsidian.md). Reads exercises from a section in your daily note and guides you through sets, reps, and timed holds with audio cues and haptic feedback. Works on desktop and mobile.

## Daily Note Format

Add a `# PT` section to your daily note with exercises as checkbox items. Each exercise specifies sets and either reps or a timed duration:

```markdown
# PT
- [ ] Clamshells: 3x15
- [ ] Single-leg bridge: 3x40 seconds
- [ ] Hip flexor stretch: 3x30 seconds
- [ ] Upper body
	- [ ] Push-ups: 3x10
	- [ ] Band pull-aparts: 3x15
```

**Supported formats:**
- `3x15` — 3 sets of 15 reps (tap "Done" after each set)
- `3x40 seconds` — 3 sets of 40-second timed holds (auto-countdown)
- Nested items under a parent checkbox are grouped by section name
- Already checked items (`- [x]`) are skipped

When you complete all sets of an exercise, the plugin automatically checks it off in your note.

## Installation (Local Testing)

### Desktop (macOS / Windows / Linux)

1. Open your vault's `.obsidian/plugins/` directory in a file manager
2. Create a folder called `pt-timer`
3. Copy these three files into it:
   - `main.js`
   - `manifest.json`
   - `styles.css`
4. In Obsidian, go to **Settings > Community Plugins**
5. If prompted, enable community plugins
6. Find **PT Timer** in the list and toggle it on
7. A timer icon appears in the left ribbon — click it to open

### iPhone / iPad

If your vault syncs via **iCloud**:

1. On your Mac, open Finder and navigate to:
   ```
   ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<Your Vault>/.obsidian/plugins/
   ```
2. Create a `pt-timer` folder there
3. Copy `main.js`, `manifest.json`, and `styles.css` into it
4. Wait for iCloud to sync (usually under a minute)
5. On your phone, open Obsidian and go to **Settings > Community Plugins**
6. You should see **PT Timer** listed — toggle it on
7. Use the command palette (swipe down) and search "PT Timer" to open it, or tap the timer icon in the ribbon

If your vault syncs via **Obsidian Sync**:

1. Install the plugin on desktop first (see above)
2. On desktop, go to **Settings > Sync > Vault configuration sync**
3. Make sure **Installed community plugins** is enabled
4. Wait for sync to complete
5. On your phone, go to **Settings > Community Plugins** and enable PT Timer

### Android

1. Connect your phone via USB or use a file manager app
2. Navigate to your vault's `.obsidian/plugins/` directory
3. Create a `pt-timer` folder and copy in `main.js`, `manifest.json`, and `styles.css`
4. Open Obsidian, go to **Settings > Community Plugins**, and enable PT Timer

## Settings

Open **Settings > PT Timer** to configure:

| Setting | Default | Description |
|---|---|---|
| Section heading | `PT` | The `#` heading in your daily note that contains exercises |
| Default rest duration | 40s | Rest time between sets (also adjustable during a workout) |
| Audio cues | On | Beep sounds for countdown ticks and transitions |
| Haptic feedback | On | Vibration on transitions (mobile only) |
| Auto-mark done | On | Check off exercises in your note when all sets are complete |

## Usage

1. Add a `# PT` section to today's daily note with your exercises
2. Open PT Timer from the ribbon icon or command palette
3. Press the play button to begin
4. For **timed exercises**: the timer counts down automatically
5. For **rep exercises**: do your reps, then tap **Done**
6. Rest timer runs between sets (skip it or adjust duration with +/-)
7. Use the skip button to move to the next exercise
8. When finished, all completed exercises are checked off in your note

## Building from Source

```sh
npm install
npm run build
```

This produces `main.js` in the project root. Copy it along with `manifest.json` and `styles.css` to your vault's `.obsidian/plugins/pt-timer/` directory.

## License

[MIT](LICENSE)
