import { ItemView, WorkspaceLeaf } from "obsidian";
import type PTTimerPlugin from "./main";
import { Exercise, ExerciseStep } from "./types";
import { getExercises, markExerciseDone } from "./exerciseParser";

export const VIEW_TYPE_PT_TIMER = "pt-timer-view";

type TimerState = "ready" | "work" | "rest" | "transition" | "done";

export class PTTimerView extends ItemView {
	plugin: PTTimerPlugin;

	private exercises: Exercise[] = [];
	private exIdx = 0;
	private setIdx = 0;
	private stepIdx = 0;
	private timer = 0;
	private interval: ReturnType<typeof setInterval> | null = null;
	private state: TimerState = "ready";
	private playing = false;
	private restDuration: number;
	private completedExercises = new Set<string>();
	private loaded = false;
	private audioCtx: AudioContext | null = null;
	private wakeLock: WakeLockSentinel | null = null;

	// DOM references
	private els: Record<string, HTMLElement> = {};

	constructor(leaf: WorkspaceLeaf, plugin: PTTimerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.restDuration = plugin.settings.restDuration;
	}

	getViewType(): string {
		return VIEW_TYPE_PT_TIMER;
	}

	getDisplayText(): string {
		return "PT Timer";
	}

	getIcon(): string {
		return "timer";
	}

	async onOpen(): Promise<void> {
		this.buildUI();
		await this.loadExercises();
	}

	async onClose(): Promise<void> {
		this.stopInterval();
		this.releaseWakeLock();
	}

	// ── Helpers ──────────────────────────────────────────────────────

	private get currentExercise(): Exercise | null {
		return this.exercises[this.exIdx] ?? null;
	}

	private get currentStep(): ExerciseStep | null {
		const ex = this.currentExercise;
		if (!ex) return null;
		return ex.steps[this.stepIdx] ?? null;
	}

	private totalStepCount(): number {
		let count = 0;
		for (const ex of this.exercises) {
			count += ex.sets * ex.steps.length;
		}
		return count;
	}

	private completedStepCount(): number {
		let count = 0;
		for (let i = 0; i < this.exIdx; i++) {
			count += this.exercises[i].sets * this.exercises[i].steps.length;
		}
		const ex = this.currentExercise;
		if (ex) {
			count += this.setIdx * ex.steps.length;
			count += this.stepIdx;
		}
		return count;
	}

	private formatTime(seconds: number): string {
		if (seconds >= 60) {
			const m = Math.floor(seconds / 60);
			const s = seconds % 60;
			return `${m}:${s.toString().padStart(2, "0")}`;
		}
		return String(seconds);
	}

	private formatExerciseInfo(ex: Exercise): string {
		const step = ex.steps[0];
		if (!step) return "";
		const perSide = ex.steps.some((s) => s.type === "transition");

		if (step.type === "timed") {
			const duration = step.duration ?? 30;
			const timeStr =
				duration >= 60
					? `${Math.floor(duration / 60)} min`
					: `${duration}s`;
			const setStr = ex.sets > 1 ? `${ex.sets} \u00d7 ${timeStr}` : timeStr;
			return perSide ? `${setStr} per side` : setStr;
		} else if (step.type === "reps") {
			const reps = step.reps ?? 10;
			const setStr =
				ex.sets > 1 ? `${ex.sets} \u00d7 ${reps}` : `${reps} reps`;
			return perSide ? `${setStr} per side` : setStr;
		}
		return "";
	}

	// ── UI Construction ──────────────────────────────────────────────

