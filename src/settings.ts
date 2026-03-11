import { App, PluginSettingTab, Setting } from "obsidian";
import type PTTimerPlugin from "./main";

export class PTTimerSettingTab extends PluginSettingTab {
	plugin: PTTimerPlugin;

	constructor(app: App, plugin: PTTimerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Exercise Source ───────────────────────────────────────────

		containerEl.createEl("h3", { text: "Exercise Source" });

		new Setting(containerEl)
			.setName("Source")
			.setDesc("Where to read exercises from.")
			.addDropdown((drop) =>
				drop
					.addOption("daily-note", "Daily note (with heading)")
					.addOption("template-file", "Template file")
					.setValue(this.plugin.settings.exerciseSource)
					.onChange(async (value) => {
						this.plugin.settings.exerciseSource = value as "daily-note" | "template-file";
						await this.plugin.saveSettings();
						this.display(); // Re-render to show/hide conditional fields
					}),
			);

		new Setting(containerEl)
			.setName("Section heading")
			.setDesc(
				"The heading in the note that contains PT exercises (e.g. \"PT\" matches \"# PT\").",
			)
			.addText((text) =>
				text
					.setPlaceholder("PT")
					.setValue(this.plugin.settings.sectionHeading)
					.onChange(async (value) => {
						this.plugin.settings.sectionHeading = value.trim() || "PT";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Section header format")
			.setDesc(
				"How subsections within your PT section are formatted. " +
				"\"Bold list items\" = \"- **Stretch**\", " +
				"\"Checkbox groups\" = \"- [ ] Stretch\" with nested exercises.",
			)
			.addDropdown((drop) =>
				drop
					.addOption("bold-list", "Bold list items")
					.addOption("checkbox", "Checkbox groups")
					.setValue(this.plugin.settings.sectionHeaderFormat)
					.onChange(async (value) => {
						this.plugin.settings.sectionHeaderFormat = value as "bold-list" | "checkbox";
						await this.plugin.saveSettings();
					}),
			);

		// Add exercise format documentation
		const formatDoc = containerEl.createDiv({ cls: "setting-item-description" });
		formatDoc.style.marginTop = "1em";
		formatDoc.style.padding = "0.5em";
		formatDoc.style.backgroundColor = "var(--background-secondary)";
		formatDoc.style.borderRadius = "4px";
		formatDoc.innerHTML = `
			<strong>Exercise Format Examples:</strong><br><br>
			<code>- [ ] Cat cow: 2x15</code> → 2 sets of 15 reps<br>
			<code>- [ ] Side plank: 3x30 seconds</code> → 3 sets of 30s holds<br>
			<code>- [ ] Clamshells: 3x15 per side</code> → 3 sets of 15 reps each side<br>
			<code>- [ ] Single leg deadlift: 3x40s per leg</code> → 3 sets of 40s each leg<br><br>

			<strong>Supported formats:</strong><br>
			• <code>NxN</code> = sets × reps (e.g. 3x10)<br>
			• <code>Nx Ns</code> or <code>Nx N seconds</code> = sets × time (e.g. 3x30s)<br>
			• Add <code>per side</code>, <code>per arm</code>, <code>per leg</code> for bilateral exercises<br>
			• Timer auto-detects timed vs rep-based exercises
		`;
		containerEl.appendChild(formatDoc);

		if (this.plugin.settings.exerciseSource === "template-file") {
			new Setting(containerEl)
				.setName("Template file path")
				.setDesc(
					"Path to a markdown file in your vault (e.g. \"Templates/PT Workout.md\"). " +
					"Exercises are read from the section heading above.",
				)
				.addText((text) =>
					text
						.setPlaceholder("Templates/PT Workout.md")
						.setValue(this.plugin.settings.templatePath)
						.onChange(async (value) => {
							this.plugin.settings.templatePath = value.trim();
							await this.plugin.saveSettings();
						}),
				);
		}

		// ── Timer ────────────────────────────────────────────────────

		containerEl.createEl("h3", { text: "Timer" });

		new Setting(containerEl)
			.setName("Default rest duration")
			.setDesc("Seconds of rest between sets. Adjustable during a workout.")
			.addSlider((slider) =>
				slider
					.setLimits(5, 120, 5)
					.setValue(this.plugin.settings.restDuration)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.restDuration = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Side transition duration")
			.setDesc(
				"Seconds to switch sides for \"per side\" / \"each arm\" exercises.",
			)
			.addSlider((slider) =>
				slider
					.setLimits(3, 30, 1)
					.setValue(this.plugin.settings.transitionDuration)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.transitionDuration = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── Feedback ─────────────────────────────────────────────────

		containerEl.createEl("h3", { text: "Feedback" });

		new Setting(containerEl)
			.setName("Audio cues")
			.setDesc("Play beep sounds for countdown ticks and transitions.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableAudio).onChange(async (value) => {
					this.plugin.settings.enableAudio = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Haptic feedback")
			.setDesc("Vibrate on transitions (mobile only).")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableHaptics).onChange(async (value) => {
					this.plugin.settings.enableHaptics = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Voice announcements (TTS)")
			.setDesc(
				"Announce exercise names, set numbers, and side transitions using text-to-speech.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableTTS).onChange(async (value) => {
					this.plugin.settings.enableTTS = value;
					await this.plugin.saveSettings();
				}),
			);

		// ── Behavior ─────────────────────────────────────────────────

		containerEl.createEl("h3", { text: "Behavior" });

		new Setting(containerEl)
			.setName("Auto-mark exercises done")
			.setDesc(
				"Automatically check off exercises in your daily note when all sets are complete. " +
				"Only applies when source is \"Daily note\".",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoMarkDone).onChange(async (value) => {
					this.plugin.settings.autoMarkDone = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
