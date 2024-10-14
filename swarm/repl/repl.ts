// Filename: ./swarm/repl.ts

import * as readline from 'readline';
import { Swarm } from '../core';
import { Response } from '../types';

/**
 * Processes and prints a streaming response from Swarm.
 * @param response - The streaming response.
 * @returns The final Response object.
 */
function processAndPrintStreamingResponse(response: AsyncIterable<any>): Promise<Response> {
    return new Promise((resolve, reject) => {
        let content = '';
        let lastSender = '';
        let buffer = '';

        (async () => {
            try {
                for await (const chunk of response) {
                    if ('sender' in chunk) {
                        lastSender = chunk.sender;
                    }
                    if ('content' in chunk && chunk.content !== null) {
                        if (!content && lastSender) {
                            buffer += `\x1b[94m${lastSender}:\x1b[0m `;
                            lastSender = '';
                        }
                        buffer += chunk.content;
                        content += chunk.content;
                    }
                    if ('tool_calls' in chunk && chunk.tool_calls !== null) {
                        for (const toolCall of chunk.tool_calls) {
                            const func = toolCall.function;
                            const name = func.name;
                            if (!name) continue;
                            buffer += `\x1b[94m${lastSender}: \x1b[95m${name}\x1b[0m()\n`;
                        }
                    }
                    if ('delim' in chunk && chunk.delim === 'end' && content) {
                        // Print the buffered content
                        console.log(buffer);
                        buffer = '';
                        content = '';
                    }
                    if ('response' in chunk) {
                        if (buffer) {
                            console.log(buffer);
                        }
                        resolve(chunk.response);
                        break;
                    }
                }
            } catch (error) {
                reject(error);
            }
        })();
    });
}
/**
 * Pretty prints assistant messages.
 * @param messages - The array of messages to print.
 */
function prettyPrintMessages(messages: any[]): void {
    for (const message of messages) {
        if (message.role !== 'assistant') continue;

        // Print agent name in blue
        console.log(`\x1b[94m${message.sender}\x1b[0m: `);

        // Print response, if any
        if (message.content) {
            console.log(message.content);
        }

        // Print tool calls in purple, if any
        const toolCalls = message.tool_calls || [];
        if (toolCalls.length > 1) {
            console.log();
        }
        for (const toolCall of toolCalls) {
            const func = toolCall.function;
            const name = func.name;
            const args = func.arguments;
            const argStr = JSON.stringify(JSON.parse(args)).replace(/:/g, '=');
            console.log(`\x1b[95m${name}\x1b[0m(${argStr.slice(1, -1)})`);
        }
    }
}

/**
 * Runs the demo loop for the Swarm CLI.
 * @param startingAgent - The initial agent.
 * @param contextVariables - Optional context variables.
 * @param stream - Whether to stream responses.
 * @param debug - Whether to enable debug mode.
 */
export async function runDemoLoop(
    startingAgent: any,
    contextVariables: Record<string, any> = {},
    stream = false,
    debug = false
): Promise<void> {
    const client = new Swarm();
    console.log('Starting Swarm CLI 🐝');

    const messages: any[] = [];
    let agent = startingAgent;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\x1b[90mUser\x1b[0m: ',
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
        const userInput = line.trim();
        messages.push({ role: 'user', content: userInput });

        try {
            const response = await client.run({
                agent,
                messages,
                context_variables: contextVariables,
                stream,
                debug,
            });

            if (stream) {
                const streamedResponse = await processAndPrintStreamingResponse(response as AsyncIterable<any>);
                messages.push(...streamedResponse.messages);
                agent = streamedResponse.agent;
            } else {
                const completionResponse = response as Response;
                prettyPrintMessages(completionResponse.messages);
                messages.push(...completionResponse.messages);
                agent = completionResponse.agent;
            }
        } catch (error) {
            console.error('Error:', error);
        }

        rl.prompt();
    }).on('close', () => {
        console.log('Exiting Swarm CLI.');
        process.exit(0);
    });
}
