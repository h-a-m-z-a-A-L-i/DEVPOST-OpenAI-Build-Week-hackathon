export type AgentPhase = 'planning' | 'executing' | 'verifying' | 'completed' | 'failed' | 'cancelled';

export type AgentWorkflowEvent = (message: string) => void;

export class AgentWorkflow {
	private currentPhase: AgentPhase = 'planning';
	private verificationRequired = false;
	private hasReadNotebook = false;

	constructor(private readonly onEvent: AgentWorkflowEvent) {
		this.onEvent('Planning notebook task...');
	}

	get phase(): AgentPhase {
		return this.currentPhase;
	}

	beforeTool(name: string): string | undefined {
		if (this.currentPhase === 'failed' || this.currentPhase === 'cancelled' || this.currentPhase === 'completed') {
			return `Workflow is already ${this.currentPhase}.`;
		}

		if (!this.hasReadNotebook && name !== 'read_notebook') {
			return 'The agent must read the notebook before changing or executing a cell.';
		}

		if (this.verificationRequired && name !== 'read_notebook') {
			return 'The previous notebook operation must be verified with read_notebook before another operation.';
		}

		return undefined;
	}

	afterTool(name: string): void {
		if (name === 'read_notebook') {
			this.hasReadNotebook = true;
			this.verificationRequired = false;
			if (this.currentPhase === 'planning' || this.currentPhase === 'verifying') {
				this.currentPhase = 'executing';
				this.onEvent('Notebook context verified; executing task plan.');
			}
			return;
		}

		this.verificationRequired = true;
		this.currentPhase = 'verifying';
		this.onEvent('Verifying notebook changes...');
	}

	canComplete(): boolean {
		return this.hasReadNotebook && !this.verificationRequired && this.currentPhase === 'executing';
	}

	complete(): void {
		if (!this.canComplete()) {
			throw new Error('The agent cannot complete until the notebook operation is verified.');
		}
		this.currentPhase = 'completed';
		this.onEvent('Notebook task completed and verified.');
	}

	fail(message: string): void {
		this.currentPhase = 'failed';
		this.onEvent(`Workflow stopped: ${message}`);
	}

	cancel(): void {
		this.currentPhase = 'cancelled';
		this.onEvent('Workflow cancelled.');
	}
}
