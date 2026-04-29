<div align="center">
  <img src="moset-ide/src/assets/moset-logo.png" alt="Moset Logo" width="200" />
  
  # Moset Ecosystem
  **Sovereign Intelligence. Native Development.**

  [![Version](https://img.shields.io/badge/Version-1.0.0-brightgreen.svg)](https://github.com/mos-et/moset.org/releases)
  [![CI/CD](https://github.com/mos-et/moset.org/actions/workflows/moset-ci.yml/badge.svg)](https://github.com/mos-et/moset.org/actions/workflows/moset-ci.yml)
  [![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0)

  <br>
  <a href="https://www.paypal.com/donate/?hosted_button_id=SJEV4XPZGFNP6">
    <img src="https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal" />
  </a>
  <br>
  <i>Created and maintained by <b><a href="https://moset.org">moset.org</a></b></i>
</div>

<br/>

## 📜 A Personal Note from the Creator

> *This section is not technical. It's human.*

I built Moset alone, from scratch, across countless sleepless nights — fueled by mate, stubborn curiosity, and a conviction that the tools we use to think should belong to us, not to the cloud, not to corporations, not to anyone who can flip a switch and take them away.

Moset started as an obsession: *What if a programming language could speak every human language? What if AI inference could run natively on your machine, sovereign and silent, owing nothing to anyone?* That question consumed me. And this repository is the answer — or at least, the best answer I could give with the time and energy I had.

**Version 1.0.0 is my gift to the community.** It is complete, it compiles on every major OS, it passes every test, and it works. It is not perfect, but it is real.

After this release, I'm stepping away for an indefinite period. Not because I've lost faith in the project — quite the opposite. I'm stepping away because I need to recover. Building something this large alone takes a toll that doesn't show up in commit logs.

If you find value in Moset, use it freely. Fork it. Break it. Rebuild it better. Teach someone to code in their own language. Run an AI model on your own hardware without asking anyone for permission. That was always the point.

*Thank you for reading this far. Now go build something sovereign.*

— **The Creator**, April 2026

---

**Moset** (from Selk'nam: *"Sovereignty"*) is much more than a framework; it is a complete ecosystem for developing local, private, and high-performance Artificial Intelligence. Moset combines the spotless power of native compiled engines with visual flexibility, creating a revolutionary IDE that runs native AI without relying on the cloud.

---

## 🌐 Vision and Architecture

To fully dive into the philosophy, technical foundations, and the "Lore" behind this project, we invite you to read our central documentation:

📖 **[Read The Moset Bible (ES)](./Biblia_Moset.md)**
📖 **[Read The Moset Bible (EN)](./Biblia_Moset_en.md)**

## ✨ Key Features

- **Moset-Lang (.et) & U-AST**: A universal, sovereign language. Write in Spanish, English, Portuguese, French, Chinese, Japanese, German or Italian — the AST compiles to the same bytecode. Ultrafast syntax driven by macros (`:,]`).
- **Localization Lens (Translation Magnifier)**: Real-time inline translation of code keywords via Monaco decorations. See your code in any supported human language while editing.
- **Local AI Engine**: 100% offline AI assistance running natively on compiled inference engines. Your code and your secrets never leave your machine.
- **Cloud AI Bridge**: Optional integration with OpenAI, Anthropic, and Mistral APIs for extended reasoning, with full Vigilante context injection.
- **Native GGUF Surgery**: Inspect, alter metadata and rewrite tensors of your local models surgically with the first GGUF editor integrated into an IDE.
- **Vigilante Security Middleware**: Orchestrate calls to external scripts and the OS with peace of mind. The "Trust None" middleware audits every step and requires Quantum Trust levels (`Bit:[0.90]`) for destructive actions.
- **Bytecode VM**: A high-performance stack-based virtual machine with 49+ opcodes, closures, catch handlers, and quantum operations.
- **WebAssembly (WASM) Playground**: The engine compiles your code at 60FPS directly from your browser without installations, available globally at moset.org.
- **Glassmorphism Frontend**: A polished, immersive, and dark interface; designed to reduce visual fatigue under our sci-fi design palette.

## 📥 Download

**Latest Release: v1.0.0**

| Platform | Download |
|:---------|:---------|
| Windows x64 | [Moset IDE_1.0.0_x64-setup.exe](https://github.com/mos-et/moset.org/releases/latest) |
| macOS x64 | [Moset IDE_1.0.0_x64.dmg](https://github.com/mos-et/moset.org/releases/latest) |
| Linux amd64 | [Moset IDE_1.0.0_amd64.AppImage](https://github.com/mos-et/moset.org/releases/latest) |

> **Note:** The Windows installer includes the full IDE, core engine, and CLI tools.

## 📁 Repository Structure

```text
/
 ├── core-engine/          # Pure native backend: Lexer, Parser, Compiler, VM, AI
 │   └── src/
 │       ├── lexer.rs      # Multi-language tokenizer (8 human languages)
 │       ├── parser.rs     # Recursive descent parser → U-AST
 │       ├── compiler.rs   # AST → Bytecode compiler
 │       ├── vm/           # Stack-based VM (engine.rs, chunk.rs, opcode.rs)
 │       ├── evaluador.rs  # Tree-walking interpreter + stdlib dispatch
 │       ├── ai.rs         # Sovereign Engine (Candle GGUF inference)
 │       ├── vigilante.rs  # Security middleware (Trust None)
 │       └── agent.rs      # MCP ToolCall agent protocol
 ├── moset-ide/            # Desktop IDE (Tauri v2 + React 19 + Monaco)
 │   ├── src/
 │   │   ├── components/   # Modularized UI (Editor, Chat, Terminal, Layout)
 │   │   ├── hooks/        # React hooks (useFileSystem, useMosetBrain, etc.)
 │   │   └── styles/       # Glassmorphism design system + Animista
 │   └── src-tauri/        # Tauri backend bridge (PTY, AI state, commands)
 ├── mos.et/               # Language platform (examples, dictionaries, orchestrators)
 │   ├── examples/         # .et demo scripts (moldes, quantum, AI, closures)
 │   └── moset-lang/       # Human language dicts: es.toml, en.toml, etc.
 ├── scripts/              # Fine-tuning, corpus generation, CLI installer
 └── ai-corpus/            # Training data for Moset-specific models
```

## ⚙️ Installation & Basic Build

### Requirements
- **Rust** and **Cargo** (latest stable)
- **Node.js** (v18+) and **npm**
- **Optional:** NVIDIA GPU + CUDA toolkit for local AI inference

### Running the Development Environment (IDE)

```bash
cd moset-ide
npm install
npm run tauri dev
```

### Building for Production

```bash
cd moset-ide
npm run tauri build
```

The installer will be generated at `src-tauri/target/release/bundle/nsis/`.

### Running a .et script (CLI)

```bash
moset run archivo.et
```

### Running the REPL

```bash
moset repl
```

> **Note:** Heavy model downloads (.safetensors, .gguf) are configured using the integrated scripts and are excluded from version control due to their large file size.

## 🧪 Test Suite

```bash
cd core-engine
cargo test
```

**75 tests** (67 unit + 8 E2E) — 100% pass rate. Covers: lexer, parser, evaluator, VM, vigilante, closures, sandbox, quantum operations, and overflow protection.

## 📋 Changelog Highlights (v1.0.0)

- ✅ **Localization Lens** — Real-time inline translation in the code editor
- ✅ **Bytecode VM** — 49+ opcodes, closures, catch handlers, quantum ops
- ✅ **Omniglot Lexer** — 8 human languages (ES, EN, IT, PT, FR, ZH, JA, DE)
- ✅ **Cloud AI Bridge** — OpenAI, Anthropic, Mistral integration with Vigilante
- ✅ **MCP Agent** — 12-tool autonomous agent with security middleware
- ✅ **GGUF Surgery** — Native metadata editor for local AI models
- ✅ **75 Tests** — Full backend test coverage with 0 failures
- ✅ **NSIS Installer** — One-click Windows installation

---
<div align="center">
  <i>Moset 2026 — <b>moset.org</b></i>
</div>
