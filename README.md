# MiniMax CLI

A conversational AI CLI tool powered by MiniMax with intelligent text editor capabilities and tool usage.

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="minimax-cli.png" />

## Features

- **🤖 Conversational AI**: Natural language interface powered by MiniMax
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🌍 Global Installation**: Install and use anywhere with `bun add -g minimax-cli`

## Licensing

This software uses a dual licensing model:

- **Open Source Use**: Licensed under AGPL-3.0 for individual developers, researchers, and non-commercial projects
- **Commercial Use**: Requires a commercial license for business use, redistribution, or deployment in commercial products

See [LICENSE.md](LICENSE.md) for detailed licensing information.

## Installation

### Prerequisites
- Bun 1.0+ (or Node.js 18+ as fallback)
- MiniMax API key
- (Optional, Recommended) Morph API key for Fast Apply editing

### Global Installation (Recommended)
```bash
bun add -g minimax-cli
```

Or with npm (fallback):
```bash
npm install -g minimax-cli
```

### Local Development
```bash
git clone <repository>
cd minimax-cli
bun install
bun run build
bun link
```

## Setup

1. Get your MiniMax API key

2. Set up your API key (choose one method):

**Method 1: Environment Variable**
```bash
export MINIMAX_API_KEY=your_api_key_here
```

**Method 2: .env File**
```bash
cp .env.example .env
# Edit .env and add your API key
```

**Method 3: Command Line Flag**
```bash
minimax --api-key your_api_key_here
```

**Method 4: User Settings File**
Create `~/.minimax/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here"
}
```



## Configuration

MiniMax CLI uses two configuration files:

- **User settings** (`~/.minimax/user-settings.json`): Global preferences like API keys and default models
- **Project settings** (`.minimax/settings.json`): Project-specific settings like which model to use

**Example user settings:**
```json
{
  "apiKey": "your_api_key_here",
  "defaultModel": "minimax-fast-1"
}
```

**Example project settings:**
```json
{
  "model": "minimax-pro"
}
```

Project settings override user settings when you're in that directory.

## Usage

### Interactive Mode

Start the conversational AI assistant:
```bash
minimax
```

Or specify a working directory:
```bash
minimax -d /path/to/project
```

### Headless Mode

Process a single prompt and exit (useful for scripting and automation):
```bash
minimax --prompt "show me the package.json file"
minimax -p "create a new file called example.js with a hello world function"
minimax --prompt "run bun test and show me the results" --directory /path/to/project
minimax --prompt "complex task" --max-tool-rounds 50  # Limit tool usage for faster execution
```

This mode is particularly useful for:
- **CI/CD pipelines**: Automate code analysis and file operations
- **Scripting**: Integrate AI assistance into shell scripts
- **Terminal benchmarks**: Perfect for tools like Terminal Bench that need non-interactive execution
- **Batch processing**: Process multiple prompts programmatically


### Model Selection

Choose which AI model to use:

```bash
# Use different models
minimax --model minimax-fast-1  # Fast and efficient
minimax --model minimax-pro     # More capable
minimax --model minimax-ultra   # Most powerful

# Set default in user settings
# ~/.minimax/user-settings.json
{
  "defaultModel": "minimax-fast-1"
}
```

Models can be set via command flag, environment variable, or user settings.

### Command Line Options

```bash
minimax [options]

Options:
  -V, --version          output the version number
  -d, --directory <dir>  set working directory
  -k, --api-key <key>    MiniMax API key (or set MINIMAX_API_KEY env var)
  -m, --model <model>    AI model to use (e.g., minimax-fast-1, minimax-pro) (or set MINIMAX_MODEL env var)
  -p, --prompt <prompt>  process a single prompt and exit (headless mode)
  -h, --help             display help for command
```





