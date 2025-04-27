// Filename: ./examples/streaming.ts
import { Swarm } from '../swarm/core';
import { Agent } from '../swarm/types';
import { RawResponsesStreamEvent, RunItemStreamEvent, AgentUpdatedStreamEvent, ResponseCompleteEvent } from '../swarm/stream_events';
import { ItemHelpers, ToolCallOutputItem } from '../swarm/items';

// Create a simple function to get the current time
function getCurrentTime(): string {
  const now = new Date();
  return now.toLocaleTimeString();
}

// Create a function to calculate a simple math operation
function calculate(args: Record<string, any>): string {
  const { operation, a, b } = args;
  let result: number;
  
  switch (operation) {
    case 'add':
      result = a + b;
      break;
    case 'subtract':
      result = a - b;
      break;
    case 'multiply':
      result = a * b;
      break;
    case 'divide':
      if (b === 0) throw new Error('Cannot divide by zero');
      result = a / b;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  
  return `The result of ${a} ${operation} ${b} is ${result}`;
}

// Example 1: Simple token-by-token streaming
async function tokenByTokenExample() {
  console.log('\n=== Example 1: Token-by-Token Streaming ===');
  
  // Initialize the Swarm
  const swarm = new Swarm();
  
  // Create a basic agent
  const agent = new Agent({
    name: 'BasicAgent',
    instructions: 'You are a helpful assistant. Keep your responses concise.',
    functions: [],
  });
  
  // Run the agent with streaming enabled
  const stream = await swarm.run({
    agent,
    messages: [{ role: 'user', content: 'Tell me a short joke about programming.' }],
    stream: true,
  });
  
  // Process the stream token by token
  
  // TypeScript needs us to check that stream is an AsyncIterable
  if (Symbol.asyncIterator in stream) {
    for await (const event of stream) {
      if (event.type === 'raw_response_event') {
        const rawEvent = event as RawResponsesStreamEvent;
        const content = rawEvent.data.choices[0]?.delta?.content || '';
        process.stdout.write(content);
      }
    }
    console.log('\n');
  }
}

// Example 2: Handling higher-level events
async function highLevelEventsExample() {
  console.log('\n=== Example 2: Higher-Level Events ===');
  
  // Initialize the Swarm
  const swarm = new Swarm();
  
  // Create an agent with tools
  const agent = new Agent({
    name: 'ToolsAgent',
    instructions: 'You are a helpful assistant with tools. When asked about the time, use the time tool. When asked to calculate something, use the calculate tool.',
    functions: [
      {
        name: 'getCurrentTime',
        func: getCurrentTime,
        descriptor: {
          name: 'getCurrentTime',
          description: 'Get the current time',
          parameters: {}
        }
      },
      {
        name: 'calculate',
        func: calculate,
        descriptor: {
          name: 'calculate',
          description: 'Perform a mathematical operation',
          parameters: {
            operation: {
              type: 'string',
              required: true,
              description: 'The operation to perform: add, subtract, multiply, divide'
            },
            a: {
              type: 'number',
              required: true,
              description: 'First operand'
            },
            b: {
              type: 'number',
              required: true,
              description: 'Second operand'
            }
          }
        }
      }
    ],
  });
  
  // Run the agent with streaming enabled
  const stream = await swarm.run({
    agent,
    messages: [
      { role: 'user', content: 'What time is it? Then calculate 15 * 7.' }
    ],
    stream: true,
  });
  
  // Process higher-level events
  if (Symbol.asyncIterator in stream) {
    for await (const event of stream) {
      switch (event.type) {
        case 'run_item_stream_event': {
          const itemEvent = event as RunItemStreamEvent;
          console.log(`Event: ${itemEvent.name}`);
          
          if (itemEvent.name === 'message_output_created') {
            console.log(`Message: ${ItemHelpers.extractTextContent(itemEvent.item.raw_item)}`);
          } 
          else if (itemEvent.name === 'tool_called') {
            const toolItem = itemEvent.item;
            console.log(`Tool called: ${toolItem.raw_item.function.name}`);
            console.log(`Arguments: ${toolItem.raw_item.function.arguments}`);
          }
          else if (itemEvent.name === 'tool_output') {
            const toolOutput = itemEvent.item as ToolCallOutputItem;
            console.log(`Tool output: ${toolOutput.output}`);
          }
          break;
        }
        case 'agent_updated_stream_event': {
          const agentEvent = event as AgentUpdatedStreamEvent;
          console.log(`Agent changed to: ${agentEvent.new_agent.name}`);
          break;
        }
        case 'response_complete_event': {
          const responseEvent = event as ResponseCompleteEvent;
          console.log('Response complete!');
          console.log(`Total messages: ${responseEvent.response.messages.length}`);
          console.log(`Total items: ${responseEvent.response.items.length}`);
          break;
        }
      }
    }
  }
}

// Example 3: Combined approach - both token streaming and events
async function combinedApproachExample() {
  console.log('\n=== Example 3: Combined Approach ===');
  
  // Initialize the Swarm
  const swarm = new Swarm();
  
  // Create an agent with tools
  const agent = new Agent({
    name: 'CombinedAgent',
    instructions: 'You are a helpful assistant. When asked to calculate, use the calculate tool.',
    functions: [
      {
        name: 'calculate',
        func: calculate,
        descriptor: {
          name: 'calculate',
          description: 'Perform a mathematical operation',
          parameters: {
            operation: {
              type: 'string',
              required: true,
              description: 'The operation to perform: add, subtract, multiply, divide'
            },
            a: {
              type: 'number',
              required: true,
              description: 'First operand'
            },
            b: {
              type: 'number',
              required: true,
              description: 'Second operand'
            }
          }
        }
      }
    ],
  });
  
  // Run the agent with streaming enabled
  const stream = await swarm.run({
    agent,
    messages: [
      { role: 'user', content: 'Can you calculate 42 * 18?' }
    ],
    stream: true,
  });
  
  // Combined approach:
  // - Stream tokens for assistant messages
  // - Log events for tool calls
  if (Symbol.asyncIterator in stream) {
    let messageInProgress = false;
    
    for await (const event of stream) {
      switch (event.type) {
        case 'raw_response_event': {
          const rawEvent = event as RawResponsesStreamEvent;
          // Only process content when a message is in progress
          if (messageInProgress) {
            const content = rawEvent.data.choices[0]?.delta?.content || '';
            if (content) process.stdout.write(content);
          }
          break;
        }
        case 'run_item_stream_event': {
          const itemEvent = event as RunItemStreamEvent;
          if (itemEvent.name === 'message_output_created') {
            console.log('\n[Assistant is responding...]');
            messageInProgress = true;
          } 
          else if (itemEvent.name === 'tool_called') {
            messageInProgress = false;
            console.log('\n');
            console.log(`[Tool called: ${itemEvent.item.raw_item.function.name}]`);
          }
          else if (itemEvent.name === 'tool_output') {
            const toolOutput = itemEvent.item as ToolCallOutputItem;
            console.log(`[Tool result: ${toolOutput.output}]`);
          }
          break;
        }
        case 'response_complete_event': {
          const responseEvent = event as ResponseCompleteEvent;
          console.log('\n[Response complete]');
          console.log(`Response: ${JSON.stringify(responseEvent.response)}`);
          break;
        }
      }
    }
  }
}

// Run all examples
async function runAllExamples() {
  try {
    await tokenByTokenExample();
    await highLevelEventsExample();
    await combinedApproachExample();
    console.log('\nAll examples completed successfully!');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Execute the examples
runAllExamples(); 