	private buildUI(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("pt-timer-container");

		// Progress bar
		const progressBar = container.createDiv({ cls: "pt-progress-bar" });
		this.els.progressFill = progressBar.createDiv({
			cls: "pt-progress-fill",
		});

		// Main content area
		const main = container.createDiv({ cls: "pt-main" });
		this.els.main = main;

		// ── Exercise List (shown in ready state via CSS) ──
		this.els.exerciseList = main.createDiv({ cls: "pt-exercise-list" });

		// ── Timer Content (shown in active states via CSS) ──
		const timerContent = main.createDiv({ cls: "pt-timer-content" });
		this.els.timerContent = timerContent;

		this.els.exercisePosition = timerContent.createDiv({
			cls: "pt-exercise-position",
		});
		this.els.sectionHeader = timerContent.createDiv({
			cls: "pt-section-header",
		});
		this.els.stateLabel = timerContent.createDiv({ cls: "pt-state-label" });
		this.els.exerciseName = timerContent.createDiv({
			cls: "pt-exercise-name",
		});
		this.els.stepLabel = timerContent.createDiv({ cls: "pt-step-label" });
		this.els.setInfo = timerContent.createDiv({ cls: "pt-set-info" });
		this.els.timerDisplay = timerContent.createDiv({
			cls: "pt-timer-display",
		});
		this.els.repInfo = timerContent.createDiv({ cls: "pt-rep-info" });

		// Action buttons
		this.els.doneBtn = timerContent.createEl("button", {
			cls: "pt-done-btn",
			text: "Done",
		});
		this.els.doneBtn.addEventListener("click", () => this.onDone());

		this.els.skipRestBtn = timerContent.createEl("button", {
			cls: "pt-skip-rest-btn",
			text: "Skip Rest",
		});
		this.els.skipRestBtn.addEventListener("click", () =>
			this.onSkipRest(),
		);

		// Up next
		this.els.upNext = timerContent.createDiv({ cls: "pt-up-next" });

		// Completion info
		this.els.completionInfo = timerContent.createDiv({
			cls: "pt-completion-info",
		});

		// ── Done Content (shown in done state via CSS) ──
		const doneContent = main.createDiv({ cls: "pt-done-content" });
		this.els.doneContent = doneContent;
		this.els.doneIcon = doneContent.createDiv({ cls: "pt-done-icon" });
		this.els.doneIcon.innerHTML = SVG_CHECK_CIRCLE;
		this.els.doneTitle = doneContent.createDiv({
			cls: "pt-done-title",
			text: "Workout Complete",
		});
		this.els.doneSummary = doneContent.createDiv({
			cls: "pt-done-summary",
		});

		// ── Controls Area ──
		const controlsArea = container.createDiv({ cls: "pt-controls-area" });

		// Start workout button (ready state — visibility via CSS)
		this.els.startBtn = controlsArea.createEl("button", {
			cls: "pt-start-btn",
			text: "Start Workout",
		});
		this.els.startBtn.addEventListener("click", () =>
			this.onStartWorkout(),
		);

		// Transport controls (active states — visibility via CSS)
		const controls = controlsArea.createDiv({ cls: "pt-controls" });
		this.els.controls = controls;

		const restartBtn = controls.createEl("button", {
			cls: "pt-ctrl-btn",
			attr: { "aria-label": "Restart" },
		});
		restartBtn.innerHTML = SVG_RESTART;
		restartBtn.addEventListener("click", () => this.onRestart());

		const playBtn = controls.createEl("button", {
			cls: "pt-ctrl-btn pt-ctrl-primary",
			attr: { "aria-label": "Play / Pause" },
		});
		this.els.playIcon = playBtn;
		playBtn.innerHTML = SVG_PLAY;
		playBtn.addEventListener("click", () => this.onPlayPause());

		const skipBtn = controls.createEl("button", {
			cls: "pt-ctrl-btn",
			attr: { "aria-label": "Skip exercise" },
		});
		skipBtn.innerHTML = SVG_SKIP;
		skipBtn.addEventListener("click", () => this.onSkip());

		// Start Again button (done state — visibility via CSS)
		this.els.restartWorkoutBtn = controlsArea.createEl("button", {
			cls: "pt-restart-workout-btn",
			text: "Start Again",
		});
		this.els.restartWorkoutBtn.addEventListener("click", () =>
			this.onRestart(),
		);

		// Rest duration adjuster
		const restAdjust = controlsArea.createDiv({ cls: "pt-rest-adjust" });
		this.els.restAdjust = restAdjust;

		const minusBtn = restAdjust.createEl("button", {
			attr: { "aria-label": "Decrease rest" },
		});
		minusBtn.innerHTML = SVG_MINUS;
		minusBtn.addEventListener("click", () => this.adjustRest(-5));

		this.els.restLabel = restAdjust.createSpan({
			text: `Rest: ${this.restDuration}s`,
		});

		const plusBtn = restAdjust.createEl("button", {
			attr: { "aria-label": "Increase rest" },
		});
		plusBtn.innerHTML = SVG_PLUS;
		plusBtn.addEventListener("click", () => this.adjustRest(5));
	}

