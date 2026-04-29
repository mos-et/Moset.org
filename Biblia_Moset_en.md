# MOSET BIBLE — Definitive Ecosystem Document (Sovereign Engine)

> **This file defines the architecture, vision, current state, and complete audit of Moset IDE and its ecosystem.**
> Last consolidation: 2026-04-29 — **v1.0.0 — Stable Release (Localization Lens, 75 Tests, NSIS Installer)**
> Owner: Moset Core Team

> **Note:** The canonical, most detailed version of this document is the [Spanish Bible (Biblia_Moset.md)](./Biblia_Moset.md). This English version serves as an executive summary and reference for international contributors.

---

## Index

1. [What is Moset](#1-what-is-moset)
2. [General Architecture](#2-general-architecture)
3. [Project Structure](#3-project-structure)
4. [The Moset Language — Complete Reference](#4-the-moset-language--complete-reference)
5. [Backend Rust: Module-by-Module Audit](#5-backend-rust-module-by-module-audit)
6. [Frontend: Component-by-Component Audit](#6-frontend-component-by-component-audit)
7. [Security System: The Vigilante](#7-security-system-the-vigilante)
8. [Native AI: Sovereign Engine (Candle)](#8-native-ai-sovereign-engine-candle)
9. [Agentic Capabilities: Hands of the Sovereign](#9-agentic-capabilities-hands-of-the-sovereign)
10. [Roadmap & Current State](#10-roadmap--current-state)

---

## 1. What is Moset

**Moset (Motor Soberano / Sovereign Engine)** is a comprehensive development ecosystem designed to provide maximum technological sovereignty. Unlike cloud-based solutions, Moset operates **100% locally**, compiling a native language (`.et`) that supports asynchronous concepts, quantum types (`Bit:~`), and agentic execution (`pensar {}`).

It includes its own IDE (Moset IDE), a compiler and evaluator written in high-performance Rust, and a resident AI chatbot called **Naraka**, integrated directly into the interface with native Candle inference over CUDA/CPU.

**Stack:** Rust (Core Engine) · React/TypeScript + Tauri v2 (Frontend) · Monaco Editor · Candle (Local GGUF Inference).

---

## 2. General Architecture

```text
┌─ MOSET IDE (Frontend) ────────────┐      ┌─ CORE ENGINE (Backend Rust) ─────────────┐
│  React 19 + UI Components         │      │  Lexer + Parser + U-AST                  │
│  Monaco Editor (moset-dark theme) │ ◄──► │  Compiler (AST → Bytecode)               │
│  Central Panel (Native AI Chat)   │ IPC  │  Stack VM (Fetch-Decode-Execute)         │
│  Integrated PTY Terminal          │      │  Linter (Static Semantic Analysis)       │
│  File Explorer                    │      │  Sovereign Engine (Candle GGUF, CUDA/CPU)│
│  @tauri-apps/api v2               │      │  Vigilante (Security Middleware)         │
└───────────────────────────────────┘      │  Stdlib (Shell, File I/O, Environment)   │
                                           │  Agent (MCP ToolCall + ToolResponse)     │
                                           │  CLI Binary (`moset run`, `moset ast`)   │
                                           └──────────────────────────────────────────┘
```

**Execution flow:** User writes `.et` code in Monaco. On execution, the frontend invokes via Tauri `invoke` to the Rust core, which tokenizes → parses → **compiles to bytecode** → executes in the **Stack VM** and returns captured output to the frontend.

---

## 3. Project Structure

```text
/workspace/moset-ecosystem/
├── core-engine/                        ← RUST ENGINE
│   └── src/
│       ├── lexer.rs                    ← Tokenizer (659 lines) — 8 human languages
│       ├── parser.rs                   ← Recursive descent (798 lines) → U-AST
│       ├── compiler.rs                 ← AST → Bytecode compiler
│       ├── evaluador.rs               ← Tree-walking runtime (1333 lines)
│       ├── ai.rs                       ← Sovereign Engine (487 lines) — Candle GGUF
│       ├── cloud_ai.rs                 ← Cloud AI (OpenAI/Mistral/Anthropic)
│       ├── vigilante.rs               ← Security Middleware (483 lines)
│       ├── agent.rs                    ← MCP Agent (90 lines)
│       ├── stdlib.rs                   ← Native functions (273 lines)
│       └── vm/engine.rs               ← Bytecode VM (1130 lines)
│
├── moset-ide/                         ← FRONTEND (Tauri v2 + React 19)
│   ├── src-tauri/src/lib.rs           ← Tauri Backend (1502 lines)
│   └── src/
│       ├── App.tsx                     ← Main IDE Orchestrator
│       ├── components/                ← Modularized UI components
│       ├── hooks/                     ← React hooks (useFileSystem, useMosetBrain)
│       └── styles/                    ← Glassmorphism design system
│
├── mos.et/                            ← Language platform
│   ├── examples/                      ← .et demo scripts
│   └── moset-lang/idiomas_humanos/    ← Human language dicts (es.toml, en.toml)
│
└── scripts/                           ← Fine-tuning & corpus generation
```

---

## 4. The Moset Language — Complete Reference

Moset is a language designed from scratch for sovereign computing and AI orchestration. Extension: `.et`. Multi-language support (Spanish/English/Italian/Portuguese/French/Chinese/Japanese/German).

### Key Lexical Tokens

| Symbol | Token | Function |
|:-------|:------|:---------|
| `:,]` | `FuncDef` | Define functions/routines |
| `:,[` | `CatchDef` | Inline catch (fallback) |
| `:,\` | `Esperar` | Async/Await |
| `:@` | `Comentario` | Total silencing (comment) |
| `Bit:~` | `BitCuantico` | 50/50 superposition |
| `Bit:[0.85]` | `BitSesgado` | Custom probability superposition |
| `!` | `Exclamacion` | Quantum observation / collapse |
| `pensar {}` | `Pensar` | Shadow Environment (simulation) |
| `molde` | `Molde` | Atomic or elastic struct (`...`) |

### Code Example (.et)

```moset
:@ Define an elastic mold for scan data
molde Escaneo: ip, puerto, ...

:@ Function with implicit return
:,] diagnosticar(objetivo)
    e = Escaneo { ip: objetivo, puerto: 80 }
    e.estado = "activo"
    e

:@ Quantum bit — collapses on observation with !
confianza = Bit:[0.92]
si !confianza:
    mostrar "Executing with high confidence"
sino:
    mostrar "Insufficient confidence"

:@ Secure shell with authorization Bit
resultado = shell("whoami")
mostrar resultado

:@ Latent thinking (Shadow Env — doesn't modify real state)
pensar {
    hipotesis = shell("netstat -ano")
    mostrar hipotesis
}
```

---

## 5. Backend Rust: Module-by-Module Audit

| Module | Lines | Status | Description |
|:-------|:------|:-------|:------------|
| `lexer.rs` | 659 | ✅ Solid | Multi-language tokenizer with 8 human languages |
| `parser.rs` | 798 | ✅ Solid | Recursive descent with operator precedence |
| `ast.rs` | 153 | ✅ Complete | U-AST with line/column metadata |
| `evaluador.rs` | 1333 | ✅ Complete | Tree-walking interpreter + stdlib dispatch |
| `compiler.rs` | ~600 | ✅ Complete | AST → Bytecode with closures, upvalues |
| `vm/engine.rs` | 1130 | ✅ Solid | Stack VM with 49+ opcodes, catch handlers |
| `ai.rs` | 487 | ✅ Functional | Candle GGUF inference, Top-P/K, UTF-8 guards |
| `cloud_ai.rs` | ~300 | ✅ Functional | SSE streaming for OpenAI/Mistral/Anthropic |
| `vigilante.rs` | 483 | ✅ Hardened | 4 sovereignty levels + SSRF + env audit |
| `stdlib.rs` | 273 | ✅ Solid | I/O functions with Vigilante validation |
| `agent.rs` | 90 | ✅ Functional | MCP ToolCall with 12-tool catalog |
| `linter.rs` | 194 | ✅ Functional | Static analysis with type inference |

---

## 6. Frontend: Component-by-Component Audit

| Component | Status | Description |
|:----------|:-------|:------------|
| `App.tsx` | ✅ | Main orchestrator (modularized from 2000+ lines) |
| `ChatPanel.tsx` | ✅ | AI Chat (1589 lines): sessions, streaming, agent, Action Cards |
| `CodeEditor.tsx` | ✅ | Monaco integration + Localization Lens |
| `SettingsPanel.tsx` | ✅ | Global settings with persistent save |
| `Explorador.tsx` | ✅ | Recursive file explorer with glassmorphism |
| `SoberanaTerminal.tsx` | ✅ | Integrated PTY terminal (xterm.js) |
| `GGUFPanel.tsx` | ✅ | GGUF metadata editor |
| `MosetOutputPanel.tsx` | ✅ | Visual execution output panel |

---

## 7. Security System: The Vigilante

| Level | Trust | Examples | Action |
|:------|:------|:---------|:-------|
| 🟢 Free (0.00) | None | `whoami`, `echo`, `ping` | Direct execution |
| 🟡 Cautious (0.75) | `Bit:[0.75]+` | `curl`, `netstat`, `python` | Requires trust Bit |
| 🔴 Dangerous (0.95) | `Bit:[0.95]+` | `rm`, `del`, `shutdown` | High trust required |
| ⛔ Forbidden (∞) | Impossible | `rm -rf /`, `format C:` | NEVER executes |

**Additional protections:** Path traversal prevention (both `/` and `\`), URL encoding detection, SSRF blocking (AWS/GCP metadata endpoints), environment variable audit (blocks TOKEN, KEY, SECRET, PASS).

---

## 8. Native AI: Sovereign Engine (Candle)

- **Engine:** Candle (HuggingFace) — native Rust inference, no Python wrapper. **100% local.**
- **Supported models:** Phi-3, Qwen2, Qwen3, Llama (auto-detected from GGUF metadata)
- **Hardware:** CUDA (RTX 5070 Ti) or CPU fallback
- **Sampling:** Temperature (0.7) + Top-P (0.9) + Top-K (40) + Repeat Penalty (1.1)
- **UTF-8 Guard:** `is_char_boundary()` at all streaming slice points

---

## 9. Agentic Capabilities: Hands of the Sovereign

12-tool catalog including: `read_directory`, `read_file`, `write_to_file`, `run_command`, `replace_file_content`, `search_workspace`, `git_commit`, `mcp_call`, `lsp_diagnostics`, and more.

All agent tool calls pass through the Vigilante middleware (BUG-043 resolved). The agent operates with implicit trust `None`, blocking dangerous/cautious commands unless explicit Bit authorization is provided.

---

## 10. Roadmap & Current State

### ✅ Implemented (v0.1 → v1.0.0)

- [x] Multi-language Lexer (8 human languages) with special tokens
- [x] Recursive descent Parser with operator precedence
- [x] U-AST with line/column metadata for precise Linter reports
- [x] Bytecode Compiler (AST → Bytecode) with closures and upvalues
- [x] Stack-based VM with 49+ opcodes, catch handlers, quantum ops
- [x] Tree-walking Evaluator with scoping, explicit/implicit return
- [x] Quantum Engine (Bit:~, Bit:[p], collapse via !, auto-collapse)
- [x] Atomic and elastic Molds (cortex + latent space)
- [x] Shadow Environment (`pensar {}`) with complete isolation
- [x] Sovereign Engine (Candle GGUF: Phi3, Qwen2/3, Llama — CUDA/CPU)
- [x] Cloud AI Bridge (OpenAI, Anthropic, Mistral with Vigilante context)
- [x] Vigilante security middleware (4 sovereignty levels + SSRF + env audit)
- [x] Real PTY terminal (PowerShell via portable-pty + xterm.js)
- [x] MCP Agent with 12-tool catalog and Vigilante validation
- [x] LSP client for external language diagnostics
- [x] Localization Lens (real-time inline translation in editor)
- [x] GGUF Surgery (native metadata editor)
- [x] Git integration (status badges + Auto-Sync)
- [x] AI autocomplete in Monaco (InlineCompletionsProvider + debounce)
- [x] Diff View before applying agent changes
- [x] 75 tests (67 unit + 8 E2E) — 0 failures
- [x] NSIS installer + CI/CD pipeline (Win/Mac/Linux)
- [x] Omniglot lexer (ES, EN, IT, PT, FR, ZH, JA, DE)

### 🔮 Future (v1.1.0+)

- [ ] BUG-045: Fix mixed endianness in `ConfigurarCatch` (latent critical)
- [ ] BUG-046: Move `instruction_count` to VM struct for catch persistence
- [ ] Async Real — tokio runtime for genuinely asynchronous `:,\`
- [ ] Pattern Matching — `coincidir valor: caso1: ..., caso2: ...`
- [ ] String Interpolation — `"Hello {name}"`
- [ ] RAG Local — Local embeddings for project document retrieval
- [ ] Multiple themes beyond moset-dark
- [ ] Audit Log — Persistent log of all Vigilante-executed commands

---

**Ecosystem Owner:** Tomás Segura
**Operations Base:** `S:\Naraka Studio\Moset\`
**License:** PolyForm Noncommercial 1.0.0

---

## Last Update

**2026-04-29 — v1.0.0 Release: Localization Lens + Production Installer**

### Localization Lens — Critical Fix
- [x] **Diagnosis**: The Translation Magnifier rendering engine failed on Monaco v0.55+ due to `deltaDecorations` with `after.content` being deprecated.
- [x] **Solution**: Refactored `CodeEditor.tsx` using `createDecorationsCollection` + `editorReady` state to ensure post-mount synchronization.
- [x] **Result**: Real-time translation functionality is now fully operational and reactive.

### v1.0.0 Consolidation
- [x] **Version Audit**: Normalized `package.json`, `tauri.conf.json`, `Cargo.toml`, `StatusBar.tsx`.
- [x] **Build + Installer**: Successful generation of `Moset IDE_1.0.0_x64-setup.exe` via NSIS.
- [x] **Documentation**: Bibles (ES/EN) and README updated to reflect v1.0.0.

---

<div align="center">
  <i>Moset 2026 — Developed by <b>moset.org</b></i>
</div>
