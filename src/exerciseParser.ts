import { App, TFile } from "obsidian";
import { Exercise, ExerciseStep, PTTimerSettings } from "./types";

// ── Set / Rep / Duration Parsing ─────────────────────────────────────

/**
 * Detect whether a text describes a timed or rep-based exercise and
 * whether it has a "per side" / "each side" / "per arm" / "per leg" modifier.
 *
 * Supported formats:
 *   Timed:  "3x40 seconds", "3x30s", "3x1 min", "2x30 sec per side"
 *   Reps:   "3x10", "3x15 per arm"
 *   Bare:   "30 seconds" (1 set implied), "10 reps"
 *
 * Falls back to 3 sets of 10 reps if nothing can be parsed.
 */
function parseSetRep(
	text: string,
	transitionDuration: number,
): { sets: number; steps: ExerciseStep[] } {
	const perSide = /\bper\s+(side|arm|leg|hand)\b/i.test(text)
		|| /\beach\s+(side|arm|leg|hand)\b/i.test(text);

	// Extract the side labels from the text (e.g. "per arm" → "Left arm" / "Right arm")
	const sideWord = extractSideWord(text);
	const leftLabel = `Left ${sideWord}`;
	const rightLabel = `Right ${sideWord}`;

	// ── Timed: NxN seconds / NxNs / NxN sec / NxN min ──
	// Allow flexible spacing: "3x10", "3 x 10", "3x 10", "3 x10"
	const timedSetMatch = text.match(/(\d+)\s*x\s*(\d+)\s*(?:seconds?|sec|s|min(?:utes?)?)\b/i);
	if (timedSetMatch) {
		const sets = parseInt(timedSetMatch[1]);
		let duration = parseInt(timedSetMatch[2]);
		if (/min/i.test(timedSetMatch[0])) duration *= 60;

		if (perSide) {
			return {
				sets,
				steps: [
					{ label: leftLabel, type: "timed", duration },
					{ label: "Switch sides", type: "transition", duration: transitionDuration },
					{ label: rightLabel, type: "timed", duration },
				],
			};
		}
		return {
			sets,
			steps: [{ label: "", type: "timed", duration }],
		};
	}

	// ── Bare timed: "30 seconds", "1 min" (no set count → 1 set) ──
	const bareTimedMatch = text.match(/(\d+)\s*(?:seconds?|sec|s|min(?:utes?)?)\b/i);
	if (bareTimedMatch && !text.match(/\d+\s*x\s*\d+/)) {
		let duration = parseInt(bareTimedMatch[1]);
		if (/min/i.test(bareTimedMatch[0])) duration *= 60;

		if (perSide) {
			return {
				sets: 1,
				steps: [
					{ label: leftLabel, type: "timed", duration },
					{ label: "Switch sides", type: "transition", duration: transitionDuration },
					{ label: rightLabel, type: "timed", duration },
				],
			};
		}
		return {
			sets: 1,
			steps: [{ label: "", type: "timed", duration }],
		};
	}

	// ── Reps: NxN ──
	// Allow flexible spacing: "3x10", "3 x 10", "3x 10", "3 x10"
	const repMatch = text.match(/(\d+)\s*x\s*(\d+)(?!\s*(?:seconds?|sec|s|min(?:utes?)?))/i);
	if (repMatch) {
		const sets = parseInt(repMatch[1]);
		const reps = parseInt(repMatch[2]);

		if (perSide) {
			return {
				sets,
				steps: [
					{ label: leftLabel, type: "reps", reps },
					{ label: "Switch sides", type: "transition", duration: transitionDuration },
					{ label: rightLabel, type: "reps", reps },
				],
			};
		}
		return {
			sets,
			steps: [{ label: "", type: "reps", reps }],
		};
	}

	// ── Bare reps: "10 reps" ──
	const bareRepMatch = text.match(/(\d+)\s*reps?\b/i);
	if (bareRepMatch) {
		const reps = parseInt(bareRepMatch[1]);
		return {
			sets: 1,
			steps: [{ label: "", type: "reps", reps }],
		};
	}

	// ── Fallback ──
	return {
		sets: 3,
		steps: [{ label: "", type: "reps", reps: 10 }],
	};
}

/**
 * Extract the body-part word after "per" or "each" for labeling sides.
 * Returns "side" as default.
 */
function extractSideWord(text: string): string {
	const m = text.match(/(?:per|each)\s+(side|arm|leg|hand)\b/i);
	return m ? m[1].toLowerCase() : "side";
}