	// ── Exercise Loading ─────────────────────────────────────────────

	private async loadExercises(): Promise<void> {
		try {
			this.exercises = await getExercises(
				this.app,
				this.plugin.settings,
			);
		} catch (e) {
			console.error("PT Timer: failed to load exercises", e);
			this.exercises = [];
		}
		this.loaded = true;
		this.setTimerState("ready");
		this.renderExerciseList();
		this.render();
	}

	private renderExerciseList(): void {
		const list = this.els.exerciseList;
		list.empty();

		if (!this.loaded) {
			list.createDiv({
				cls: "pt-list-empty",
				text: "Loading exercises\u2026",
			});
			return;
		}

		if (this.exercises.length === 0) {
			list.createDiv({
				cls: "pt-list-empty",
				text: "No exercises found",
			});
			list.createDiv({
				cls: "pt-list-hint",
				text: "Check your daily note or plugin settings.",
			});
			this.els.startBtn.addClass("is-disabled");
			return;
		}

		this.els.startBtn.removeClass("is-disabled");

		const header = list.createDiv({ cls: "pt-list-header" });
		header.createSpan({ cls: "pt-list-title", text: "Today's Workout" });
		header.createSpan({
			cls: "pt-list-count",
			text: `${this.exercises.length} exercise${this.exercises.length !== 1 ? "s" : ""}`,
		});

		let currentSection: string | null = null;
		for (const ex of this.exercises) {
			if (ex.section && ex.section !== currentSection) {
				currentSection = ex.section;
				list.createDiv({
					cls: "pt-list-section",
					text: ex.section,
				});
			} else if (!ex.section && currentSection !== null) {
				currentSection = null;
			}

			const item = list.createDiv({ cls: "pt-list-item" });
			item.createDiv({ cls: "pt-list-item-name", text: ex.name });
			const info = this.formatExerciseInfo(ex);
			if (info) {
				item.createDiv({ cls: "pt-list-item-info", text: info });
			}
		}
	}

	// ── State Machine ────────────────────────────────────────────────

	private setTimerState(s: TimerState): void {
		this.state = s;
		const container = this.contentEl;
		container.removeClass(
			"pt-state-work",
			"pt-state-rest",
			"pt-state-transition",
			"pt-state-done",
			"pt-state-ready",
		);
		container.addClass(`pt-state-${s}`);
	}

