// Filename: ./swarm/types.ts

/**
 * Represents a function that an agent can perform.
 */


export interface FunctionDescriptor {
  name: string;
  description: string;
  parameters: Record<string, { type: string; required: boolean, description: string }>;
}

export interface AgentFunction {
  name: string;
  func: (args: Record<string, any>) => string | Agent | Record<string, any>;
  descriptor: FunctionDescriptor;
}

/**
 * Represents an agent interacting with the Swarm.
 */
export class Agent {
  name: string;
  model: string;
  instructions: string | ((contextVariables: Record<string, any>) => string);
  functions: AgentFunction[];
  tool_choice?: string;
  parallel_tool_calls: boolean;

  constructor(params: Partial<Agent> = {}) {
    this.name = params.name || 'Agent';
    this.model = params.model || 'gpt-4o';
    this.instructions = params.instructions || 'You are a helpful agent.';
    this.functions = params.functions || [];
    this.tool_choice = params.tool_choice;
    this.parallel_tool_calls = params.parallel_tool_calls !== undefined ? params.parallel_tool_calls : true;
  }
}

/**
 * Represents the response from the Swarm.
 */
export class Response {
  messages: Array<any>;
  agent?: Agent;
  context_variables: Record<string, any>;

  constructor(params: Partial<Response> = {}) {
    this.messages = params.messages || [];
    this.agent = params.agent;
    this.context_variables = params.context_variables || {};
  }
}

/**
 * Represents the result of a function executed by an agent.
 */
export class Result {
  value: string;
  agent?: Agent;
  context_variables: Record<string, any>;

  constructor(params: Partial<Result> = {}) {
    this.value = params.value || '';
    this.agent = params.agent;
    this.context_variables = params.context_variables || {};
  }
}

/**
 * Represents a function callable by the agent.
 */
export class ToolFunction {
  arguments: string;
  name: string;

  constructor(params: Partial<ToolFunction> = {}) {
    this.arguments = params.arguments || '';
    this.name = params.name || '';
  }
}