// ── Exercise Name Parsing ────────────────────────────────────────────

/**
 * Strip the checkbox prefix and trailing set/rep/duration notation
 * to get a clean display name.
 */
function parseExerciseName(text: string): { fullText: string; displayName: string } {
	// Remove leading whitespace and checkbox syntax
	const fullText = text.replace(/^[\s\t]*-\s*\[.\]\s*/, "").trim();
	// Strip trailing notation like ": 3x10", ": 3x40 seconds per side", ": 30s each arm"
	const displayName = fullText
		.replace(/:\s*\d+\s*x\s*\d+(\s*(?:seconds?|sec|s|min(?:utes?)?))?(\s*(?:per|each)\s+\w+)?\s*$/i, "")
		.replace(/:\s*\d+\s*(?:seconds?|sec|s|min(?:utes?)?)(\s*(?:per|each)\s+\w+)?\s*$/i, "")
		.replace(/:\s*\d+\s*reps?(\s*(?:per|each)\s+\w+)?\s*$/i, "")
		.trim();
	return { fullText, displayName };
}

// ── Section Extraction ───────────────────────────────────────────────

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract lines belonging to a `# heading` section from markdown content.
 */
function extractSection(content: string, heading: string): string[] {
	const lines = content.split("\n");
	let inSection = false;
	const sectionLines: string[] = [];
	const headingPattern = new RegExp(`^#\\s+${escapeRegex(heading)}\\s*$`);

	for (const line of lines) {
		if (headingPattern.test(line)) {
			inSection = true;
			continue;
		}
		if (inSection && /^#\s/.test(line)) break;
		if (inSection) sectionLines.push(line);
	}

	return sectionLines;
}

// ── Daily Note Resolution ────────────────────────────────────────────

/**
 * Resolve today's daily note using core Daily Notes or Periodic Notes settings.
 */
export function getDailyNoteFile(app: App): TFile | null {
	const today = window.moment();

	// Try core Daily Notes plugin
	const dailyNotes = (app as any).internalPlugins?.getPluginById?.("daily-notes");
	if (dailyNotes?.enabled) {
		const options = dailyNotes.instance?.options || {};
		const format = options.format || "YYYY-MM-DD";
		const folder = options.folder || "";
		const filename = today.format(format);
		const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
		return app.vault.getAbstractFileByPath(filePath) as TFile | null;
	}

	// Try Periodic Notes community plugin
	const periodicNotes = (app as any).plugins?.getPlugin?.("periodic-notes");
	if (periodicNotes) {
		const dailySettings = periodicNotes.settings?.daily;
		if (dailySettings?.enabled !== false) {
			const format = dailySettings?.format || "YYYY-MM-DD";
			const folder = dailySettings?.folder || "";
			const filename = today.format(format);
			const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
			return app.vault.getAbstractFileByPath(filePath) as TFile | null;
		}
	}

	// Fallback
	const fallback = today.format("YYYY-MM-DD") + ".md";
	return app.vault.getAbstractFileByPath(fallback) as TFile | null;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Load exercises based on the configured source (daily note or template file).
 */
export async function getExercises(app: App, settings: PTTimerSettings): Promise<Exercise[]> {
	let content: string;

	if (settings.exerciseSource === "template-file" && settings.templatePath) {
		const file = app.vault.getAbstractFileByPath(settings.templatePath) as TFile | null;
		if (!file) return [];
		content = await app.vault.read(file);
	} else {
		const file = getDailyNoteFile(app);
		if (!file) return [];
		content = await app.vault.read(file);
	}

	return parseExercisesFromContent(content, settings);
}

/**
 * Parse exercise content from markdown text.
 */
export function parseExercisesFromContent(
	content: string,
	settings: PTTimerSettings,
): Exercise[] {
	const sectionLines = extractSection(content, settings.sectionHeading);
	return parseExerciseLines(sectionLines, settings);
}

/**
 * Parse extracted section lines into Exercise objects.
 */
function parseExerciseLines(lines: string[], settings: PTTimerSettings): Exercise[] {
	if (settings.sectionHeaderFormat === "bold-list") {
		return parseExerciseLinesWithBoldHeaders(lines, settings.transitionDuration);
	} else {
		return parseExerciseLinesWithCheckboxGroups(lines, settings.transitionDuration);
	}
}

/**
 * Parse exercises when using bold list item headers (e.g. "- **Stretch**")
 */
function parseExerciseLinesWithBoldHeaders(lines: string[], transitionDuration: number): Exercise[] {
	const exercises: Exercise[] = [];
	let currentSection: string | null = null;

	for (const line of lines) {
		// Check if this is a bold section header: "- **SectionName**"
		const boldHeaderMatch = line.match(/^- \*\*([^*]+)\*\*$/);
		if (boldHeaderMatch) {
			currentSection = boldHeaderMatch[1].trim();
			continue;
		}

		// Skip metadata lines like "- **Focus:** ..."
		if (line.match(/^[\t\s]*- \*\*[^*]+:\*\*/)) {
			continue;
		}

		// Parse checkbox exercises (indented or not)
		const checkboxMatch = line.match(/^[\t\s]*- \[(.)\]/);
		if (checkboxMatch) {
			// Skip already completed exercises
			if (checkboxMatch[1].toLowerCase() === 'x') continue;

			const { fullText, displayName } = parseExerciseName(line);
			const { sets, steps } = parseSetRep(fullText, transitionDuration);
			exercises.push({ name: displayName, section: currentSection, sets, steps });
		}
	}

	return exercises;
}

/**
 * Parse exercises when using checkbox group headers (old format)
 */
function parseExerciseLinesWithCheckboxGroups(lines: string[], transitionDuration: number): Exercise[] {
	interface Group {
		line: string;
		children: string[];
	}
	const groups: Group[] = [];

	for (const line of lines) {
		if (line.match(/^\t- \[.\]/)) {
			if (groups.length > 0) {
				groups[groups.length - 1].children.push(line);
			}
		} else if (line.match(/^- \[.\]/)) {
			groups.push({ line, children: [] });
		}
	}

	const exercises: Exercise[] = [];

	for (const g of groups) {
		if (g.children.length > 0) {
			const sectionName = parseExerciseName(g.line).displayName;
			for (const child of g.children) {
				if (child.match(/^\t- \[x\]/i)) continue;
				const { fullText, displayName } = parseExerciseName(child.replace(/^\t/, ""));
				const { sets, steps } = parseSetRep(fullText, transitionDuration);
				exercises.push({ name: displayName, section: sectionName, sets, steps });
			}
		} else {
			if (g.line.match(/^- \[x\]/i)) continue;
			const { fullText, displayName } = parseExerciseName(g.line);
			const { sets, steps } = parseSetRep(fullText, transitionDuration);
			exercises.push({ name: displayName, section: null, sets, steps });
		}
	}

	return exercises;
}

/**
 * Mark an exercise as done in today's daily note.
 * Only applies when source is daily-note (not template).
 */
export async function markExerciseDone(
	app: App,
	exerciseName: string,
	settings: PTTimerSettings,
): Promise<boolean> {
	if (settings.exerciseSource !== "daily-note") return false;

	const file = getDailyNoteFile(app);
	if (!file) return false;

	const content = await app.vault.read(file);
	const lines = content.split("\n");
	const headingPattern = new RegExp(`^#\\s+${escapeRegex(settings.sectionHeading)}\\s*$`);

	let inSection = false;
	let changed = false;

	for (let i = 0; i < lines.length; i++) {
		if (headingPattern.test(lines[i])) {
			inSection = true;
			continue;
		}
		if (inSection && /^#\s/.test(lines[i])) break;
		if (!inSection) continue;

		const { displayName } = parseExerciseName(lines[i].replace(/^\t/, ""));
		if (displayName === exerciseName && lines[i].includes("- [ ]")) {
			lines[i] = lines[i].replace("- [ ]", "- [x]");
			changed = true;
			break;
		}
	}

	if (!changed) return false;

	// Auto-check parent groups where all children are done
	inSection = false;
	for (let i = 0; i < lines.length; i++) {
		if (headingPattern.test(lines[i])) {
			inSection = true;
			continue;
		}
		if (inSection && /^#\s/.test(lines[i])) break;
		if (!inSection) continue;

		if (lines[i].match(/^- \[ \]/)) {
			let j = i + 1;
			let hasChildren = false;
			let allDone = true;
			while (j < lines.length && lines[j].match(/^\t- \[.\]/)) {
				hasChildren = true;
				if (lines[j].includes("- [ ]")) allDone = false;
				j++;
			}
			if (hasChildren && allDone) {
				lines[i] = lines[i].replace("- [ ]", "- [x]");
			}
		}
	}

	await app.vault.modify(file, lines.join("\n"));
	return true;
}