	private render(): void {
		this.updateProgress();

		// Reset action button visibility
		this.els.doneBtn.removeClass("is-visible");
		this.els.skipRestBtn.removeClass("is-visible");
		this.els.stepLabel.textContent = "";
		this.els.upNext.textContent = "";

		if (this.state === "ready" || this.state === "done") {
			if (this.state === "done") {
				this.renderDoneContent();
			}
			return;
		}

		// Active states: work, rest, transition
		const ex = this.currentExercise;
		if (!ex) return;

		this.els.exercisePosition.textContent = `Exercise ${this.exIdx + 1} of ${this.exercises.length}`;
		this.els.sectionHeader.textContent = ex.section || "";

		const doneCount = this.completedExercises.size;
		this.els.completionInfo.textContent =
			doneCount > 0
				? `${doneCount} of ${this.exercises.length} completed`
				: "";

		if (this.state === "rest") {
			this.els.stateLabel.textContent = "Rest";
			this.els.exerciseName.textContent = "";
			this.els.setInfo.textContent = "";
			this.els.timerDisplay.textContent = this.formatTime(this.timer);
			this.els.repInfo.textContent = "";
			this.els.skipRestBtn.addClass("is-visible");

			// Up next info
			if (this.setIdx > 0) {
				this.els.upNext.textContent = `Up next: ${ex.name} \u2014 Set ${this.setIdx + 1}`;
			} else {
				const info = this.formatExerciseInfo(ex);
				this.els.upNext.textContent = `Up next: ${ex.name}${info ? ` \u2014 ${info}` : ""}`;
			}
			return;
		}

		if (this.state === "transition") {
			this.els.stateLabel.textContent = "Switch Sides";
			this.els.exerciseName.textContent = ex.name;
			const step = this.currentStep;
			this.els.stepLabel.textContent = step?.label || "Switch";
			this.els.setInfo.textContent = `Set ${this.setIdx + 1} of ${ex.sets}`;
			this.els.timerDisplay.textContent = this.formatTime(this.timer);
			this.els.repInfo.textContent = "";
			this.els.skipRestBtn.addClass("is-visible");
			return;
		}

		// Work state
		this.els.stateLabel.textContent = "Go";
		this.els.exerciseName.textContent = ex.name;
		this.els.setInfo.textContent = `Set ${this.setIdx + 1} of ${ex.sets}`;
		const step = this.currentStep;
		if (step?.label) {
			this.els.stepLabel.textContent = step.label;
		}

		if (step?.type === "timed") {
			this.els.timerDisplay.textContent = this.formatTime(this.timer);
			this.els.repInfo.textContent = "";
		} else {
			// Reps — show Done button
			this.els.timerDisplay.textContent = "";
			this.els.repInfo.textContent = `${step?.reps ?? 0} reps`;
			this.els.doneBtn.addClass("is-visible");
		}
	}

	private renderDoneContent(): void {
		const total = this.exercises.length;
		this.els.doneSummary.textContent = `${total} exercise${total !== 1 ? "s" : ""} completed`;
	}

	private updateProgress(): void {
		const total = this.totalStepCount();
		const completed = Math.min(this.completedStepCount(), total);
		const pct = total ? (completed / total) * 100 : 0;
		this.els.progressFill.style.width = `${pct}%`;
	}

	// ── Timer Engine ─────────────────────────────────────────────────

	private tick(): void {
		if (this.timer <= 0) {
			if (this.state === "work" || this.state === "transition") {
				this.advanceStep();
			} else if (this.state === "rest") {
				this.startNextSetOrExercise();
			}
			return;
		}

		if (this.timer <= 3 && this.timer > 0) {
			this.beepTick();
		}

		this.timer--;
		this.render();

		if (this.timer === 0) {
			this.beepEnd();
			setTimeout(() => {
				if (this.state === "work" || this.state === "transition") {
					this.advanceStep();
				} else if (this.state === "rest") {
					this.startNextSetOrExercise();
				}
			}, 300);
		}
	}

	private startStep(): void {
		const ex = this.currentExercise;
		const step = this.currentStep;
		if (!ex || !step) {
			this.finish();
			return;
		}

		if (step.type === "transition") {
			this.setTimerState("transition");
			this.speak(step.label || "Switch sides");
			this.timer =
				step.duration ?? this.plugin.settings.transitionDuration;
			this.render();
			this.startInterval();
		} else if (step.type === "timed") {
			this.setTimerState("work");
			this.announceStep(ex, step);
			this.beepStart();
			this.timer = step.duration ?? 30;
			this.render();
			this.startInterval();
		} else {
			// Reps — pause interval and wait for Done button
			this.setTimerState("work");
			this.announceStep(ex, step);
			this.beepStart();
			this.stopInterval();
			this.timer = 0;
			this.render();
		}
	}

