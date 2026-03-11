import { Plugin } from "obsidian";
import { PTTimerSettings, DEFAULT_SETTINGS } from "./types";
import { PTTimerView, VIEW_TYPE_PT_TIMER } from "./PTTimerView";
import { PTTimerSettingTab } from "./settings";

export default class PTTimerPlugin extends Plugin {
	settings: PTTimerSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_PT_TIMER, (leaf) => new PTTimerView(leaf, this));

		this.addRibbonIcon("timer", "Open PT Timer", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-pt-timer",
			name: "Open PT Timer",
			callback: () => {
				this.activateView();
			},
		});

		this.addSettingTab(new PTTimerSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_PT_TIMER);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_PT_TIMER)[0];

		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: VIEW_TYPE_PT_TIMER,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}
}
