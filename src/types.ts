/**
 * A single step within one set of an exercise.
 *
 * Simple exercises have one step per set. Complex exercises (e.g. "per side")
 * have multiple steps: work one side, transition, work the other side.
 */
export interface ExerciseStep {
	/** Display label for this step (e.g. "Left side", "Switch sides", "") */
	label: string;
	type: "timed" | "reps" | "transition";
	/** Duration in seconds (for timed and transition steps) */
	duration?: number;
	/** Number of reps (for rep-based steps) */
	reps?: number;
}

export interface Exercise {
	name: string;
	section: string | null;
	sets: number;
	/**
	 * Steps executed sequentially within each set.
	 * A simple "3x10" exercise has one step: { type: "reps", reps: 10 }.
	 * A "3x30 seconds per side" has three steps: work left, transition, work right.
	 */
	steps: ExerciseStep[];
}

export type ExerciseSource = "daily-note" | "template-file";

export interface PTTimerSettings {
	/** Where to read exercises from */
	exerciseSource: ExerciseSource;
	/** The heading to look for when using daily-note source */
	sectionHeading: string;
	/** Path to a template file (relative to vault root) when using template-file source */
	templatePath: string;
	/** Default rest duration in seconds */
	restDuration: number;
	/** Default transition duration in seconds (for "per side" exercises) */
	transitionDuration: number;
	enableAudio: boolean;
	enableHaptics: boolean;
	/** Announce exercises and transitions with text-to-speech */
	enableTTS: boolean;
	autoMarkDone: boolean;
}

export const DEFAULT_SETTINGS: PTTimerSettings = {
	exerciseSource: "daily-note",
	sectionHeading: "PT",
	templatePath: "",
	restDuration: 40,
	transitionDuration: 5,
	enableAudio: true,
	enableHaptics: true,
	enableTTS: false,
	autoMarkDone: true,
};
