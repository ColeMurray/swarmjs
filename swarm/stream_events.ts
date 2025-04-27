// Filename: ./swarm/stream_events.ts

import { ChatCompletionChunk } from 'openai/resources';
import { Agent, Response } from './types';
import { RunItem } from './items';

/**
 * Streaming event from the LLM. These are 'raw' events directly passed through
 * from the LLM.
 */
export interface RawResponsesStreamEvent {
  /** The type of the event */
  type: 'raw_response_event';
  /** The raw responses streaming event from the LLM */
  data: ChatCompletionChunk;
}

/**
 * Streaming events that wrap a RunItem. As the agent processes the LLM response, it will
 * generate these events for new messages, tool calls, tool outputs, handoffs, etc.
 */
export interface RunItemStreamEvent {
  /** The type of the event */
  type: 'run_item_stream_event';
  /** The name of the event */
  name: 'message_output_created' | 'tool_called' | 'tool_output' | 'handoff_requested' | 'handoff_occurred';
  /** The item that was created */
  item: RunItem;
}

/**
 * Event that notifies that there is a new agent running.
 */
export interface AgentUpdatedStreamEvent {
  /** The type of the event */
  type: 'agent_updated_stream_event';
  /** The new agent */
  new_agent: Agent;
}

/**
 * Response completion event that indicates the run is complete.
 */
export interface ResponseCompleteEvent {
  /** The type of the event */
  type: 'response_complete_event';
  /** The final response object with all messages and items */
  response: Response;
}

/**
 * A streaming event from an agent.
 */
export type StreamEvent = RawResponsesStreamEvent | RunItemStreamEvent | AgentUpdatedStreamEvent | ResponseCompleteEvent; 