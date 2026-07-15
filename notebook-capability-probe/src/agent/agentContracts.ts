import * as vscode from 'vscode';

export type AgentToolName = 'read_notebook' | 'run_cell' | 'insert_cell' | 'edit_cell' | 'delete_cell';

export type AgentToolInput = {
	index?: number;
	text?: string;
	language?: string;
	kind?: 'code' | 'markdown';
	includeOutputs?: boolean;
};

export type AgentToolResult = {
	ok: boolean;
	data: unknown;
};

export const agentLanguageModelTools: vscode.LanguageModelChatTool[] = [
	{
		name: 'read_notebook',
		description: 'Read the active notebook, one cell, and optionally its outputs. Cell indexes are zero-based.',
		inputSchema: {
			type: 'object',
			properties: {
				index: { type: 'integer', minimum: 0, description: 'Zero-based cell index. Omit to list all cells.' },
				includeOutputs: { type: 'boolean', description: 'Include cell outputs when reading one cell.' },
			},
		},
	},
	{
		name: 'run_cell',
		description: 'Run one active notebook cell by zero-based index and return its execution result and outputs.',
		inputSchema: {
			type: 'object',
			properties: { index: { type: 'integer', minimum: 0 } },
			required: ['index'],
		},
	},
	{
		name: 'insert_cell',
		description: 'Insert a code or markdown cell at a zero-based position in the active notebook.',
		inputSchema: {
			type: 'object',
			properties: {
				index: { type: 'integer', minimum: 0 },
				text: { type: 'string' },
				language: { type: 'string' },
				kind: { type: 'string', enum: ['code', 'markdown'] },
			},
			required: ['index', 'text'],
		},
	},
	{
		name: 'edit_cell',
		description: 'Replace the content of one active notebook cell by zero-based index.',
		inputSchema: {
			type: 'object',
			properties: {
				index: { type: 'integer', minimum: 0 },
				text: { type: 'string' },
				language: { type: 'string' },
				kind: { type: 'string', enum: ['code', 'markdown'] },
			},
			required: ['index', 'text'],
		},
	},
	{
		name: 'delete_cell',
		description: 'Delete one active notebook cell by zero-based index.',
		inputSchema: {
			type: 'object',
			properties: { index: { type: 'integer', minimum: 0 } },
			required: ['index'],
		},
	},
];
