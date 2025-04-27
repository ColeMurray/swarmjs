// Filename: ./swarm/core.ts

import { OpenAI} from 'openai';
import { cloneDeep } from 'lodash';
import { functionToJson, debugPrint, mergeChunk, validateArguments } from './util';
import {
    Agent,
    AgentFunction,
    ToolFunction as ToolFunction,
    Response,
    Result,
} from './types';
import { ChatCompletion, ChatCompletionMessageToolCall, ChatCompletionChunk } from 'openai/resources';
import { Stream } from 'openai/streaming';
import { Langfuse } from 'langfuse';
import {
    StreamEvent,
    RawResponsesStreamEvent,
    RunItemStreamEvent,
    AgentUpdatedStreamEvent,
    ResponseCompleteEvent
} from './stream_events';
import {
    RunItem,
    MessageOutputItem,
    ToolCallItem,
    ToolCallOutputItem
} from './items';

const CTX_VARS_NAME = 'context_variables';

interface SwarmRunOptions {
    agent: Agent;
    messages: Array<any>;
    context_variables?: Record<string, any>;
    model_override?: string;
    stream?: boolean;
    debug?: boolean;
    max_turns?: number;
    execute_tools?: boolean;
    max_tokens?: number;
}

interface SwarmConfig {
    apiKey?: string;
    langfuse?: {
        publicKey: string;
        secretKey: string;
        baseUrl?: string;
    };
}

export class Swarm {
    private client: OpenAI;
    private langfuse?: Langfuse;

    constructor(config?: SwarmConfig) {
        if (config?.apiKey) {
            this.client = new OpenAI({ apiKey: config.apiKey });
        } else {
            // Default configuration
            this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }

        // Initialize Langfuse if config is provided
        if (config?.langfuse) {
            this.langfuse = new Langfuse({
                publicKey: config.langfuse.publicKey,
                secretKey: config.langfuse.secretKey,
                baseUrl: config.langfuse.baseUrl,
            });
        }
    }

    private async getChatCompletion(
        agent: Agent,
        history: Array<any>,
        context_variables: Record<string, any>,
        model_override?: string,
        stream?: false,
        debug?: boolean,
        max_tokens?: number,
        trace?: any
    ): Promise<ChatCompletion>;
    
    private async getChatCompletion(
        agent: Agent,
        history: Array<any>,
        context_variables: Record<string, any>,
        model_override?: string,
        stream?: true,
        debug?: boolean,
        max_tokens?: number,
        trace?: any
    ): Promise<Stream<ChatCompletionChunk>>;
    
    private async getChatCompletion(
        agent: Agent,
        history: Array<any>,
        context_variables: Record<string, any>,
        model_override = '',
        stream = false,
        debug = false,
        max_tokens?: number,
        trace?: any
    ): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
        const ctxVars = { ...context_variables };
        const instructions = typeof agent.instructions === 'function' ? agent.instructions(ctxVars) : agent.instructions;
        const messages = [
            { role: 'system', content: instructions },
            ...history,
        ];
        debugPrint(debug, 'Getting chat completion for...', messages);

        const tools = agent.functions.map(func => functionToJson(func.descriptor));
        // Hide context_variables from model
        tools.forEach(tool => {
            delete tool.function.parameters.properties[CTX_VARS_NAME];
            const requiredIndex = tool.function.parameters.required.indexOf(CTX_VARS_NAME);
            if (requiredIndex !== -1) {
                tool.function.parameters.required.splice(requiredIndex, 1);
            }
        });

        const createParams: any = {
            model: model_override || agent.model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: agent.tool_choice,
            stream,
        };

        if (max_tokens !== undefined) {
            createParams.max_tokens = max_tokens;
        }

        let generation;
        if (this.langfuse && trace) {
            console.log('Langfuse is enabled, generating generation');
            generation = trace.generation({
                name: 'chat-completion',
                model: createParams.model,
                modelParameters: {
                    max_tokens: max_tokens,
                    tool_choice: agent.tool_choice,
                },
                input: messages,
            });
        }

