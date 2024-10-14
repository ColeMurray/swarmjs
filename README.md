# SwarmJS-Node

[![npm version](https://badge.fury.io/js/swarmjs-node.svg)](https://badge.fury.io/js/swarmjs-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Build Status](https://github.com/ColeMurray/swarmjs/actions/workflows/ci.yaml/badge.svg)](https://github.com/ColeMurray/swarmjs/actions/workflows/ci.yaml)

SwarmJS-Node is a TypeScript library implementation that `o1-mini` generated from OpenAI's Swarm repository.

## 🚀 Features

- **Agent Management:** Define and manage multiple agents with distinct behaviors and functions.
- **Function Calls:** Extend agent capabilities by integrating custom functions.
- **Streaming Responses:** Handle and display streaming responses from the Swarm API.
- **Debugging:** Enable debug mode for detailed logging and troubleshooting.
- **TypeScript Support:** Fully typed library for enhanced developer experience and type safety.
- **Environment Variable Management:** Securely handle sensitive information using environment variables.

## 📦 Installation

Ensure you have [Node.js](https://nodejs.org/) installed. Then, install `swarmjs-node` via npm:

```bash
npm install swarmjs-node
```

Or using [pnpm](https://pnpm.io/):

```bash
pnpm add swarmjs-node
```

## 📝 Prerequisites

- **OpenAI API Key:** You'll need an OpenAI API key to interact with the Swarm API. Sign up at [OpenAI](https://platform.openai.com/) if you haven't already.

## 🏁 Quick Start

Below is a simple example demonstrating how to initialize the Swarm client, define agents with custom functions, and run a demo loop.

### 🔧 Setup

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/ColeMurray/swarmjs.git
   cd swarmjs
   ```

2. **Install Dependencies:**

   The project uses `pnpm`. If you don't have it installed, you can install it globally:

   ```bash
   npm install -g pnpm
   ```

   Then, install the project dependencies:

   ```bash
   pnpm install
   ```

3. **Build the Project:**

   Compile the TypeScript code to JavaScript:

   ```bash
   pnpm run build
   ```

4. **Configure Environment Variables:**

   Create a `.env` file in the root directory and add your OpenAI API key:

   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```

   **Note:** Ensure that `.env` is listed in your `.gitignore` to prevent accidental commits of sensitive information.

### 📂 Example Usage

An example script is provided in the `examples` directory. Here's how to set it up and run it.

#### **Example File: `examples/main.ts`**

```typescript
// Filename: examples/main.ts

import { Agent, AgentFunction } from '../swarm';
import { runDemoLoop } from '../swarm/repl';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Define an addition function
const addFunction: AgentFunction = {
    name: 'add',
    func: ({ a, b }) => {
        return (a + b).toString();
    },
    descriptor: {
        name: 'add',
        description: 'Adds two numbers together.',
        parameters: {
            a: { type: 'number', required: true, description: 'The first number to add.' },
            b: { type: 'number', required: true, description: 'The second number to add.' },
        },
    },
};

// Define a subtraction function
const subFunction: AgentFunction = {
    name: 'sub',
    func: ({ a, b }) => {
        return (a - b).toString();
    },
    descriptor: {
        name: 'sub',
        description: 'Subtracts two numbers.',
        parameters: {
            a: { type: 'number', required: true, description: 'The first number.' },
            b: { type: 'number', required: true, description: 'The second number.' },
        },
    },
};

// Define a function to transfer to another agent
const transferToHaikuAgent: AgentFunction = {
    name: 'transfer_to_haiku_agent',
    func: () => {
        return agentB;
    },
    descriptor: {
        name: 'transfer_to_haiku_agent',
        description: 'Transfers the conversation to the Haiku Agent.',
        parameters: {},
    },
};

// Initialize a Haiku Agent
const agentB = new Agent({
    name: 'HaikuAgent',
    model: 'gpt-4o-mini',
    instructions: 'You only respond in haikus.',
});

// Initialize the Helper Agent with functions
const agent = new Agent({
    name: 'HelperAgent',
    model: 'gpt-4o-mini',
    instructions: 'You are a helpful assistant.',
    functions: [transferToHaikuAgent, addFunction, subFunction],
});

// Run the demo loop
runDemoLoop(agent, undefined, true, true).catch(error => {
    console.error('Error running demo loop:', error);
});
```

#### **Running the Example**

1. **Ensure the Project is Built:**

   ```bash
   pnpm run build
   ```

2. **Run the Example Script:**

   ```bash
   pnpm run start:example
   ```

   **Expected Output:**

   ```
   Starting Swarm CLI 🐝
   User: Hello
   HelperAgent: Hello! How can I assist you today?
   User: Add 5 and 3
   HelperAgent: The result of adding 5 and 3 is 8.
   User: Subtract 10 from 15
   HelperAgent: The result of subtracting 10 from 15 is 5.
   User: Exit
   Exiting Swarm CLI.
   ```

   *Note: The actual responses may vary based on the implementation and interactions with the OpenAI API.*

## 📚 Detailed Examples

For more comprehensive examples and advanced use cases, refer to the [examples](./examples) directory in the repository. You can modify these examples to suit your specific needs or to explore additional functionalities provided by SwarmJS-Node.

## 🧰 Usage Guide

### 📦 Importing the Library

```typescript
import { Swarm, Agent, AgentFunction } from 'swarmjs-node';
```

### 🛠 Defining Agent Functions

Agent functions extend the capabilities of your agents by allowing them to perform specific tasks.

```typescript
const multiplyFunction: AgentFunction = {
    name: 'multiply',
    func: ({ a, b }) => {
        return (a * b).toString();
    },
    descriptor: {
        name: 'multiply',
        description: 'Multiplies two numbers.',
        parameters: {
            a: { type: 'number', required: true, description: 'The first number.' },
            b: { type: 'number', required: true, description: 'The second number.' },
        },
    },
};
```

### 🏃 Running the Demo Loop

The `runDemoLoop` function initializes the interactive CLI for engaging with the Swarm API.

```typescript
import { runDemoLoop } from 'swarmjs-node';

const agent = new Agent({
    name: 'CalculatorAgent',
    model: 'gpt-4o-mini',
    instructions: 'You are a calculator agent that can perform basic arithmetic operations.',
    functions: [addFunction, subFunction, multiplyFunction],
});

runDemoLoop(agent, undefined, true, true).catch(error => {
    console.error('Error running demo loop:', error);
});
```

## 🧩 API Reference

Comprehensive API documentation is available [here](./docs). This includes detailed descriptions of classes, methods, and interfaces provided by SwarmJS-Node.

## 🛡 Security

- **API Keys:** Ensure that your OpenAI API key is kept secure. Do not commit your `.env` file or API keys to version control. Use environment variables to manage sensitive information.
- **Dependencies:** Regularly update dependencies to patch any known vulnerabilities.

## 🧪 Testing

SwarmJS-Node includes a testing setup using [Jest](https://jestjs.io/). To run the tests:

1. **Install Development Dependencies:**

   ```bash
   pnpm install
   ```

2. **Run Tests:**

   ```bash
   pnpm run test
   ```

3. **Run Tests with Coverage:**

   ```bash
   pnpm run test -- --coverage
   ```

## ⚙️ Linting

Ensure code quality and consistency by running ESLint.

- **Check for Linting Errors:**

  ```bash
  pnpm run lint
  ```

- **Automatically Fix Linting Errors:**

  ```bash
  pnpm run lint:fix
  ```

## 🛠 Development

### 🔨 Building the Project

Compile TypeScript source files to JavaScript:

```bash
pnpm run build
```

### 📝 Adding New Features

1. **Define Agent Functions:**

   Create new `AgentFunction` objects with appropriate `name`, `func`, and `descriptor`.

2. **Update Agents:**

   Initialize or update `Agent` instances with the new functions.

3. **Run and Test:**

   Use the example scripts or create new ones in the `examples` directory to test the new features.

### 🧹 Code Cleanup

Regularly run linting and testing to maintain code quality.

```bash
pnpm run lint
pnpm run test
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps to contribute:

1. **Fork the Repository:**

   Click the "Fork" button at the top right of the repository page.

2. **Clone Your Fork:**

   ```bash
   git clone https://github.com/ColeMurray/swarmjs.git
   cd swarmjs-node
   ```

3. **Create a New Branch:**

   ```bash
   git checkout -b feature/YourFeatureName
   ```

4. **Make Your Changes:**

   Implement your feature or bug fix.

5. **Commit Your Changes:**

   ```bash
   git commit -m "Add feature: YourFeatureName"
   ```

6. **Push to Your Fork:**

   ```bash
   git push origin feature/YourFeatureName
   ```

7. **Create a Pull Request:**

   Navigate to the original repository and click "Compare & pull request."

### 📜 Contribution Guidelines

Please ensure that your contributions adhere to the following guidelines:

- **Code Quality:** Follow the existing code style and linting rules.
- **Documentation:** Update or add documentation as necessary.
- **Testing:** Include tests for new features or bug fixes.
- **Commit Messages:** Use clear and descriptive commit messages.

For more details, refer to the [CONTRIBUTING.md](./CONTRIBUTING.md) file.

## 📄 License

This project is licensed under the [MIT License](./LICENSE). You are free to use, modify, and distribute this software in accordance with the license terms.

## 📫 Contact

For any inquiries or support, please open an issue on the [GitHub repository](https://github.com/ColeMurray/swarmjs/issues).

## 🌟 Acknowledgments

- [OpenAI](https://openai.com/) for providing the Swarm API.
- [Lodash](https://lodash.com/) for utility functions.
- [date-fns](https://date-fns.org/) for date manipulation.
- [dotenv](https://github.com/motdotla/dotenv) for environment variable management.
- [Jest](https://jestjs.io/) for testing framework.
- [ESLint](https://eslint.org/) for linting.

---

**Happy Coding! 🚀**
