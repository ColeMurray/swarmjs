// Filename: ./swarm/util.ts

import {format} from 'date-fns'; // For date formatting
import {FunctionDescriptor, ParameterSchema} from './types';

/**
 * Prints debug messages with a timestamp.
 * @param debug - Flag to enable or disable debugging.
 * @param args - Messages to print.
 */
export function debugPrint(debug: boolean, ...args: any[]): void {
    if (!debug) return;
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            return JSON.stringify(arg, null, 2);
        }
        return String(arg);
    }).join(' ');
    console.log(`\x1b[97m[\x1b[90m${timestamp}\x1b[97m]\x1b[90m ${message}\x1b[0m`);
}

/**
 * Recursively merges fields from the source object into the target object.
 * Handles arrays by replacing them instead of merging.
 * @param target - The target object.
 * @param source - The source object.
 */
export function mergeFields(target: any, source: any): void {
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (Array.isArray(value)) {
        // For arrays, replace the target's array with the source's array
        target[key] = value;
      } else if (typeof value === 'string') {
        // Initialize target[key] if undefined or not a string
        if (typeof target[key] !== 'string') {
          target[key] = '';
        }
        target[key] += value;
      } else if (value !== null && typeof value === 'object') {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        mergeFields(target[key], value);
      }
    }
  }
}

/**
 * Merges a delta chunk into the final response.
 * Specifically handles 'tool_calls' as separate entries to prevent duplication and incorrect merging.
 * @param finalResponse - The final response object.
 * @param delta - The delta chunk.
 */
export function mergeChunk(finalResponse: Record<string, any>, delta: Record<string, any>): void {
  // Remove 'role' to prevent overwriting
  delete delta.role;

  // Handle 'tool_calls' separately
  if ('tool_calls' in delta) {
    if (!Array.isArray(finalResponse.tool_calls)) {
      finalResponse.tool_calls = [];
    }

    delta.tool_calls.forEach((deltaToolCall: any) => {
      const index = deltaToolCall.index;

      // Ensure the target tool_call exists
      if (!finalResponse.tool_calls[index]) {
        finalResponse.tool_calls[index] = {};
      }

      // Merge the 'id' and 'type' if they exist
      if ('id' in deltaToolCall) {
        finalResponse.tool_calls[index].id = deltaToolCall.id;
      }
      if ('type' in deltaToolCall) {
        finalResponse.tool_calls[index].type = deltaToolCall.type;
      }

      // Merge the 'function' fields
      if ('function' in deltaToolCall) {
        if (!finalResponse.tool_calls[index].function) {
          finalResponse.tool_calls[index].function = {};
        }
        mergeFields(finalResponse.tool_calls[index].function, deltaToolCall.function);
      }
    });
  }

  // Merge other fields
  const deltaWithoutToolCalls = { ...delta };
  delete deltaWithoutToolCalls.tool_calls;
  mergeFields(finalResponse, deltaWithoutToolCalls);
}

/**
 * Converts a parameter schema to JSON Schema format.
 * @param param The parameter schema to convert
 * @returns The JSON Schema representation
 */
function parameterToJsonSchema(param: ParameterSchema): Record<string, any> {
  const schema: Record<string, any> = {
    type: param.type,
    description: param.description
  };

  // Handle array types
  if (param.type === 'array' && param.items) {
    schema.items = parameterToJsonSchema(param.items);
  }

  // Handle object types
  if (param.type === 'object' && param.properties) {
    schema.properties = Object.entries(param.properties).reduce(
      (acc, [key, prop]) => ({
        ...acc,
        [key]: parameterToJsonSchema(prop)
      }),
      {}
    );
  }

  // Handle enums
  if (param.enum) {
    schema.enum = param.enum;
  }

  return schema;
}

/**
 * Converts a function descriptor to JSON.
 * @param descriptor descriptor of the function
 * @returns 
 */
export function functionToJson(descriptor: FunctionDescriptor): Record<string, any> {
  return {
    type: 'function',
    function: {
      name: descriptor.name,
      description: descriptor.description,
      parameters: {
        type: 'object',
        properties: Object.entries(descriptor.parameters).reduce(
          (acc, [key, param]) => ({
            ...acc,
            [key]: parameterToJsonSchema(param)
          }),
          {}
        ),
        required: Object.entries(descriptor.parameters)
          .filter(([_, param]) => param.required)
          .map(([key]) => key),
      },
    },
  };
}

/**
 * Validates a value against a parameter schema.
 * Throws an error if validation fails.
 */
function validateValue(
    value: any,
    param: ParameterSchema,
    path: string = ''
): any {
    const expectedType = param.type.toLowerCase();
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    // Check basic type match
    if (expectedType !== actualType) {
        throw new Error(
            `Invalid type at '${path}': expected '${expectedType}', got '${actualType}'`
        );
    }

    // Handle array validation
    if (expectedType === 'array' && param.items) {
        return value.map((item: any, index: number) => 
            validateValue(item, param.items!, `${path}[${index}]`)
        );
    }

    // Handle object validation
    if (expectedType === 'object' && param.properties) {
        const validatedObj: Record<string, any> = {};
        
        // Check required properties
        const requiredProps = Object.entries(param.properties)
            .filter(([_, propSchema]) => propSchema.required)
            .map(([key]) => key);

        for (const required of requiredProps) {
            if (!(required in value)) {
                throw new Error(
                    `Missing required property at '${path ? path + '.' : ''}${required}'`
                );
            }
        }

        // Validate each property
        for (const [key, propValue] of Object.entries(value)) {
            const propSchema = param.properties[key];
            if (!propSchema) {
                // Skip validation for properties not in schema
                validatedObj[key] = propValue;
                continue;
            }
            validatedObj[key] = validateValue(
                propValue,
                propSchema,
                path ? `${path}.${key}` : key
            );
        }
        return validatedObj;
    }

    // Handle enum validation
    if (param.enum && !param.enum.includes(value)) {
        throw new Error(
            `Invalid value at '${path}': expected one of [${param.enum.join(', ')}], got '${value}'`
        );
    }

    return value;
}

/**
 * Validates the arguments against the function descriptor.
 * Throws an error if validation fails.
 */
export function validateArguments(
    args: any,
    descriptor: FunctionDescriptor
): Record<string, any> {
    const schema: ParameterSchema = {
        type: 'object',
        properties: descriptor.parameters,
        description: 'Root validation schema',
        required: false
    };

    try {
        return validateValue(args, schema);
    } catch (error: unknown) {
        throw new Error(
            `Validation failed for function '${descriptor.name}': ${(error as Error).message}`
        );
    }
}