        try {
            const completion = await this.client.chat.completions.create(createParams);
            
            if (generation) {
                generation.end({
                    output: stream ? 'streaming response' : completion,
                });
            }
            
            return completion;
        } catch (error) {
            if (generation) {
                generation.end({
                    output: error,
                    level: 'ERROR',
                    statusMessage: (error as Error).message,
                });
            }
            throw error;
        }
    }

    private handleFunctionResult(result: any, debug: boolean): Result {
        if (result instanceof Result) {
            return result;
        } else if (result instanceof Agent) {
            return new Result({
                value: JSON.stringify({ assistant: result.name }),
                agent: result,
            });
        } else {
            try {
                return new Result({ value: String(result) });
            } catch (e: any) {
                const errorMessage = `Failed to cast response to string: ${result}. Make sure agent functions return a string or Result object. Error: ${e.message}`;
                debugPrint(debug, errorMessage);
                throw new TypeError(errorMessage);
            }
        }
    }

    private async handleToolCalls(
        tool_calls: ChatCompletionMessageToolCall[],
        functions: AgentFunction[],
        context_variables: Record<string, any>,
        debug: boolean,
        trace?: any
    ): Promise<[Response, ToolCallOutputItem[]]> {
        const function_map: Record<string, AgentFunction> = {};
        functions.forEach(func => {
            function_map[func.name] = func;
        });

        const partialResponse = new Response({
            messages: [],
            agent: undefined,
            context_variables: {},
            items: []
        });
        
        const toolOutputItems: ToolCallOutputItem[] = [];

        // Process tool calls sequentially to maintain order
        for (const tool_call of tool_calls) {
            const name = tool_call.function.name;
            let toolSpan;
            
            if (this.langfuse && trace) {
                toolSpan = trace.span({
                    name: `tool-${name}`,
                    input: {
                        arguments: tool_call.function.arguments,
                        id: tool_call.id,
                        type: tool_call.type
                    }
                });
            }

            if (!(name in function_map)) {
                debugPrint(debug, `Tool ${name} not found in function map.`);
                const errorMessage = `Error: Tool ${name} not found.`;
                if (toolSpan) {
                    toolSpan.end({
                        output: errorMessage,
                        level: 'ERROR',
                        statusMessage: 'Tool not found'
                    });
                }
                
                const toolOutput = new ToolCallOutputItem({
                    agent: partialResponse.agent!,
                    raw_item: {
                        id: tool_call.id,
                        type: tool_call.type,
                        function: {
                            name: name,
                            output: errorMessage
                        }
                    },
                    output: errorMessage
                });
                
                toolOutputItems.push(toolOutput);
                
                partialResponse.messages.push({
                    role: 'tool',
                    tool_call_id: tool_call.id,
                    tool_name: name,
                    content: errorMessage,
                });
                continue;
            }

            const args = JSON.parse(tool_call.function.arguments);
            console.log(`Processing tool call: ${name} with arguments`, JSON.stringify(args));
            debugPrint(debug, `Processing tool call: ${name} with arguments`, JSON.stringify(args));

            const func = function_map[name];
            // Pass context_variables to agent functions if required
            if (func.func.length > 0 && func.toString().includes(CTX_VARS_NAME)) {
                args[CTX_VARS_NAME] = context_variables;
            }

            let validatedArgs: any;
            try {
                validatedArgs = validateArguments(args, func.descriptor);
            } catch (e: any) {
                const errorMessage = `Error: ${e.message}`;
                debugPrint(debug, `Argument validation failed for function ${name}: ${e.message}`);
                if (toolSpan) {
                    toolSpan.end({
                        output: errorMessage,
                        level: 'ERROR',
                        statusMessage: 'Argument validation failed'
                    });
                }
                
                const toolOutput = new ToolCallOutputItem({
                    agent: partialResponse.agent!,
                    raw_item: {
                        id: tool_call.id,
                        type: tool_call.type,
                        function: {
                            name: name,
                            output: errorMessage
                        }
                    },
                    output: errorMessage
                });
                
                toolOutputItems.push(toolOutput);
                
                partialResponse.messages.push({
                    role: 'tool',
                    tool_call_id: tool_call.id,
                    tool_name: name,
                    content: errorMessage,
                });
                continue;
            }

            debugPrint(debug, `Processing tool call: ${name} with arguments`, JSON.stringify(validatedArgs));

            try {
                // Handle both sync and async functions
                const raw_result = await Promise.resolve(func.func(validatedArgs));
                debugPrint(debug, `Raw result: ${JSON.stringify(raw_result)}`);

                const result: Result = this.handleFunctionResult(raw_result, debug);
                if (toolSpan) {
                    toolSpan.end({
                        output: result,
                        level: 'INFO',
                        statusMessage: 'Success',
                        metadata: {
                            resultType: result instanceof Result ? 'Result' : typeof result
                        }
                    });
                }
                
                const toolOutput = new ToolCallOutputItem({
                    agent: partialResponse.agent!,
                    raw_item: {
                        id: tool_call.id,
                        type: tool_call.type,
                        function: {
                            name: name,
                            output: result.value
                        }
                    },
                    output: result.value
                });
                
                toolOutputItems.push(toolOutput);
                
                partialResponse.messages.push({
                    role: 'tool',
                    tool_call_id: tool_call.id,
                    tool_name: name,
                    content: result.value,
                });
                Object.assign(partialResponse.context_variables, result.context_variables);
                if (result.agent) {
                    partialResponse.agent = result.agent;
                }
            } catch (error: any) {
                debugPrint(debug, `Error executing function ${name}: ${error.message}`);
                if (toolSpan) {
                    toolSpan.end({
                        output: error.message,
                        level: 'ERROR',
                        statusMessage: 'Execution failed',
                        metadata: {
                            errorType: error.name,
                            stack: error.stack
                        }
                    });
                }
                
                const toolOutput = new ToolCallOutputItem({
                    agent: partialResponse.agent!,
                    raw_item: {
                        id: tool_call.id,
                        type: tool_call.type,
                        function: {
                            name: name,
                            output: `Error: ${error.message}`
                        }
                    },
                    output: `Error: ${error.message}`
                });
                
                toolOutputItems.push(toolOutput);
                
                partialResponse.messages.push({
                    role: 'tool',
                    tool_call_id: tool_call.id,
                    tool_name: name,
                    content: `Error: ${error.message}`,
                });
            }
        }

        return [partialResponse, toolOutputItems];
    }

    async *runAndStream(options: SwarmRunOptions): AsyncIterable<StreamEvent> {
        const {
            agent,
            messages,
            context_variables = {},
            model_override,
            debug = false,
            max_turns = Infinity,
            execute_tools = true,
            max_tokens,
        } = options;

        let trace;
        if (this.langfuse) {
            console.log('Langfuse is enabled');
            trace = this.langfuse.trace({
                name: 'swarm-execution',
                metadata: {
                    agent: agent.name,
                    model: model_override || agent.model,
                    stream: true,
                    max_turns,
                    execute_tools,
                },
            });
        }

        let active_agent = agent;
        const ctx_vars = cloneDeep(context_variables);
        const history = cloneDeep(messages);
        const init_len = history.length;
        const run_items: RunItem[] = [];

        try {
            let last_agent = active_agent;
            
            while ((history.length - init_len) < max_turns) {
                const message: any = {
                    content: '',
                    sender: agent.name,
                    role: 'assistant',
                    function_call: null,
                    tool_calls: {},
                };

                // Get completion with current history and agent
                const completion = await this.getChatCompletion(
                    active_agent,
                    history,
                    ctx_vars,
                    model_override,
                    true,
                    debug,
                    max_tokens,
                    trace
                );

                // If the agent has changed, emit an agent updated event
                if (active_agent !== last_agent) {
                    const agentEvent: AgentUpdatedStreamEvent = {
                        type: 'agent_updated_stream_event',
                        new_agent: active_agent
                    };
                    yield agentEvent;
                    last_agent = active_agent;
                }

                // Process each chunk of the completion
                for await (const chunk of completion) {
                    debugPrint(debug, 'Received chunk:', JSON.stringify(chunk));
                    
                    // Emit raw response event
                    const rawEvent: RawResponsesStreamEvent = {
                        type: 'raw_response_event',
                        data: chunk
                    };
                    yield rawEvent;
                    
                    const delta = chunk.choices[0].delta;
                    if (chunk.choices[0].delta.role === 'assistant') {
                        // @ts-ignore
                        delta.sender = active_agent.name;
                    }
                    
                    delete delta.role;
                    // @ts-ignore
                    delete delta.sender;
                    mergeChunk(message, delta);
                }

                message.tool_calls = Object.values(message.tool_calls);
                if (message.tool_calls.length === 0) {
                    message.tool_calls = null;
                }
                debugPrint(debug, 'Received completion:', message);
                history.push(message);
                
                // Create a message output item
                const messageItem = new MessageOutputItem({
                    agent: active_agent,
                    raw_item: message
                });
                run_items.push(messageItem);
                
                // Emit message output created event
                const messageEvent: RunItemStreamEvent = {
                    type: 'run_item_stream_event',
                    name: 'message_output_created',
                    item: messageItem
                };
                yield messageEvent;

                // If no tool calls or not executing tools, break out of the loop
                if (!message.tool_calls || !execute_tools) {
                    debugPrint(debug, 'Ending turn.');
                    break;
                }

                // Convert tool_calls to objects and emit tool call events
                const tool_calls: ChatCompletionMessageToolCall[] = message.tool_calls.map((tc: any) => {
                    const func = new ToolFunction({
                        arguments: tc.function.arguments,
                        name: tc.function.name,
                    });
                    return {
                        id: tc.id,
                        function: func,
                        type: tc.type,
                    };
                });
                
                // Process each tool call
                for (const tc of tool_calls) {
                    const toolCallItem = new ToolCallItem({
                        agent: active_agent,
                        raw_item: tc
                    });
                    run_items.push(toolCallItem);
                    
                    // Emit tool called event
                    const toolEvent: RunItemStreamEvent = {
                        type: 'run_item_stream_event',
                        name: 'tool_called',
                        item: toolCallItem
                    };
                    yield toolEvent;
                }

                // Handle function calls, updating context_variables and switching agents
                const [partial_response, toolOutputItems] = await this.handleToolCalls(
                    tool_calls, 
                    active_agent.functions, 
                    ctx_vars, 
                    debug, 
                    trace
                );
                
                // Add the tool output items to the run items
                run_items.push(...toolOutputItems);
                
                // Emit tool output events
                for (const toolOutput of toolOutputItems) {
                    const toolOutputEvent: RunItemStreamEvent = {
                        type: 'run_item_stream_event',
                        name: 'tool_output',
                        item: toolOutput
                    };
                    yield toolOutputEvent;
                }
                
                history.push(...partial_response.messages);
                Object.assign(ctx_vars, partial_response.context_variables);
                
                // If agent changed, prepare to emit agent updated event on next loop
                if (partial_response.agent) {
                    active_agent = partial_response.agent;
                }
            }

            // Create final response
            const response = new Response({
                messages: history.slice(init_len),
                agent: active_agent,
                context_variables: ctx_vars,
                items: run_items
            });

            if (trace) {
                trace.update({
                    output: response,
                });
            }

            // Emit response complete event
            const responseEvent: ResponseCompleteEvent = {
                type: 'response_complete_event',
                response
            };
            yield responseEvent;
            
        } catch (error) {
            if (trace) {
                trace.update({
                    output: error,
                });
            }
            throw error;
        }
    }
    
    async run(
        options: SwarmRunOptions
    ): Promise<Response | AsyncIterable<StreamEvent>> {
        const {
            agent,
            messages,
            context_variables = {},
            model_override,
            stream = false,
            debug = false,
            max_turns = Infinity,
            execute_tools = true,
            max_tokens,
        } = options;

        let trace;
        if (this.langfuse) {
            console.log('Langfuse is enabled');
            trace = this.langfuse.trace({
                name: 'swarm-execution',
                metadata: {
                    agent: agent.name,
                    model: model_override || agent.model,
                    stream,
                    max_turns,
                    execute_tools,
                },
            });
        }

        if (stream) {
            return this.runAndStream({
                agent,
                messages,
                context_variables,
                model_override,
                debug,
                max_turns,
                execute_tools,
                max_tokens,
            });
        }

        let active_agent = agent;
        const ctx_vars = cloneDeep(context_variables);
        const history = cloneDeep(messages);
        const init_len = history.length;
        const run_items: RunItem[] = [];

        try {
            while ((history.length - init_len) < max_turns && active_agent) {
                // Get completion with current history and agent
                const completion: ChatCompletion = await this.getChatCompletion(
                    active_agent,
                    history,
                    ctx_vars,
                    model_override,
                    false,
                    debug,
                    max_tokens,
                    trace
                );

                const messageData = completion.choices[0].message;
                debugPrint(debug, 'Received completion:', messageData);
                const message: any = { ...messageData, sender: active_agent.name };
                history.push(message);
                
                // Create message item
                const messageItem = new MessageOutputItem({
                    agent: active_agent,
                    raw_item: message
                });
                run_items.push(messageItem);

                if (!message.tool_calls || !execute_tools) {
                    debugPrint(debug, 'Ending turn.');
                    break;
                }
                
                // Create tool call items
                for (const tc of message.tool_calls) {
                    const toolCallItem = new ToolCallItem({
                        agent: active_agent,
                        raw_item: tc
                    });
                    run_items.push(toolCallItem);
                }

                // Handle function calls, updating context_variables and switching agents
                const [partial_response, toolOutputItems] = await this.handleToolCalls(
                    message.tool_calls,
                    active_agent.functions,
                    ctx_vars,
                    debug,
                    trace
                );
                
                // Add tool output items
                run_items.push(...toolOutputItems);
                
                history.push(...partial_response.messages);
                Object.assign(ctx_vars, partial_response.context_variables);
                if (partial_response.agent) {
                    active_agent = partial_response.agent;
                }
            }

            const response = new Response({
                messages: history.slice(init_len),
                agent: active_agent,
                context_variables: ctx_vars,
                items: run_items
            });

            if (trace) {
                trace.update({
                    output: response,
                });
            }

            return response;
        } catch (error) {
            if (trace) {
                trace.update({
                    output: error,
                });
            }
            throw error;
        }
    }

    async shutdown() {
        if (this.langfuse) {
            await this.langfuse.shutdownAsync();
        }
    }
}
