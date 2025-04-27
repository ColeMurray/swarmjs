// Filename: ./swarm/types.ts

/**
 * Represents a function that an agent can perform.
 */

export interface ParameterSchema {
  type: string;
  required: boolean;
  description: string;
  items?: ParameterSchema;  // For array types
  properties?: Record<string, ParameterSchema>;  // For object types
  enum?: any[];  // For enumerated values
}

export interface FunctionDescriptor {
  name: string;
  description: string;
  parameters: Record<string, ParameterSchema>;
}

export interface AgentFunction {
  name: string;
  func: (args: Record<string, any>) => string | Agent | Record<string, any> | Promise<string | Agent | Record<string, any>>;
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
 * Forward declaration of RunItem to avoid circular dependencies
 */
export type RunItem = any;

/**
 * Represents the response from the Swarm.
 */
export class Response {
  /** Messages exchanged during the run */
  messages: Array<any>;
  
  /** The final agent that produced the response */
  agent?: Agent;
  
  /** Context variables that were updated during the run */
  context_variables: Record<string, any>;
  
  /** Items generated during the run (messages, tool calls, etc) */
  items: RunItem[];

  constructor(params: Partial<Response> = {}) {
    this.messages = params.messages || [];
    this.agent = params.agent;
    this.context_variables = params.context_variables || {};
    this.items = params.items || [];
  }

  /**
   * Returns all message items from the run
   */
  getMessageItems(): RunItem[] {
    return this.items.filter(item => item.type === 'message_output_item');
  }

  /**
   * Returns all tool call items from the run
   */
  getToolCallItems(): RunItem[] {
    return this.items.filter(item => item.type === 'tool_call_item');
  }

  /**
   * Returns all tool output items from the run
   */
  getToolOutputItems(): RunItem[] {
    return this.items.filter(item => item.type === 'tool_call_output_item');
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