	private advanceStep(): void {
		this.stepIdx++;
		const ex = this.currentExercise;
		if (!ex || this.stepIdx >= ex.steps.length) {
			this.stepIdx = 0;
			this.advanceSet();
			return;
		}
		this.startStep();
	}

	private advanceSet(): void {
		this.setIdx++;
		const ex = this.currentExercise;
		if (!ex || this.setIdx >= ex.sets) {
			this.onExerciseComplete(this.exercises[this.exIdx]);
			this.exIdx++;
			this.setIdx = 0;
			this.stepIdx = 0;
			if (this.exIdx >= this.exercises.length) {
				this.finish();
				return;
			}
			this.startRest();
			return;
		}
		this.startRest();
	}

	private startNextSetOrExercise(): void {
		this.stepIdx = 0;
		this.startStep();
	}

	private startRest(): void {
		this.setTimerState("rest");
		this.speak("Rest");
		this.timer = this.restDuration;
		this.render();
		this.startInterval();
	}

	private finish(): void {
		this.stopInterval();
		this.setTimerState("done");
		this.speak("Workout complete");
		this.render();
		this.releaseWakeLock();
		this.playing = false;
		this.els.playIcon.innerHTML = SVG_PLAY;
	}

	private startInterval(): void {
		if (!this.interval) {
			this.interval = setInterval(() => this.tick(), 1000);
		}
	}

