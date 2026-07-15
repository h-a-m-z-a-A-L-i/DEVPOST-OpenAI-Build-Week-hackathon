import type { AgentPhase } from './agentWorkflow';

export type AgentRunEventType = 'started' | 'phase' | 'tool-started' | 'tool-completed' | 'tool-failed' | 'completed' | 'cancelled' | 'failed';

export interface AgentRunEvent {
	timestamp: string;
	type: AgentRunEventType;
	phase: AgentPhase;
	tool?: string;
	detail?: string;
}

export class AgentRunLog {
	private readonly entries: AgentRunEvent[] = [];

	constructor(private readonly notebookUri: string) {
		this.record({ type: 'started', phase: 'planning', detail: notebookUri });
	}

	record(event: Omit<AgentRunEvent, 'timestamp'>): void {
		const entry = { timestamp: new Date().toISOString(), ...event };
		this.entries.push(entry);
		console.info(`[NotebookPilot] ${JSON.stringify(entry)}`);
	}

	get events(): readonly AgentRunEvent[] {
		return this.entries;
	}
}