	private stopInterval(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	// ── Event Handlers ───────────────────────────────────────────────

	private onStartWorkout(): void {
		if (this.exercises.length === 0) return;
		this.ensureAudioCtx();
		this.playing = true;
		this.els.playIcon.innerHTML = SVG_PAUSE;
		this.exIdx = 0;
		this.setIdx = 0;
		this.stepIdx = 0;
		this.completedExercises.clear();
		this.startStep();
		this.acquireWakeLock();
	}

	private onPlayPause(): void {
		if (this.playing) {
			this.pause();
		} else {
			this.resume();
		}
	}

	private resume(): void {
		if (this.state === "ready" || this.state === "done") return;
		this.ensureAudioCtx();
		this.playing = true;
		this.els.playIcon.innerHTML = SVG_PAUSE;

		// Don't restart interval for rep exercises (waiting for Done button)
		if (this.state === "work" && this.currentStep?.type === "reps") return;
		this.startInterval();
	}

	private pause(): void {
		this.stopInterval();
		this.playing = false;
		this.els.playIcon.innerHTML = SVG_PLAY;
	}

	private onDone(): void {
		if (this.state !== "work") return;
		this.advanceStep();
	}

	private onSkipRest(): void {
		if (this.state !== "rest" && this.state !== "transition") return;
		this.stopInterval();
		this.timer = 0;
		if (this.state === "transition") {
			this.advanceStep();
		} else {
			this.startNextSetOrExercise();
		}
	}

	private onSkip(): void {
		if (this.state === "ready" || this.state === "done") return;
		// Skip does NOT mark the exercise as done
		this.exIdx++;
		this.setIdx = 0;
		this.stepIdx = 0;
		if (this.exIdx >= this.exercises.length) {
			this.finish();
			return;
		}
		this.stopInterval();
		this.startStep();
		if (!this.playing) {
			this.playing = true;
			this.els.playIcon.innerHTML = SVG_PAUSE;
		}
	}

	private onRestart(): void {
		this.stopInterval();
		this.exIdx = 0;
		this.setIdx = 0;
		this.stepIdx = 0;
		this.playing = false;
		this.completedExercises.clear();
		this.els.playIcon.innerHTML = SVG_PLAY;
		this.setTimerState("ready");
		this.renderExerciseList();
		this.render();
		this.releaseWakeLock();
	}

	private adjustRest(delta: number): void {
		this.restDuration = Math.max(
			5,
			Math.min(120, this.restDuration + delta),
		);
		this.els.restLabel.textContent = `Rest: ${this.restDuration}s`;
	}

	// ── Exercise Completion ──────────────────────────────────────────

	private onExerciseComplete(ex: Exercise): void {
		this.completedExercises.add(ex.name);
		if (this.plugin.settings.autoMarkDone) {
			markExerciseDone(
				this.app,
				ex.name,
				this.plugin.settings,
			).catch((e) =>
				console.error("PT Timer: failed to mark exercise done", e),
			);
		}
	}

	// ── TTS ──────────────────────────────────────────────────────────

	private speak(text: string): void {
		if (!this.plugin.settings.enableTTS) return;
		try {
			const synth = window.speechSynthesis;
			if (!synth) return;
			synth.cancel();
			const utterance = new SpeechSynthesisUtterance(text);
			utterance.rate = 1.0;
			utterance.volume = 0.8;
			synth.speak(utterance);
		} catch {
			// SpeechSynthesis not available
		}
	}

	private announceStep(ex: Exercise, step: ExerciseStep): void {
		if (!this.plugin.settings.enableTTS) return;
		const parts: string[] = [];
		if (this.setIdx === 0 && this.stepIdx === 0) {
			parts.push(ex.name);
		}
		parts.push(`Set ${this.setIdx + 1}`);
		if (step.label) parts.push(step.label);
		if (step.type === "timed") {
			parts.push(`${step.duration} seconds`);
		} else if (step.type === "reps") {
			parts.push(`${step.reps} reps`);
		}
		this.speak(parts.join(". "));
	}

	// ── Audio ────────────────────────────────────────────────────────

	private ensureAudioCtx(): void {
		if (!this.audioCtx) {
			this.audioCtx = new (window.AudioContext ||
				(window as any).webkitAudioContext)();
		}
		if (this.audioCtx.state === "suspended") {
			this.audioCtx.resume();
		}
	}

	private beep(freq: number, dur: number, vol = 0.3): void {
		if (!this.plugin.settings.enableAudio || !this.audioCtx) return;
		try {
			const o = this.audioCtx.createOscillator();
			const g = this.audioCtx.createGain();
			o.connect(g);
			g.connect(this.audioCtx.destination);
			o.frequency.value = freq;
			g.gain.value = vol;
			o.start();
			o.stop(this.audioCtx.currentTime + dur);
		} catch {
			// Ignore audio errors
		}
	}

	private vibrate(pattern: number | number[]): void {
		if (!this.plugin.settings.enableHaptics) return;
		try {
			navigator?.vibrate?.(pattern);
		} catch {
			// Vibration not supported
		}
	}

	private beepStart(): void {
		this.beep(880, 0.15);
		this.vibrate(100);
	}

	private beepTick(): void {
		this.beep(660, 0.1, 0.2);
	}

	private beepEnd(): void {
		this.beep(1100, 0.3, 0.4);
		this.vibrate([200, 100, 200]);
	}

	// ── Wake Lock ────────────────────────────────────────────────────

	private async acquireWakeLock(): Promise<void> {
		try {
			if ("wakeLock" in navigator) {
				this.wakeLock = await navigator.wakeLock.request("screen");
			}
		} catch {
			// Not supported or denied
		}
	}

	private releaseWakeLock(): void {
		if (this.wakeLock) {
			this.wakeLock.release();
			this.wakeLock = null;
		}
	}
}

// ── SVG Icons ────────────────────────────────────────────────────────

const SVG_PLAY =
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';

const SVG_PAUSE =
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>';

const SVG_RESTART =
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/></svg>';

const SVG_SKIP =
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg>';

const SVG_MINUS =
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 13H5v-2h14v2z" fill="currentColor"/></svg>';

const SVG_PLUS =
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/></svg>';

const SVG_CHECK_CIRCLE =
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/></svg>';
