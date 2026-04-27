#  BIBLIA MOSET — Documento Definitivo del Ecosistema (Motor Soberano)

> **Este archivo define la arquitectura, visión, estado real y auditoría completa de Moset IDE y su ecosistema.**
> Última consolidación: 2026-04-25 — **v0.3.0 (VM u16, Error Handling, Concurrencia)**
> Dueño: Equipo Central de Moset

---

##  Índice

1. [Qué es Moset](#1-qué-es-moset)
2. [Arquitectura General](#2-arquitectura-general)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [El Lenguaje Moset — Referencia Completa](#4-el-lenguaje-moset--referencia-completa)
5. [Backend Rust: Auditoría Módulo por Módulo](#5-backend-rust-auditoría-módulo-por-módulo)
6. [Frontend: Auditoría Componente por Componente](#6-frontend-auditoría-componente-por-componente)
7. [Sistema de Seguridad: El Vigilante](#7-sistema-de-seguridad-el-vigilante)
8. [IA Nativa: Motor Naraka (Candle)](#8-ia-nativa-motor-naraka-candle)
9. [Capacidades Agénticas: Manos del Soberano](#9-capacidades-agénticas-manos-del-soberano)
10. [Registro de Bugs y Correcciones Propuestas](#10-registro-de-bugs-y-correcciones-propuestas)
11. [Mejoras Estratégicas Propuestas](#11-mejoras-estratégicas-propuestas)
12. [Roadmap y Estado Actual](#12-roadmap-y-estado-actual)

---

## 1. Qué es Moset

**Moset (Motor Soberano)** es un ecosistema de desarrollo integral, concebido para brindar máxima soberanía tecnológica. A diferencia de soluciones basadas en la nube, Moset opera de manera **100% local**, compilando un lenguaje nativo (`.et`) que soporta conceptos asíncronos, cuánticos (`Bit:~`), y ejecución agéntica (`pensar {}`).

Incluye su propio IDE (Moset IDE), un compilador y evaluador escrito en Rust de altísimo rendimiento, y un chatbot IA residente llamado **Naraka**, integrado directamente en la interfaz con inferencia Candle nativa sobre CUDA/CPU.

**Stack:** Rust (Core Engine) · React/TypeScript + Tauri v2 (Frontend) · Monaco Editor · Candle (Inferencia local GGUF).

---

## 2. Arquitectura General

El ecosistema se divide en dos grandes monolitos fuertemente acoplados por IPC (Inter-Process Communication de Tauri) pero desarrollados y construidos de manera independiente:

```text
┌─ MOSET IDE (Frontend) ────────────┐      ┌─ CORE ENGINE (Backend Rust) ─────────────┐
│  React 19 + UI Components         │      │  Lexer + Parser + U-AST                  │
│  Monaco Editor (moset-dark theme) │ ◄──► │  Compilador (AST → Bytecode)             │
│  Panel Central (Chat IA Nativo)   │ IPC  │  VM de Pila (Fetch-Decode-Execute)       │
│  Terminal PTY Integrada           │      │  Linter (Análisis Estático Semántico)    │
│  Explorador de Archivos           │      │  Motor Soberano (Candle GGUF, CUDA/CPU)  │
│  @tauri-apps/api v2               │      │  Vigilante (Security Middleware)         │
└───────────────────────────────────┘      │  Stdlib (Shell, File I/O, Entorno)       │
                                           │  Agent (MCP ToolCall + ToolResponse)     │
                                           │  Binario CLI (`moset run`, `moset ast`)  │
                                           └──────────────────────────────────────────┘
```

**Flujo de ejecución:** El usuario escribe código `.et` en Monaco. Al ejecutar, el frontend invoca vía Tauri `invoke` al core Rust, que tokeniza → parsea → **compila a bytecode** → ejecuta en la **VM de Pila** y retorna la salida capturada al frontend. La terminal integrada (PTY real con PowerShell) sirve para interacción manual.

---

## 3. Estructura del Proyecto

```text
/workspace/moset-ecosystem/
├── core-engine/                        ← MOTOR RUST
│   ├── Cargo.toml                      ← Deps: Candle 0.10.2, Serde, Rand 0.9, Clap 4
│   ├── src/
│   │   ├── lib.rs                      ← API pública del crate (14 líneas, re-exports)
│   │   ├── main.rs                     ← CLI Entrypoint (148 líneas) — run, ast, repl
│   │   ├── lexer.rs                    ← Tokenizador (659 líneas) — Tokens especiales, multi-idioma
│   │   ├── parser.rs                   ← Descenso recursivo (798 líneas) → U-AST
│   │   ├── ast.rs                      ← U-AST (153 líneas) — Nodos inmutables + Metadata (línea/columna)
│   │   ├── evaluador.rs               ← Runtime tree-walking (1333 líneas) + stdlib dispatch
│   │   ├── linter.rs                   ← Análisis estático (194 líneas) con inferencia de tipos
│   │   ├── ai.rs                       ← Motor Soberano (487 líneas) — Candle GGUF inference + Top-P/Top-K + UTF-8 guards
│   │   ├── stdlib.rs                   ← Funciones nativas (158 líneas): shell, leer, escribir
│   │   ├── vigilante.rs               ← Security Middleware (287 líneas)
│   │   └── vm/                         ← MÁQUINA VIRTUAL DE BYTECODE
│   │       ├── chunk.rs                ← Buffer de instrucciones y Const Pool
│   │       ├── mod.rs                  ← Exportación
│   │       ├── opcode.rs               ← Set de instrucciones (1 byte)
│   │       ├── value.rs                ← VMValue (Pila rápida)
│   │       └── vm.rs                   ← Motor Fetch-Decode-Execute Loop
│
├── naraka-ide/                         ← FRONTEND REACT + TAURI v2 (Moset IDE)
│   ├── package.json                    ← productName: "moset-ide" (React 19, Monaco)
│   ├── vite.config.ts
│   ├── src-tauri/
│   │   ├── Cargo.toml                  ← Deps: Tauri v2, moset_core, portable-pty 0.9
│   │   ├── tauri.conf.json             ← productName: "Moset IDE", id: com.moset.ide
│   │   ├── src/
│   │   │   ├── lib.rs                  ← Backend Tauri (362 líneas): commands, AiState, PTY, lifecycle
│   │   │   ├── main.rs                 ← Entry point Tauri (5 líneas)
│   │   │   └── tauri_bridge.rs         ← PTY spawn PowerShell (136 líneas), read/write PTY
│   ├── src/
│   │   ├── App.tsx                     ← Main IDE Layout (2035 líneas) + FileTree Glassmorphism + Persistencia Settings
│   │   ├── ChatPanel.tsx               ←  Panel Chat AI (1589 líneas) — Chat + Historial Sesiones + Action Cards
│   │   ├── main.tsx                    ← React entry (9 líneas)
│   │   ├── assets/icons/               ← Iconos retro (.ico) para el file tree
│   │   ├── styles/index.css            ← Design System (1326 líneas): Glassmorphism + Animista
│   │   ├── styles/animista.css         ← Biblioteca de animaciones CSS (127 líneas)
│   │   └── languages/moset.ts          ← Monaco token provider para .et
│
├── moset-lang/                         ← DEFINICIONES DEL LENGUAJE
│   ├── diccionarios/                   ← es.toml + en.toml (keywords bilingües)
│   └── stdlib/                         ← (vacío, reservado para stdlib .et)
│
├── scripts/                            ← HERRAMIENTAS DE IA
│   ├── generate_corpus.py              ← Extrae .et → moset_corpus.txt
│   ├── fine_tune_naraka.py             ← Script de fine-tuning (pendiente ejecución)
│   └── moset_corpus.txt                ← Corpus generado (6.7 KB)
│
└── examples/
    └── hola_mundo.et                   ← Ejemplo canónico del lenguaje
```

---

## 4. El Lenguaje Moset — Referencia Completa

Moset es un lenguaje diseñado desde cero para computación soberana y orquestación de IA. Extensión: `.et`. Soporta multi-idioma (español/inglés) con tokens universales.

### 4.1 Tabla Léxica Maestra

| Símbolo | Token | Función |
|:--------|:------|:--------|
| `:,]` | `FuncDef` | Definir funciones/rutinas |
| `:,[` | `CatchDef` | Catch en línea (fallback) |
| `:,\` | `Esperar` | Async/Await |
| `:@` | `Comentario` | Silenciamiento total |
| `Bit:~` | `BitCuantico` | Superposición 50/50 (α=β=1/√2) |
| `Bit:[0.85]` | `BitSesgado` | Superposición con probabilidad custom |
| `!` | `Exclamacion` | Observación / colapso cuántico |
| `pensar {}` | `Pensar` | Shadow Environment (simulación) |
| `molde` | `Molde` | Struct atómico o elástico (`...`) |
| `..` | `DosPuntos` | Delimitador de bloque |
| `...` | `Elipsis` | Marca de elasticidad en moldes |

### 4.2 Palabras Clave (Multi-idioma)

| Español | Inglés | Token |
|:--------|:-------|:------|
| `si` | `if` | `Si` |
| `sino` | `else` | `Sino` |
| `mientras` | `while` | `Mientras` |
| `por` | `for` | `Por` |
| `cada` | `each` | `Cada` |
| `en` | `in` | `En` |
| `mostrar` | `show` | `Mostrar` |
| `importar` | `import` | `Importar` |
| `devolver` | `return` | `Devolver` |
| `verdadero` | `true` | `Verdadero` |
| `falso` | `false` | `Falso` |
| `nulo` | `null` | `Nulo` |
| `y` | `and` | `Y` |
| `o` | `or` | `O` |
| `no` | `not` | `No` |
| `pensar` | `think` | `Pensar` |
| `molde` | `mold` | `Molde` |

### 4.3 La Matriz de Tipos Runtime

| Tipo | Representación Moset | Rust Backend | Display |
|:-----|:---------------------|:-------------|:--------|
| Entero | `42` | `i64` | `42` |
| Decimal | `3.14` | `f64` | `3.14` |
| Texto | `"hola"` | `String` | `hola` |
| Booleano | `verdadero` / `falso` | `bool` | `verdadero` / `falso` |
| Superposición | `Bit:~` / `Bit:[0.85]` | `(f64, f64)` amplitudes | `Bit:~ [█████░░░░░] 50%` |
| Lista | `[1, 2, 3]` | `Vec<Valor>` | `[1, 2, 3]` |
| Molde | `Nombre { campo: valor }` | `HashMap` corteza + núcleo | `Nombre { campo: valor, +extra: val }` |
| Función | `:,] nombre(params)` | closure | `<función nombre>` |
| Nulo | `nulo` | unit | `nulo` |

### 4.4 Ejemplo Real de Código (.et)

```moset
:@ Definir un molde elástico para datos de escaneo
molde Escaneo: ip, puerto, ...

:@ Función con retorno implícito
:,] diagnosticar(objetivo)
    e = Escaneo { ip: objetivo, puerto: 80 }
    e.estado = "activo"
    e

:@ Bit cuántico — colapsa al observarse con !
confianza = Bit:[0.92]
si !confianza:
    mostrar "Ejecutando con alta confianza"
sino:
    mostrar "Confianza insuficiente"

:@ Shell seguro con Bit de autorización
resultado = shell("whoami")
mostrar resultado

:@ Pensamiento latente (Shadow Env - no modifica estado real)
pensar:
    hipotesis = shell("netstat -ano")
    mostrar hipotesis
```

### 4.5 Características del Lenguaje

- **Tipado estático con inferencia** — no se declaran tipos, se infieren desde el valor
- **Base 1 para índices** — `lista[1]` es el primer elemento
- **Retorno implícito** — la última expresión evaluada es el valor de retorno
- **Retorno explícito** — `devolver expr` usa un mecanismo de señal interna (`__RETORNO_SENAL__`)
- **Moldes atómicos vs elásticos** — sin `...` son rígidos, con `...` aceptan inyección al "espacio latente"
- **Indentación como delimitador** — el lexer emite tokens `Indent`/`Dedent`
- **Concatenación polimórfica** — `Texto + cualquier_cosa` concatena automáticamente
- **Aritmética segura** — `checked_add/sub/mul/div` previene overflow de i64

---

## 5. Backend Rust: Auditoría Módulo por Módulo

### 5.1 `lib.rs` — API Pública del Crate
Re-exporta todos los módulos: `lexer`, `parser`, `ast`, `evaluador`, `linter`, `ai`, `stdlib`, `vigilante`.
**Estado:**  Correcto.

### 5.2 `main.rs` — CLI Entrypoint
Subcomandos: `run <archivo>`, `ast <archivo>`, `repl`.
- `run`: Ejecuta pipeline completo (Lexer → Parser → Evaluador)
- `ast`: Serializa el U-AST a JSON con `serde_json`
- `repl`: Loop interactivo línea a línea

**Estado:**  Funcional.

### 5.3 `ast.rs` — U-AST (153 líneas)
Define todos los nodos del árbol sintáctico:
- 8 literales (Entero, Decimal, Texto, Booleano, Nulo, Superposición, Lista)
- Binario/Unario con 13 operadores binarios y 2 unarios
- Asignación, Función, Llamada, Mostrar
- Condicional (bloque e inline), PorCada, Mientras
- CatchEnLinea, Esperar, Colapsar
- MoldeDefinicion, MoldeInstancia, AsignacionCampo, AccesoCampo, AccesoIndice
- Importar, Retornar, Comentario, Pensar

**Estado:**  Completo para MVP.
** Bug:** Los nodos NO contienen metadata de posición (`linea`, `columna`). Esto impide que el linter reporte errores precisos.

### 5.4 `lexer.rs` — Tokenizador (659 líneas)
**Función:** Convierte código fuente `.et` en secuencia de `TokenConPos`.
- Multi-idioma: soporta tokens en español e inglés con una tabla `HashMap<&str, Token>` que mapea ambos
- Tokens especiales: `:,]`, `:,[`, `:,\`, `:@`, `Bit:~`, `Bit:[prob]`
- Sistema de indentación: stack de niveles que emite `Indent`/`Dedent`
- Soporte para strings con escape (`\"`, `\\`, `\n`, `\t`)
- Números: distingue `Entero` vs `Decimal` por presencia de punto
- Tracking: cada token lleva `linea` y `columna`

**Tests existentes (9):** Aritmética, funciones, comentarios, catch, bits cuánticos, moldes, keywords bilingües.
**Estado:**  Sólido. Tests pasan.

### 5.5 `parser.rs` — Analizador Sintáctico (798 líneas)
**Función:** Descenso recursivo con precedencia de operadores.

**Orden de precedencia (menor → mayor):**
1. `o` (OR lógico)
2. `y` (AND lógico)
3. `==`, `!=` (igualdad)
4. `>`, `<`, `>=`, `<=` (comparación)
5. `+`, `-` (suma/resta)
6. `*`, `/`, `%` (factor)
7. `-expr`, `no expr`, `!expr` (unarios)
8. Postfix: llamadas `()`, acceso `.campo`, índice `[i]`, catch `:,[`

**Sentencias parseable:**
- Comentario, Función, Molde, Si/Sino, Mientras, PorCada
- Mostrar, Importar, Devolver, Pensar
- Asignación (simple y de campo)
- Expresión standalone

**Tests existentes (10):** mostrar, asignación, aritmética, Bit:~, Bit:[p], colapso, molde rígido/elástico, molde puro elástico, asignación de campo.
**Estado:**  Sólido.

### 5.6 `evaluador.rs` — Intérprete Tree-Walking (1333 líneas)
**La pieza más grande y compleja.** Ejecuta el U-AST directamente.

**Componentes internos:**
- `Valor` — Enum de valores runtime (8 variantes incluyendo `Superposicion`)
- `Entorno` — Scoping con stack de HashMaps
- `Evaluador` — State machine con `entorno`, `moldes`, `vigilante`, `motor_naraka`, `modo_latente`, `retorno_slot`

**Funciones nativas integradas (stdlib dispatch):**
| Función | Args | Retorno | Seguridad |
|:--------|:-----|:--------|:----------|
| `shell(cmd [, Bit])` | 1-2 | Texto | Vigilante auditado |
| `leer(ruta)` | 1 | Texto | — |
| `escribir(ruta, contenido)` | 2 | Booleano | — |
| `existe(ruta)` | 1 | Booleano | — |
| `entorno(nombre)` | 1 | Texto | — |
| `soberano_escribir(ruta, contenido)` | 2 | Booleano | Sandbox + modo latente |
| `soberano_ejecutar(comando)` | 1 | Texto | Whitelist estricta |
| `soberano_analizar(archivo)` | 1 | Entero/Texto | Pipeline Lexer→Parser→Linter |
| `naraka(prompt [, max_tokens])` | 1-2 | Texto | Motor IA |
| `naraka_estado()` | 0 | Texto | — |
| `naraka_diagnostico()` | 0 | Texto | — |
| `naraka_cargar(gguf [, tokenizer])` | 1-2 | Texto | — |
| `naraka_tokenizer(ruta)` | 1 | Booleano | — |

**Tests existentes (21):** Aritmética, texto, booleano, lista base 1, superposición, colapso (100 iteraciones), colapso sesgado, bits deterministas, bias estadístico (200 muestras), shell básico, escribir/leer roundtrip, existe, entorno, shell args inválidos, molde elástico inyección, molde rígido rechazo, reasignación corteza, display latente, quantum en molde, pensar (5 tests), vigilante E2E (3 tests), naraka E2E (5 tests).
**Estado:**  Funcionalmente completo para MVP.

### 5.7 `linter.rs` — Análisis Estático (194 líneas)
**Función:** Visitor pattern sobre el U-AST sin ejecutar código.

**Detecciones implementadas:**
- TypeError por reasignación cruzada de tipos (`x = 5; x = "hola"`)
- Warning por inicialización explícita en `nulo`
- Scoping correcto en funciones, condicionales, loops
- Shadow Env aislado para `pensar {}`

** Limitaciones:**
- `reportar()` siempre envía `linea: 1, columna: 1` — **hardcodeado** porque el U-AST no tiene metadata de posición
- No rastrea el tipo de retorno de funciones
- No valida aridad de llamadas a funciones
- No detecta variables no usadas
- `inferir_tipo()` devuelve `Desconocido` para expresiones binarias/unarias

### 5.8 `stdlib.rs` — Biblioteca Estándar (158 líneas)
**Funciones puras de I/O:**
- `shell(cmd)` — Cross-platform (`cmd /C` Windows, `sh -c` Unix)
- `leer(ruta)` — `fs::read_to_string`
- `escribir(ruta, contenido)` — `fs::write` con creación automática de directorios padres
- `existe(ruta)` — `Path::exists()`
- `entorno(nombre)` — `env::var()`

**Tests (7):** whoami, comando inválido, escribir/leer roundtrip, leer inexistente, existe, entorno PATH, entorno inexistente.
**Estado:**  Sólido.

### 5.9 `vigilante.rs` — Security Middleware (287 líneas)
**Función:** Audita TODOS los comandos shell y operaciones de filesystem.

**Niveles de Soberanía:**

| Nivel | Confianza | Ejemplos | Acción |
|:------|:----------|:---------|:-------|
|  Libre (0.00) | Ninguna | `whoami`, `echo`, `ping`, `ls` | Ejecución directa |
|  Cauteloso (0.75) | `Bit:[0.75]+` | `curl`, `netstat`, `python`, `cargo` | Requiere Bit de confianza |
|  Peligroso (0.95) | `Bit:[0.95]+` | `rm`, `del`, `shutdown`, `kill` | Alta confianza requerida |
|  Prohibido (∞) | Imposible | `rm -rf /`, `format C:`, fork bomb | NUNCA se ejecuta |

**Sandbox de Rutas (`autorizar_ruta`):**
- Previene Path Traversal (`../`)
- Solo permite escritura en `S:\Naraka Studio` y directorios temporales
- Las rutas relativas puras son permitidas

### 5.10 `ai.rs` — Motor Soberano (487 líneas)
**Función:** Inferencia local usando Candle (HuggingFace).

**Arquitectura:**
- Auto-detecta modelo GGUF por metadata (`llama`, `phi`, `qwen2`, `qwen3`)
- Carga en CUDA (si feature `cuda` activa) o CPU
- Limpieza explícita de memoria antes de cargar nuevo modelo (`drop()` manual)
- Streaming de tokens vía callback `on_token: FnMut(String) -> bool` (retorna `false` para cancelar)
- Sampling: Temperature (0.7) + **Top-P nucleus sampling (0.9)** + **Top-K (40)** + **Repeat Penalty (1.1, last 64)**
- Stop tokens expandidos para Qwen3, Llama3, Phi3 (EOS, EOT, im_start/im_end)
- Protección UTF-8: `is_char_boundary()` guards en los 3 puntos de slicing del streaming para prevenir panics con emojis/caracteres multibyte

** Bug (BUG-017):** El stub sin feature `ai` tiene firma `FnMut(String)` pero el real usa `FnMut(String) -> bool`. No compila sin feature `ai`.

**Estado:**  Funcional con modelos GGUF. Top-P activo.

### 5.11 `vm/` — Máquina Virtual Soberana (Nuevo Motor)
**Función:** Ejecución de código vía una Máquina de Pila (Stack Machine) ultra rápida mediante bytecode (reemplazando/complementando a `evaluador.rs`).

- **`vm.rs`:** El loop `fetch-decode-execute` con dispatch monolítico. Opera un `Vec<Valor>` como pila con `Rc<Chunk>` compartidos (O(1) en llamadas a función). Incluye `CallFrame` stack para funciones, `CatchHandler` stack para error handling, y guards de seguridad (`MAX_PILA=256`, `MAX_FRAMES=64`, `MAX_INSTRUCTIONS=5M`). El loop principal (`ejecutar`) envuelve `ejecutar_interno` para interceptar errores y hacer stack unwinding hacia catch handlers activos.
- **`bytecode.rs`:** Chunk de bytecode (`Vec<u8>`) + Pool de Constantes (`Vec<Valor>`) + líneas para rastreo. ISA de 44 opcodes (0-43), cada instrucción es 1 byte. Operandos de índice usan u16 (65,535 constantes máx). Saltos usan u16 big-endian con backpatching (`emitir_salto`/`parchear_salto`).
- **`compiler.rs`:** Compilador AST→Bytecode completo. Soporta variables globales/locales, condicionales, bucles `mientras`/`por cada`, funciones con CallFrames, moldes, listas, builtins, quantum, `CatchEnLinea` (`:,[`) y `Esperar` (`:,\`). Emite operandos u16 para índices de constantes via `emitir_op_u16`.

**OpCodes Fase C (Error Handling + Concurrencia):**
| OpCode | Valor | Operando | Función |
|:-------|:------|:---------|:--------|
| `ConfigurarCatch` | 37 | u16 (offset al fallback) | Push CatchHandler con snapshot de estado |
| `LimpiarCatch` | 38 | — | Pop CatchHandler (expresión exitosa) |
| `LanzarError` | 39 | — | Pop valor, retorna Err(formato) |
| `Esperar` | 40 | — | Pop entero (ms), thread::sleep bloqueante |

**OpCodes Fase I/J (Quantum & Shadow Environments):**
| OpCode | Valor | Operando | Función |
|:-------|:------|:---------|:--------|
| `CrearQubit` | 47 | — | Pop beta, pop alpha. Crea Valor::Superposicion |
| `EntrarPensar` | 48 | — | Snapshot de globales, activa modo sandbox |
| `SalirPensar` | 49 | — | Restaura globales desde snapshot, apaga sandbox |

**Tests:** 59 tests de integración pasando (aritmética, texto, condicionales, funciones con CallFrame, recursión factorial, comparaciones).

**Estado:**  Operativo. Bug latente BUG-045 (endianness mixta en ConfigurarCatch) pendiente de corrección.

### 5.12 `agent.rs` — Módulo Agente MCP (66 líneas)
**Función:** Define las estructuras serializables para el protocolo de herramientas del agente autónomo.

**Componentes:**
- `SOBERANO_SYSTEM_PROMPT` — Prompt del sistema para el modo agente, con catálogo de herramientas y metodología de razonamiento (`<pensar>` tags)
- `ToolCall` — Struct serializable con `tool: String` y `args: HashMap<String, serde_json::Value>`. El motor parsea JSON generado por el modelo para construir este objeto
- `ToolResponse` — Struct de respuesta con `tool`, `status` (success/error/rejected), `output`
- `ToolCall::extraer_de_texto(texto)` — Extrae el primer bloque JSON de un texto con formato ` ```json ... ``` `

**Herramientas del catálogo:**
| Herramienta | Args | Descripción |
|:------------|:-----|:------------|
| `read_directory` | `path` | Listar estructura de archivos |
| `read_file` | `path` | Leer contenido de archivo |
| `write_to_file` | `path`, `content` | Escribir/crear archivo |
| `run_command` | `command` | Ejecutar comando en terminal |

**Flujo en el Frontend:**
1. El modelo genera JSON con herramienta deseada
2. `ChatPanel.tsx` detecta el JSON y renderiza un `ToolInterceptorCard`
3. El usuario ve la acción propuesta y presiona **Permitir** o **Denegar**
4. Si aprobado, se invoca `execute_agent_tool` en el backend Rust
5. El resultado se muestra debajo de la card

** Bugs activos:**
- (BUG-043) `execute_agent_tool` no pasa por el Vigilante — ni `write_to_file` ni `run_command` validan sandbox/seguridad

**Estado:**  Funcional con limitación de seguridad.

---

## 6. Frontend: Auditoría Componente por Componente

### 6.1 `lib.rs` (Tauri Backend — 750 líneas)
**Comandos Tauri registrados:**

| Comando | Función | Tipo |
|:--------|:--------|:-----|
| `version()` | Retorna string de versión | Sync |
| `ejecutar(codigo)` | Pipeline Lexer→Parser→**Compilador→VM** completo, stdout capturado vía callback `on_print` | **Async** |
| `validate_code(codigo)` | Pipeline Lexer→Parser→Linter, retorna `Vec<Diagnostic>` (incluye errores léxicos) | Sync |
| `cargar_modelo(path, tokenizer)` | Carga GGUF en `AiState` vía `spawn_blocking` | Async |
| `chat_soberano(prompt, max_tokens)` | Inferencia streaming, emite `soberano-stream` por token. `max_tokens` configurable (default 2048) | Async |
| `autocomplete_soberano(prefix, suffix)` | Fill-in-the-Middle (FIM) para autocompletado inline. Formato `<\|fim_prefix\|>`/`<\|fim_suffix\|>`/`<\|fim_middle\|>`. Máx 32 tokens. | Async |
| `cancel_inference()` | Setea `AtomicBool` cancel flag — detiene la inferencia en curso | Sync |
| `descargar_modelo()` | Libera modelo de RAM/VRAM (`motor.descargar()`) | Sync |
| `set_clean_cuda_on_exit(enabled)` | Configura limpieza de caché CUDA al cerrar | Sync |
| `execute_agent_tool(call)` | Despacha ToolCall del agente: `read_directory`, `read_file`, `write_to_file`, `run_command` | Async |
| `read_directory(path, max_depth)` | Árbol de filesystem recursivo | Sync |
| `read_file_content(path)` | Lee archivo completo | Sync |
| `save_file_content(path, content)` | Escribe archivo | Sync |
| `create_file(path)` | Crea archivo vacío | Sync |
| `create_folder(path)` | Crea directorio recursivo | Sync |
| `delete_item(path)` | Borra archivo o carpeta | Sync |
| `rename_item(old, new)` | Renombra archivo o carpeta | Sync |
| `fetch_full_context(paths)` | Recolecta contexto de archivos para el prompt IA (MAX_CHARS=10000) | Sync |
| `search_workspace(path, query)` | Búsqueda de texto en archivos del workspace | Sync |
| `git_status(workspace_path)` | `git status --porcelain` del workspace | Async |
| `git_auto_sync(workspace_path)` | `git add . && commit && push` automático | Async |
| `clean_cuda_cache()` | Limpia DXCache/GLCache/ComputeCache de NVIDIA | Sync |
| `fetch_extensions()` / `toggle_extension(id)` | Gestión de extensiones (JSON persistido) | Sync |
| `write_pty(data)` | Escribe al terminal PTY | Sync (bridge) |
| `resize_pty(rows, cols)` | Redimensiona el PTY | Sync (bridge) |
| `kill_pty()` | Mata el proceso PTY child | Sync (bridge) |

**Estado administrado:**
- `PtyState` — Writer + Child + Master del terminal PTY (`Arc<Mutex<Option<...>>>`)
- `AiState` — `Arc<Mutex<MotorNaraka>>` + `Arc<AtomicBool>` cancel flag + `Arc<AtomicBool>` clean_cuda_on_exit
- `ExtensionState` — `Arc<Mutex<Vec<Extension>>>` + config_path persistido en JSON

**Lifecycle (CloseRequested):**
- Mata el PTY child process (`kill()` + `wait()`)
- Descarga el Motor IA (`motor.descargar()`) — libera RAM/VRAM
- Limpia caché CUDA si está configurado (DXCache, GLCache, ComputeCache)
- **Ya NO usa `process::exit(0)`** — cleanup real con destructores

**Filtros del explorador:** Ignora `.`hidden, `node_modules`, `target`, `__pycache__`, `dist`.
**Ordenamiento:** Carpetas primero, luego alfabético.

** Bugs activos:**
- (BUG-043) `execute_agent_tool` y `save_file_content` no validan sandbox vía Vigilante — el agente podría escribir/ejecutar fuera del Sandbox
- (BUG-024) `invoke` importado dinámicamente cuando ya está importado estáticamente

### 6.2 `App.tsx` — Coordinador Principal del IDE (~150 líneas)
**Nota de Arquitectura:** `App.tsx` fue modularizado desde +2000 líneas a un orquestador principal delegando responsabilidades a React Hooks en `src/hooks/*` y subcomponentes en `src/components/*`.

**Componentes inyectados:**
- `ActivityBar` — Barra lateral izquierda (Explorador, Buscar, Ejecutar, Extensiones, Naraka AI)
- `TabBar` — Pestañas de archivos abiertos con estado de modificación
- `Explorador` (`src/components/Layout/Explorador.tsx`) — Explorador de archivos recursivo y gestión de archivos en el contexto del agente.
- `StatusBar` — Barra inferior (archivo, lenguaje, proyecto, estado guardado)
- `SoberanaTerminal` (`src/components/Terminal/SoberanaTerminal.tsx`) — Terminal integrada asíncrona segura (PTY/xterm.js).
- `CodeEditor` (`src/components/Editor/CodeEditor.tsx`) — Integración del motor de Monaco y configuraciones de editor global.
- `SettingsPanel` — Panel flotante Global con guardado persistente (Config. Modelo, Vigilante, Cuántica, Orquestador N5)
- `ChatPanel` — Panel de chat IA (importado como componente separado)

**Hooks del Core (Nuevo Enfoque):**
- `useFileSystem` — Lógica y estado de rutas activas, lecturas y escrituras recursivas.
- `useMosetBrain` — Nexo comunicador asíncrono con `lib.rs` y el evaluador Rust.
- `useTauriTerminal` — Instancias y callbacks asíncronos para el manejo del PTY OS.

**Funcionalidades:**
- Monaco Editor con tema `moset-dark` personalizado + **InlineCompletionsProvider** (AI ghost text, debounced 800ms)
- Atajos: `Ctrl+S` (guardar), `Ctrl+P` (abrir archivo rápido)
- Validación en tiempo real via `validate_code` con squiggles rojos
- Apertura de carpetas y selección .gguf nativa via `@tauri-apps/plugin-dialog`
- Apertura de enlaces externos segura vía `@tauri-apps/plugin-opener`
- Apertura de archivos desde el explorador (doble click → nueva pestaña)
- Welcome screen moderno cuando no hay pestañas abiertas
- Ejecución de código Moset con salida a terminal PTY
- Persistencia estricta de pestañas, configuraciones globales y estado del IDE en localStorage

** Bugs UX activos:**
- (Resueltos en último patch de estabilización)

**Estado:**  Funcional y con UI altamente pulida.

### 6.3 `ChatPanel.tsx` —  Panel Motor Soberano (1589 líneas)

**Estado: FUNCIONAL — Componente React completo con historial de sesiones, streaming, agente, Action Cards, Diff View y ToolInterceptor.**

**Estructura del componente:**
- `ChatPanel` — Componente principal exportado (`export default function`)
- Props: `projectRoot`, `contextPaths`, `setContextPaths`, `onClose`
- 14 estados React (`useState`): messages, input, loading, streamBuffer, config, showConfig, modelPath, tokenizerPath, apiTokenizerActive, modelLoading, agentMode, includeContext, maxTokens, lastMetrics
- 3 refs (`useRef`): bottomRef, textareaRef, listenerRef (guard contra StrictMode)
- 2 effects (`useEffect`): auto-scroll + streaming listener (`soberano-stream` + `soberano-metrics`) con cleanup

**Subcomponentes internos:**
- `HistorialSidebar` — Panel lateral desplegable que persiste sesiones de agentes.
- `CopyButton` — Botón de copiar con feedback visual (✓)
- `AgentModeSelector` — Toggle Planear/Actuar con tooltips
- `TruncatedContent` — Trunca respuestas >15K chars con botón "Ver completa"
- `ActionCard` — Bloques de código accionables con botones Aplicar/Rechazar + Monaco DiffEditor
- `ToolInterceptorCard` — Interceptor de herramientas del agente con botones Permitir/Denegar + DiffEditor para ediciones de archivo

**Funcionalidades implementadas:**
-  Múltiples sesiones (Historial) aisladas y con persistencia localStorage
-  Auto-regeneración de Chat activo siempre que se cierre el único existente
-  Streaming de tokens vía `soberano-stream` con listener guard contra duplicación
-  Métricas de inferencia vía `soberano-metrics` (CTX/GEN token count)
-  Stream sanitizer anti-JSON-dump (detecta volcado del tokenizer)
-  System prompts extensos en español (SYSTEM_PLAN, SYSTEM_ACT)
-  `buildPrompt()` con historial, contexto multi-archivo, y formato adaptativo por modelo
-  Modos de agente: Planear (análisis) y Actuar (ejecución)
-  Context toggle: incluir contenido del archivo activo en el prompt
-  Carga de modelos GGUF desde UI con file dialog
-  max_tokens configurable: 1K/2K/4K/8K con valor por defecto 2048
-  Cancelación de inferencia vía `cancel_inference` command
-  Renderizado inline de markdown: bold, italic, code, headers, listas
-  Bloques de código con syntax highlighting y botón copiar
-  Contexto Vigilante IDE: Extrae transparentemente el Estado del Entorno (Nódulos Prohibidos, Peligrosos, en Cuarentena) al System Prompt de Modelos Locales y Nube (BUG FIX Auditado).

** Bugs menores activos:**
- (BUG-025) `uid()` usa `Math.random()` — posible colisión en alta frecuencia
- (BUG-024) Imports dinámicos redundantes de `@tauri-apps/api`

**Estado:**  Completamente funcional.

### 6.4 `styles/index.css` — Design System
**Paleta:** Moset Blue Tech — oscura con acentos cyan/verde neón.
**Componentes estilizados:** ActivityBar, TabBar, Editor, Terminal, ChatPanel, StatusBar, AgentMode selector, CopyButton.
**Estado:**  Funcional, estilizado coherentemente.

### 6.5 `tauri_bridge.rs` — PTY Bridge
**Función:** Spawn de PowerShell via `portable-pty`, lectura asíncrona de stdout, escritura desde frontend.
- `spawn_pty()` — Lanza PowerShell con tamaño de terminal fijo (24x80)
- `write_pty()` — Tauri command para enviar input al terminal
- Emite eventos `pty-read` hacia el frontend para renderizar en xterm.js

** Bugs activos:**
- (BUG-019) Si PowerShell muere, el loop de lectura termina silenciosamente sin notificar al frontend
- (UX-001) El tamaño del PTY es fijo (24x80) y no responde a cambios de tamaño del panel

**Estado:**  Funcional con limitaciones.

---

## 7. Sistema de Seguridad: El Vigilante

`vigilante.rs` es el middleware de seguridad que audita **todos** los comandos shell y operaciones de filesystem antes de ejecutarlos.

### Niveles de Soberanía

| Nivel | Confianza | Ejemplos | Acción |
|:------|:----------|:---------|:-------|
|  Libre (0.00) | Ninguna | `whoami`, `echo`, `ping` | Ejecución directa |
|  Cauteloso (0.75) | `Bit:[0.75]+` | `curl`, `netstat`, `python`, `cargo` | Requiere Bit de confianza |
|  Peligroso (0.95) | `Bit:[0.95]+` | `rm`, `del`, `shutdown`, `kill` | Alta confianza requerida |
|  Prohibido (∞) | Imposible | `rm -rf /`, `format C:`, fork bomb | NUNCA se ejecuta |

### Sandbox de Rutas (`autorizar_ruta`)
- Previene Path Traversal (`../`)
- Solo permite escritura en el directorio raíz del proyecto (`/workspace`) y directorios temporales
- Las rutas relativas puras son permitidas

---

## 8. IA Nativa: Motor Soberano (Candle)

### Arquitectura de Inferencia
- **Motor:** Candle (HuggingFace) — inferencia nativa en Rust, sin wrapper Python. **100% local.**
- **Modelos soportados:** Phi-3, Qwen2, Qwen3, Llama (auto-detectados desde GGUF metadata).
- **Hardware:** CUDA (RTX 5070 Ti) o CPU fallback.
- **Feature flags:** `--features ai` para CPU, `--features "ai,cuda"` para GPU.
- **Sampling:** Temperature (0.7) + Top-P (0.9) + Top-K (40) + Repeat Penalty (1.1, last 64 tokens)
- **Guardia UTF-8:** `is_char_boundary()` en todos los puntos de streaming para prevenir panics con caracteres multibyte

### Flujo de Carga
1. Usuario selecciona `tokenizer.json` + modelo `.gguf` desde el panel de configuración del Motor Soberano.
2. Frontend invoca `cargar_modelo` → Tauri backend bloquea un thread para cargar en `AiState`.
3. El motor detecta la arquitectura del GGUF y carga los pesos en GPU/RAM.
4. Inferencia streaming vía `chat_soberano` — cada token se emite al frontend vía evento `soberano-stream`.
5. Métricas de inferencia (tokens de prompt y generados) se emiten vía `soberano-metrics`.
6. Descarga vía `descargar_modelo` — libera RAM/VRAM explícitamente.

### Integración en el Lenguaje Moset
```moset
:@ Cargar modelo en el REPL
naraka_cargar("modelo.gguf", "tokenizer.json")

:@ Inferir texto
respuesta = naraka("Explicá la teoría de cuerdas", 256)
mostrar respuesta

:@ Diagnóstico del motor
mostrar naraka_diagnostico()
```

---

## 9. Capacidades Agénticas: Manos del Soberano

El motor incluye endpoints nativos para ejecución agéntica segura:

| Función | Descripción | Seguridad |
|:--------|:------------|:----------|
| `soberano_escribir(ruta, contenido)` | Escritura de archivos con sandbox | `autorizar_ruta` + modo latente |
| `soberano_ejecutar(comando)` | Ejecución de shell restringida | Whitelist: `git`, `cargo`, `vite`, `npm run`, `rustc`, `python`, `node` |
| `soberano_analizar(archivo)` | Pipeline Lexer→Parser→Linter completo | Sin restricción |

Todas las funciones soberanas:
- Respetan el sandbox del Vigilante
- Se simulan automáticamente dentro de bloques `pensar {}` (modo latente)
- Retornan `[SIMULADO] ...` cuando están en Shadow Env

### Agente Autónomo (ToolInterceptor)
Además de los endpoints del lenguaje Moset, el IDE incluye un **agente autónomo** que permite al chatbot (Motor Soberano) invocar herramientas del sistema:

- **Backend:** `execute_agent_tool()` en `lib.rs` despacha `ToolCall` del módulo `agent.rs`
- **Frontend:** `ToolInterceptorCard` en `ChatPanel.tsx` intercepta las acciones y presenta al usuario botones **Permitir/Denegar** con un Diff View para ediciones de archivos
- **Herramientas:** `read_directory`, `read_file`, `write_to_file`, `run_command`
- ** NOTA:** El agente actualmente NO pasa por el Vigilante para validar sandbox/seguridad (BUG-043)

---

## 10. Registro de Bugs y Correcciones Propuestas

###  CRÍTICOS

| ID | Archivo | Línea | Bug | Corrección Propuesta |
|:---|:--------|:------|:----|:---------------------|
| BUG-001 | `ChatPanel.tsx` | 1-364 | **ARCHIVO ROTO** — Falta declaración del componente, estados React, refs, effects. El componente no compila. |  RESTAURADO - Se implementó correctamente la estructura React y streaming. |
| BUG-002 | `ChatPanel.tsx` | 196-199 | `streamBuffer` se usa en el closure de `setMessages` pero captura valor stale (closure capture problem). Siempre envía string vacío |  RESUELTO - Se usó un `useRef` para el stream buffer asincrónico. |
| BUG-003 | `lib.rs` (Tauri) | 11-22 | La función `ejecutar()` NO ejecutaba el código (solo parseaba). |  RESUELTO - Se conectó el evaluador asíncrono y se inyectó la salida estándar (`mostrar`) directamente a la PTY de xterm.js nativamente. |
| BUG-013 | `ChatPanel.tsx` | useEffect | **RESPUESTA DOBLE/TRIPLE** — React StrictMode crea 2 listeners para `naraka-stream`, duplicando cada chunk. |  RESUELTO - Guard con `listenerRef` + `cancelled` flag + cleanup correcto del listener anterior. |
| BUG-014 | `lib.rs` | 193 | **RESPUESTAS MUY CORTAS** — `max_tokens` hardcodeado a 1024 (~700 palabras). Insuficiente para planes detallados o generación de código. |  RESUELTO - `max_tokens` ahora es parámetro del comando Tauri, configurable desde UI (1K-8K). Default: 2048. |
| BUG-015 | `ai.rs` | 251 | **TEXTO REPETITIVO** — `LogitsProcessor` sin Top-P (nucleus sampling). El modelo entra en loops. |  RESUELTO - Agregado `top_p: Some(0.9)` al struct y pasado al constructor de `LogitsProcessor`. |

###  MODERADOS

| ID | Archivo | Línea | Bug | Corrección Propuesta |
|:---|:--------|:------|:----|:---------------------|
| BUG-004 | `linter.rs` | 77 | `reportar()` siempre emite `linea: 1, columna: 1` hardcodeado |  RESUELTO - Se añadió `Metadata` al U-AST y se procesa correctamente en el visitor paramétrico. |
| BUG-005 | `lib.rs` (Tauri) | 29-31 | `validate_code()` retorna `vec![]` si el lexer falla — silencia errores léxicos |  RESUELTO - Implementado retorno de Diagnósticos con errores léxicos reales. |
| BUG-006 | `evaluador.rs` | 462-466 | `Importar` es un placeholder que retorna `Nulo` |  RESUELTO - Resolución implementada re-ejecutando lexer/parser/evaluador sobre mod. |
| BUG-007 | `evaluador.rs` | 457-460 | `Esperar` ejecuta sincrónicamente, ignorando la semántica async |  RESUELTO - Documentado formalmente como bloqueante sin modificar AST a async-await. |
| BUG-008 | `App.tsx` | — | Al cerrar el IDE no se persisten pestañas abiertas ni posición del cursor |  RESUELTO - Se aplicó persistencia de todo el `layout` y tree state actual con localStorage. |
| BUG-009 | `App.tsx` | — | No hay mecanismo para cancelar inferencia de IA en curso |  RESUELTO - Implementado `AtomicBool` y API de interrupción explícita. |

###  MENORES

| ID | Archivo | Línea | Bug | Corrección Propuesta |
|:---|:--------|:------|:----|:---------------------|
| BUG-010 | `parser.rs` | 137 | Si inline (`si cond: val`) y Si bloque usan la misma función. Podría malinterpretar si hay whitespace |  RESUELTO - Validado para permitir asignaciones en condicional inline. |
| BUG-011 | `evaluador.rs` | 674-677 | Auto-colapso implícito de `Bit:~` en contexto booleano (sin `!`) — cambia `&self` a `&mut self` en `es_verdadero`. Innecesario el mut si RNG no modifica estado |  RESUELTO - Aceptado como by-design behavior, side-effect mut explícito. |
| BUG-012 | `evaluador.rs` | 819-826 | Whitelist de `soberano_ejecutar` usa `starts_with` con espacio final, lo que requiere exactamente el formato `"git "`. Falla con `"git"` solo |  RESUELTO - Tokenización por whitespace extraída para comparar comando puro. |

###  BUGS de Auditoría v4.0 (BUG-016 → BUG-027)

| ID | Archivo | Severidad | Bug | Estado |
|:---|:--------|:----------|:----|:-------|
| BUG-016 | `linter.rs` |  | `Diagnostic.severidad` es `String` libre en lugar de enum tipado — permite valores inválidos |  PENDIENTE |
| BUG-017 | `ai.rs` |  | Stub sin feature `ai` tiene firma `FnMut(String)` pero el real usa `FnMut(String) -> bool`. No compila sin feature |  RESUELTO — Stub actualizado con firma correcta |
| BUG-018 | `tauri_bridge.rs` |  | `writer.lock().unwrap()` puede causar panic si el mutex está poisoned |  PENDIENTE |
| BUG-019 | `tauri_bridge.rs` |  | Si PowerShell muere, el loop de lectura termina sin notificar al frontend — terminal congelada |  RESUELTO — Emite `pty-exit` al frontend |
| BUG-020 | `lib.rs` (Tauri) |  | `process::exit(0)` no ejecuta destructores — PTY child queda huérfano, handles no cerrados |  RESUELTO — Cleanup real con `kill()`+`wait()`, `motor.descargar()`, CUDA cache |
| BUG-021 | `evaluador.rs` |  | `pensar {}` clona TODO el entorno (memory spike con programas grandes) |  PENDIENTE |
| BUG-022 | `vm.rs` |  | Límite de iteraciones en la VM para evitar bucles infinitos no existía — podía colgar el hilo |  RESUELTO — Implementado timeout/límite de instrucciones en VM |
| BUG-023 | `App.tsx` |  | Race condition al cerrar tabs rápidamente — `activeTab` stale en closure |  RESUELTO |
| BUG-024 | `App.tsx`, `ChatPanel.tsx` |  | `invoke` importado dinámicamente cuando ya está importado estáticamente — redundante |  RESUELTO |
| BUG-025 | `ChatPanel.tsx` |  | `uid()` usa `Math.random()` — posible colisión en alta frecuencia |  RESUELTO |
| BUG-026 | `compiler.rs` |  | `importar` resuelve rutas relativas al CWD, no compilaba módulos anidados |  RESUELTO — Implementada compilación anidada en frontend |
| BUG-027 | `ai.rs` |  | Múltiples `eprintln!` de debug en producción — contamina stderr |  RESUELTO — Limpiado |
| BUG-043 | `lib.rs` (Tauri) |  | `execute_agent_tool` y `save_file_content` no validan sandbox vía Vigilante — el agente podría escribir/ejecutar fuera del directorio permitido |  RESUELTO — Sandbox Middleware Inyectado |
| BUG-044 | `ai.rs` |  | Streaming de tokens panicábamos al slicear UTF-8 multibyte (emojis). Fix: `is_char_boundary()` guards en 3 puntos de corte |  RESUELTO |
| BUG-045 | `vm.rs` | 🔴 | **Endianness mixta en `ConfigurarCatch`** — `emitir_salto` escribe big-endian pero `leer_u16()` lee little-endian. Offset incorrecto para saltos > 255 bytes. Latente: solo se manifiesta con bloques catch grandes. | ⏳ PENDIENTE |
| BUG-046 | `vm.rs` | 🟡 | `instruction_count` se reinicia a 0 en cada invocación de `ejecutar_interno()` tras un catch — programa con N catchs puede ejecutar 5M×N instrucciones evadiendo el guard | ⏳ PENDIENTE |
| BUG-047 | `vm.rs` | 🟡 | `Esperar` acepta enteros negativos silenciosamente (no duerme pero tampoco reporta error) | ⏳ PENDIENTE |
| BUG-048 | `vm.rs` | 🟡 | `CatchHandler` no propaga el mensaje de error al fallback — el usuario no puede inspeccionar qué falló | ⏳ PENDIENTE |

###  Issues de UX/UI (Auditoría v4.0)

| ID | Componente | Problema | Estado |
|:---|:-----------|:---------|:-------|
| UX-001 | `tauri_bridge.rs` | PTY tamaño fijo (24x80) — no responde a resize del panel |  RESUELTO |
| UX-002 | `App.tsx` | Panel "BUSCAR" es un input estático sin lógica de búsqueda |  RESUELTO |
| UX-003 | `App.tsx` | Panel "EXTENSIONES" lista items hardcodeados sin interactividad |  RESUELTO |
| UX-004 | `App.tsx` | StatusBar muestra `⎇ main` sin integración Git real |  RESUELTO |
| UX-005 | `App.tsx` | Posición del cursor `Ln 1, Col 1` hardcodeada — no se actualiza |  RESUELTO |
| UX-006 | `ChatPanel.tsx` | Sin botón de cerrar propio — solo se cierra vía ActivityBar |  RESUELTO |
| UX-007 | `App.tsx` | Cerrar tab modificada no pide confirmación — cambios se pierden |  RESUELTO |

---

## 11. Mejoras Estratégicas Propuestas

### 11.1 Arquitectura del Lenguaje
1. ~~**Span en el U-AST**~~ — (Completado)
2. ~~**Sistema de Módulos**~~ — (Completado)
3. ~~**Bytecode + VM**~~ — (Completado: Compilador + VM de pila con u16 constant pool, CallFrames, CatchHandlers)
4. **Async Real** — Integrar tokio runtime para `:,\` genuinamente asíncrono (actualmente `Esperar` es `thread::sleep` bloqueante)
5. **Pattern Matching** — Agregar `coincidir valor: caso1: ..., caso2: ...`
6. **Closures** — Funciones anónimas `:,] (x) x * 2` para programación funcional
7. **String Interpolation** — `"Hola {nombre}"` en lugar de concatenación manual

### 11.2 IA y Motor Naraka
1. ~~**Sampling Avanzado (Top-P)**~~ — (Completado: Top-P 0.9 implementado en ai.rs)
2. ~~**Cancelación de Inferencia**~~ — (Completado)
3. **Context Window Tracking** — Mostrar tokens usados vs disponibles en la UI
4. **RAG Local** — Embeddings locales para retrieval de documentos del proyecto
5. **Multi-modelo** — Permitir cargar varios modelos y switchear entre ellos

### 11.3 IDE y UX
1. ~~**Restaurar ChatPanel**~~ — (Completado)
2. ~~**Persistencia de Estado**~~ — (Completado: Pestañas, Settings y Sesiones guardadas)
3. ~~**Action Cards (Aplicar/Rechazar)**~~ — (Completado)
4. ~~**Anti-Colapso de Stream**~~ — (Completado)
5. ~~**System Prompts Extensos**~~ — (Completado)
6. ~~**Selector de Sesiones (Historial)**~~ — (Completado: Multi-agente activo)
7. **Autocompletado Moset** — Provider de Monaco con funciones nativas, keywords, y definiciones del usuario
8. **Multi-cursor y Refactoring** — Rename symbol, find references
6. **Diff View** — Vista de diferencias antes de aplicar cambios del agente
7. **Git Integration** — Status, commit, push desde la UI
8. **Temas** — Múltiples temas además de moset-dark

### 11.4 Seguridad
1. **Audit Log** — Log persistente de todos los comandos ejecutados por el Vigilante
2. **Permisos Granulares** — Por proyecto, por directorio, por usuario
3. **Sandboxing del Evaluador** — Límites de CPU time y memoria para prevenir loops infinitos

### 11.5 Troubleshooting — Bugs Frecuentes y Soluciones

####  El chat vuelca JSON del tokenizer (7MB de texto basura)
- **Síntoma:** Al chatear, el modelo empieza a emitir el contenido completo del `tokenizer.json` (miles de líneas de JSON con `added_tokens`, `vocab`, `merges`).
- **Causa raíz:** El formato del prompt no es compatible con la arquitectura del modelo. Si el prompt usa formato ChatML (`<|im_start|>`) pero el modelo es Phi-3 (que usa `<|system|>`), el modelo se confunde y vuelca su vocabulario.
- **Solución:** El sanitizer en `ChatPanel.tsx` (`sanitizeStreamChunk`) detecta patrones de JSON dump en tiempo real. Si la densidad de caracteres JSON (`{}[]":,`) supera el 25% del texto acumulado y es >1000 chars, se bloquea el stream y se muestra un error amigable.
- **Prevención:** Verificar que la arquitectura detectada (Qwen2/3/Phi3/Llama) coincida con el modelo cargado. El prompt builder adapta el formato automáticamente.

####  El chat responde doble o triple
- **Síntoma:** La misma respuesta aparece 2 o 3 veces en el chat.
- **Causa raíz:** React StrictMode (activo en desarrollo) desmonta y remonta los componentes. El `useEffect` que registra el listener de `naraka-stream` se ejecuta 2 veces, creando 2 listeners. Cada chunk del backend es procesado por ambos.
- **Solución:** Se implementó un `listenerRef` que guarda la referencia al listener activo. En cada mount, se limpia el listener anterior antes de crear uno nuevo. Un flag `cancelled` evita que el listener viejo procese chunks después del unmount.
- **Archivo:** `ChatPanel.tsx`, useEffect del listener de stream.

####  Las respuestas son muy cortas (~2 párrafos)
- **Síntoma:** Naraka responde brevemente incluso cuando se pide un plan detallado o código extenso.
- **Causa raíz:** `max_tokens` estaba hardcodeado a 1024 en `lib.rs`. 1024 tokens ≈ 700 palabras.
- **Solución:** `max_tokens` ahora es un parámetro del comando Tauri `chat_naraka`, configurable desde la UI del ChatPanel. Valores disponibles: 1K (corto), 2K (normal, default), 4K (largo), 8K (máximo).
- **Archivos:** `lib.rs` (parámetro `max_tokens: Option<u32>`), `ChatPanel.tsx` (estado `maxTokens` + selector visual).

####  El modelo repite texto en loops
- **Síntoma:** Después de una respuesta inicial correcta, el modelo empieza a repetir la misma frase o párrafo indefinidamente.
- **Causa raíz:** El `LogitsProcessor` de Candle se inicializaba con `top_p: None`, lo que desactiva nucleus sampling. Sin Top-P, el modelo tiende a seleccionar siempre los mismos tokens de alta probabilidad.
- **Solución:** Se agregó `top_p: Some(0.9)` al struct `MotorNaraka`. También se expandieron los stop tokens para incluir todos los marcadores de fin de turno de Qwen3, Llama3, y Phi3.
- **Archivo:** `ai.rs` (campo `top_p`, línea de `LogitsProcessor::new`).

####  La UI colapsa con respuestas masivas
- **Síntoma:** El chat se congela o become unresponsive cuando el modelo genera respuestas muy largas.
- **Causa raíz:** El DOM React no puede renderizar eficientemente >15K caracteres de texto formateado con markdown parsing.
- **Solución:** El componente `TruncatedContent` trunca respuestas >15K chars con un botón "Ver completa". El `MAX_RENDER_CHARS` se aplica tanto al stream en vivo como al mensaje final.
- **Archivo:** `ChatPanel.tsx`, constante `MAX_RENDER_CHARS` y componente `TruncatedContent`.

####  E0597 — Lifetime de `State` en MutexGuard (BUG-031)  FIJADO
- **Síntoma:** No compilaba. Error `E0597: borrowed value does not live long enough` en `tauri_bridge.rs` y `lib.rs`.

####  Saturación de VRAM por Límite de Contexto (OOM CUDA)  FIJADO
- **Síntoma:** Al solicitar contexto de chat o autocompletado en proyectos poblados, Tauri arroja error de CUDA `Out of Memory` y la inferencia crashea.
- **Causa raíz:** La constante `MAX_CHARS` estaba en 48.000 (~12K tokens). El peso del modelo más este KV-Cache monstruoso superaba los límites de la GPU local.
- **Solución:** Consolidado `MAX_CHARS: 24000` (~6K tokens) en `src-tauri/src/lib.rs`. El threshold garantiza un buffer seguro para inferir sin crashear.
- **Causa raíz:** El `MutexGuard` temporal de `.lock()` vivía más que el binding `State<'_, PtyState>` de Tauri, violando las reglas de lifetime de Rust.
- **Solución:** Agregar `;` después del bloque `if let` para forzar el drop del `MutexGuard` antes que el `State`.
- **Patrón:** Gotcha clásico de Tauri 2.x con `State` + `Mutex`. Siempre forzar el drop explícito del guard.
- **Archivos:** `tauri_bridge.rs:88`, `lib.rs:314`.

####  Parser tests ignoraban `Metadata` wrapper (BUG-033)  FIJADO
- **Síntoma:** 9 tests del parser fallaban con `assertion failed: matches!(&prog.sentencias[0], Nodo::Mostrar(_))`.
- **Causa raíz:** `parsear_sentencia()` envuelve todo nodo en `Nodo::Metadata { linea, columna, nodo }`. Los tests hacían match directo al nodo interno sin desempaquetar.
- **Solución:** Función helper `unwrap_meta()` que transparentemente quita el wrapper. Todos los tests actualizados.
- **Archivo:** `parser.rs` (tests module).

####  `pensar {}` no aislaba variables del scope padre (BUG-036)  FIJADO
- **Síntoma:** `x = 1; pensar { x = 999 }; x` devolvía `999` en vez de `1`.
- **Causa raíz:** `Nodo::Asignacion` llamaba a `entorno.asignar()` que recorre TODOS los scopes en reversa. Si `x` existía en el scope padre, se modificaba directamente, ignorando el push/pop del shadow env.
- **Solución:** Cuando `self.modo_latente == true`, la asignación SIEMPRE llama a `definir()` en el scope actual, creando un shadow sin tocar el padre.
- **Archivo:** `evaluador.rs:257`.

####  Path Traversal check insuficiente en Vigilante (W-004)  FIJADO
- **Síntoma:** El Vigilante solo chequeaba `../` pero no `..\` (Windows backslash) ni encoding URL como `%2e%2e%2f`.
- **Solución:** URL-decode manual de `%2e`, `%2f`, `%5c` antes de la comparación, y check de ambos separadores.
- **Archivo:** `vigilante.rs:181`.

####  `on_print` callback no es `'static` safe (BUG-034) — Pendiente
- **Riesgo:** El trait object `Box<dyn Fn(&str) + Send + Sync>` en `Evaluador` funciona hoy, pero si el compilador se vuelve más estricto con futuras versiones de Tauri, podría fallar.
- **Solución futura:** Reemplazar por canal `mpsc` para desacoplar evaluador de framework UI.

####  `stdlib::shell()` bypaseable sin Vigilante (W-001)  FIJADO
- **Riesgo:** Si alguien importa `stdlib::shell()` directamente desde Rust, el Vigilante se bypasea. Además, `leer()` y `escribir()` no consultaban al Vigilante para path traversal.
- **Solución:** `leer()` y `escribir()` en el dispatcher del Evaluador ahora llaman a `self.vigilante.autorizar_ruta()` antes de la operación de I/O. El `shell()` ya pasaba por `self.vigilante.autorizar()` (línea 813).
- **Archivos:** `evaluador.rs:824,838`.

####  `MotorNaraka` siempre inicializado (W-003)  FIJADO
- **Riesgo:** El Evaluador instanciaba `MotorNaraka::nuevo()` en el constructor, que hace probe de CUDA incluso cuando se usa solo como CLI para evaluar scripts `.et` sin IA.
- **Solución:** Campo cambiado a `Option<MotorNaraka>`. Método helper `motor_naraka()` hace lazy init en el primer acceso.
- **Archivos:** `evaluador.rs:157,182,190`.

####  PTY: Mutex poisoned causa panic (BUG-018)  FIJADO
- **Síntoma:** Si un thread panicó sosteniendo un Mutex del PTY, el siguiente acceso causa `unwrap()` panic crash.
- **Solución:** Reemplazados todos los `expect()` en `spawn_pty()` por `match` con emit de `pty-error` al frontend. Los locks usan `map_err`.
- **Archivo:** `tauri_bridge.rs`.

####  PTY no notifica muerte al frontend (BUG-019)  FIJADO
- **Síntoma:** Cuando PowerShell muere, el frontend no sabe y sigue mostrando un terminal vacío.
- **Solución:** El reader thread emite `pty-exit` con mensaje descriptivo tanto en EOF como en error de lectura.
- **Archivo:** `tauri_bridge.rs:112-121`.

####  PTY child process queda zombie (BUG-020)  FIJADO
- **Síntoma:** Al cerrar el IDE, el proceso `powershell.exe` quedaba vivo consumiendo recursos.
- **Solución:** Nuevo comando `kill_pty` que hace `kill()` + `wait()`. El reader thread también hace `wait()` al terminar. El `on_window_event(CloseRequested)` mata el child.
- **Archivo:** `tauri_bridge.rs:45-58`, `lib.rs:320`.

---

## 12. Roadmap y Estado Actual

###  Implementado (v0.1 → v0.2)
- [x] Lexer multi-idioma (es/en) con tokens especiales y tracking de posición
- [x] Parser descenso recursivo completo con precedencia de operadores
- [x] Tracking de líneas/columnas en el U-AST para reportes precisos del Linter (BUG-004)
- [x] Cancelación real de inferencia desde el frontend (BUG-009)
- [x] Sistema de módulos preliminar (`importar` resuelve archivos) (BUG-006)
- [x] Async/Await real o documentado sincrónico bloqueante (BUG-007)
- [x] Persistencia de pestañas y estado del IDE en localStorage (BUG-008)
- [x] U-AST serializable con Serde (JSON output vía CLI)
- [x] Evaluador tree-walking con scoping, retorno explícito e implícito
- [x] Motor Cuántico (Bit:~, Bit:[p], colapso vía !, auto-colapso en contexto booleano)
- [x] Moldes atómicos y elásticos (corteza + espacio latente/núcleo)
- [x] Shadow Environment (`pensar {}`) con aislamiento completo
- [x] Motor Naraka (Candle GGUF: Phi3, Qwen2/3, Llama — CUDA/CPU)
- [x] Vigilante (security middleware con 4 niveles de soberanía)
- [x] PTY real integrada (PowerShell via portable-pty + xterm.js)
- [x] IPC bridge Tauri  Core Engine
- [x] Linter con inferencia de tipos y detección de reasignación
- [x] Endpoints agénticos (soberano_escribir/ejecutar/analizar)
- [x] Restaurar ChatPanel.tsx (componente fundamental reconstruido) (BUG-001)
- [x] Modos de agente (Planear/Actuar) en el chat
- [x] Botón de copiar respuesta del agente
- [x] Context toggle (incluir archivo activo en el prompt)
- [x] Cierre limpio con liberación de VRAM
- [x] 78 tests unitarios y E2E en backend Rust (0 failures)
- [x] Fix respuesta doble/triple — guard contra StrictMode doble listener (BUG-013)
- [x] max_tokens configurable desde UI (1K/2K/4K/8K) — default 2048 (BUG-014)
- [x] Top-P nucleus sampling (0.9) en Motor Naraka (BUG-015)
- [x] Action Cards con botones Aplicar/Rechazar para cambios de código
- [x] System prompts extensos y estructurados en español
- [x] Stream sanitizer anti-colapso (detecta JSON dumps del tokenizer)
- [x] Iconos retro (.ico) en el file tree + SVGs en el sidebar
- [x] Animaciones Animista (glassmorphism, fadeIn, swingIn, msgEnter)
- [x] Listas numeradas en el renderer de chat
- [x] Botón copiar inline en bloques de código
- [x] Stop tokens expandidos para Qwen3/Llama3 (endoftext, eot_id, im_start)

###  Próximos Pasos (v0.3 → v1.0) 

**Fase 6 — Hardening & Polish:**
- [x] Estabilización del arranque y SplashScreen: Handlers de `MOSET_ERROR`, captura stderr y validación estricta de Exit Code en el launcher. 
- [x] Fix Configuración Tauri Updater: Dummy endpoint (`https://127.0.0.1/update.json`) restaurado para prevenir deserialization panics. 
- [x] Fix `E0597` lifetime MutexGuard/State en Tauri bridge (BUG-031) 
- [x] Fix parser tests ignoraban `Metadata` wrapper — 9 tests reparados (BUG-033) 
- [x] Fix `pensar {}` no aislaba variables del scope padre (BUG-036) 
- [x] Fix path traversal en Vigilante — Windows backslash + URL encoding (W-004) 
- [x] Fix PTY mutex poisoned — eliminados todos los `expect()`, emisión `pty-error` (BUG-018) 
- [x] Fix PTY notifica muerte al frontend vía `pty-exit` (BUG-019) 
- [x] Fix PTY cierre limpio + nuevo comando `kill_pty` (BUG-020) 
- [x] Fix `leer()`/`escribir()` validan sandbox vía Vigilante (W-001) 
- [x] Fix `MotorNaraka` lazy con `Option` en el Evaluador (W-003) 
- [x] Persistir estado de extensiones en JSON (BUG-035) 
- [x] Fix stub `ai.rs` sin feature `ai` — firma incompatible (BUG-017) 
- [x] Proteger `mientras` contra loops infinitos (BUG-022) 
- [x] Resolver imports relativos al archivo importador (BUG-026) 
- [x] Configurar `cl.exe` en PATH para compilación CUDA — `cl.exe` añadido al PATH de usuario + `NVCC_PREPEND_FLAGS` en `.cargo/config.toml` 
- [x] Fix `target/` bloat (18.5→1.3 GB) — `incremental = false` en `.cargo/config.toml` + `.gitignore` root 
- [x] Fix desbordamiento de tokens al inyectar contexto pesado — truncamiento límite de chars en `fetch_full_context`. (Este era el causante real de la alucinación de código en Python por colapso del RoPE) (BUG-041) 
- [x] React ErrorBoundary global y CSP laxo en `tauri.conf.json` para no bloquear Monaco WebWorkers (BUG-042) 
**Fase 7 — Evolución del Lenguaje (La Máquina Virtual):**
- [x] Diccionario OMNÍGLOTA completo (Español, Inglés, Italiano, Portugués, Francés, Chino, Japonés, Alemán simultáneos en Lexer) 
- [x] `importar` funcional — resolver paths reales de `.et` y ejecutar módulos 
- [x] Error Recovery en Parser — acumular diagnósticos (`parsear()` acumula errores + `sincronizar()`) 
- [x] REPL multi-línea (detectar bloques incompletos, prompt `...>` en `main.rs`) 
- [x] VM / Bytecode Arquitecture — Estructura `vm.rs`, `chunk.rs`, `opcode.rs`, `value.rs` 
- [x] VM Validation — Hand-assembly tests function and push parameters to the stack natively 
- [x] Compiler (Moset Compiler) — AST → Bytecode con variables globales/locales, condicionales, bucles, funciones, texto, y todos los operadores 

**Fase 12.1 — Estabilización VM (Auditoría Post-Callframe):**
- [x] Migración u16 completa — `DefinirGlobal`, `ObtenerGlobal`, `AsignarGlobal` leen operandos de 2 bytes en VM 
- [x] `Rc<Chunk>` — CallFrame y Valor::Funcion comparten chunks via Rc (O(1) en lugar de deep clone) 
- [x] Guards de seguridad — `MAX_PILA=256`, `MAX_FRAMES=64`, `MAX_INSTRUCTIONS=5M` 
- [x] Tests de integración — `test_funcion_con_callframe` + `test_recursion_factorial` (59 tests total) 
- [x] `CatchHandler` struct + stack unwinding en `ejecutar()` → `ejecutar_interno()` 
- [x] `ConfigurarCatch` / `LimpiarCatch` / `LanzarError` opcodes implementados en VM 
- [x] `Esperar` opcode — `thread::sleep` bloqueante con valor en ms desde la pila 
- [x] Compilador: `Nodo::CatchEnLinea` emite `ConfigurarCatch` + saltos con backpatching 
- [x] Compilador: `Nodo::Esperar` emite `OpCode::Esperar` 
- [ ] BUG-045: Fix endianness mixta en `ConfigurarCatch` (crítico latente) 
- [ ] BUG-046: Mover `instruction_count` al struct VM para persistir entre catches 
- [ ] Tests de integración para CatchEnLinea y Esperar 

**Fase 8 — IA Soberana:**
- [x] Corpus Generator — `generate_corpus.py` extrae `.et` a `moset_corpus.txt` 
- [x] Autocompletado IA en Monaco — `autocomplete_naraka` + `InlineCompletionsProvider` con debounce 800ms 
- [x] Fine-tuning run — PyTorch cu128 + `fine_tune_naraka.py` en Strix (RTX 5070 Ti) 
- [x] Conversión GGUF — modelo entrenado convertido a `moset_naraka.gguf` 
- [x] Top-K y repetition penalty — `aplicar_filtros()` en ai.rs con Top-K=40 y RepPenalty=1.1 
- [x] Context window tracking — evento `soberano-metrics` con CTX/GEN tokens en ChatPanel 

**Fase 9 — Distribución:**
- [x] Installer MSI/NSIS con `cargo tauri build` 
- [x] Auto-updater con `tauri-plugin-updater` y endpoint `file://` local 
- [x] `moset` CLI en PATH del sistema mediante `install_cli.ps1` 
- [x] Cross-OS CI/CD Pipeline en GitHub Actions (Win/Mac/Linux) + Desacople de CUDA por default 

**UX/UI:**
- [x] PTY resize dinámico (UX-001)
- [x] Cursor position tracking en StatusBar (UX-005)
- [x] Confirmación al cerrar tab con cambios sin guardar (UX-007)
- [x] Agregado de Inputs de Búsqueda a Paneles (UX-002) 
- [x] Panel de extensiones funcional (UX-003) 
- [x] Botón cerrar panel AI chat integrado (UX-006) 
- [x] Búsqueda real en archivos — `search_workspace` en Rust + UI sidebar interactiva 
- [x] Autocompletado inteligente en Monaco (InlineCompletionsProvider + debounce) 
- [x] Diff View antes de aplicar cambios del agente — Monaco DiffEditor en ChatPanel 
- [x] Git integration — `git_status` badges (M/U/D) + botón Auto-Sync (commit+push) 

**Fase 10 — Estabilización Motor Soberano (Auditoría v5.0):**
- [x] Renaming completo de Motor Naraka a Motor Soberano (comandos, eventos, UI) 
- [x] Fix UTF-8 streaming panic — `is_char_boundary()` guards en 3 puntos de `ai.rs` (BUG-044) 
- [x] Fix desbordamiento RoPE por contexto excesivo — `MAX_CHARS=10000` en `fetch_full_context` (BUG-041) 
- [x] Fix stop-token `</s>` inyectado en prompts genéricos para prevenir alucinaciones 
- [x] React ErrorBoundary global contra pantalla negra (BUG-042) 
- [x] Documentación del módulo `agent.rs` y flujo ToolInterceptor 
- [x] Auditoría integral de la Biblia con 14 correcciones 
- [x] BUG-043 (Crítico) — Vigilante inyectado en `execute_agent_tool`: `autorizar_ruta()` antes de `write_to_file`/`replace_file_content` y `autorizar()` antes de `run_command`. El agente autónomo ahora opera con confianza implícita `None`, bloqueando comandos peligrosos/cautelosos salvo Bit explícito 
- [x] BUG-027 — `println!("MOSET_EJECUTAR: {}"...)` eliminado de `ejecutar` en producción (ya no vuelca código fuente completo a stdout) 
- [x] BUG-026 — `Compilador` ahora expone campo `pub ruta_base: Option<PathBuf>`. El CLI (`main.rs`) lo instancia con el directorio canónico del archivo fuente, para que futuros `importar` relativos se resuelvan desde el archivo y no del CWD del proceso 

**Fase 11 — Estabilización UI, Omniglotismo y Modularización Extrema:**
- [x] **Modularización Exitosa de App.tsx** — Descomposición del monolito inicial gigante (+2000 líneas) en partes orquestadas (hooks en `src/hooks/*`) y componentes renderizables (`src/components/*`), erradicando TS bugs conflictivos.
- [x] **Omniglotismo Absoluto Confirmado** — El motor léxico fue expandido abarcando el 80% de lenguajes base del mundo (sino, if, se, wenn, もし, etc).
- [x] **UI Premium Glassmorphism** — Implementación de modal de Bienvenida (`<LanguageModal/>`), desenfoques nativos `.glass` y animaciones de portal unificadas con la marca de Identidad Cuántica.
- [x] **Auditoría e Inyección de Consciencia Remota en ChatPanel** — Mapeo del `localStorage` interceptando la configuración Vigilante de Nódulos de la UI y transpilándolas al Sistema Operativo de agentes en la nube (OpenAI, Mistral, Anthropic) para comportamiento soberano sin importar la API subyacente.
- [x] **Sandbox Extendido en Vigilante** — Expansión de directorios confiables en `vigilante.rs` mitigando bloqueos falsos positivos en workspaces secundarios (ej. S:\Data Strix).
- [x] **RAG Heurístico** — Eliminado el truncado ciego. Implementada puntuación de relevancia léxica en `fetch_full_context` extrayendo el subset crítico por query de usuario sin romper los limitantes de token de LMM.
- [x] **Mojibake Fix (SSE UTF-8)** — Migrado parseo en `cloud_ai.rs` a un `BufReader::lines()` protegiendo los bytes multi-byte frente al troceado en stream de acentos/eñes, lo que previene rupturas de JSON.
- [x] **Sanitización Segura de Tags Parciales** — Removidos filtros Regex destructivos (`/<\|?$/g`) responsables de la amputación del `</think>` nativo del modelo, logrando un DOM resiliente.
- [x] **Tauri Capabilities ACL v2 (Build Fix)** — Resolución del pánico de validación en Tauri 2.0 (`failed to run custom build command`) eliminando identificadores huérfanos (`moset-ide:default`, `app:default`) del archivo `capabilities/default.toml`, logrando un pipeline de empaquetado 100% estable.

---

**Licencia:** PolyForm Noncommercial 1.0.0
---

<div align="center">
  <i>Moset 2026 - Desarrollado por <b>narakastudio.com</b></i>
</div>


---

## Última Actualización

**2026-04-20 — Fase 12: Estabilización Motor Visual + Arquitectura mos.et**

### Motor de Ejecución Visual (MosetOutputPanel)
- [x] **Backend Rust refactorizado**: Comando ejecutar ahora retorna JSON estructurado con tipos (quantum, molde, header, error, 	ext, separator) via classify_output_line.
- [x] **MosetOutputPanel.tsx**: Panel visual premium con *glassmorphism*, barras de probabilidad cuántica, tarjetas de moldes, soporte copy-to-clipboard y fuentes locales (sin dependencia Google Fonts).
- [x] **Arquitectura de Eventos Global**: unMosetCode escucha el evento un-moset-code va window.addEventListener. El handler del event usa invoke() directo para evitar stale closures con deps=[].
- [x] **Integración Explorador**: Menú contextual de archivos .et incluye opción "▶ Ejecutar (Run Moset)" que dispara el CustomEvent con el contenido del archivo.
- [x] **Integración ChatPanel**: Botón "▶ Ejecutar" en la ActionCard post-aplicación de código, permitiendo testear el código generado por la IA de forma inmediata.

### Arquitectura mos.et (Plataforma del Lenguaje)
- [x] **Unificación de examples**: Las dos carpetas examples/ (raíz y core-engine/) fusionadas en una única moset-ecosystem/mos.et/examples/ con 15 archivos .et.
- [x] **Carpeta mos.et/ creada**: Super-carpeta semántica (análoga a .github) que agrupa toda la teoría y plataforma del lenguaje, separada del motor duro de Rust (core-engine).
- [x] **moset-lang/idiomas_humanos/**: Renombrada desde diccionarios/. Contiene es.toml y en.toml (mapeo palabra humana → TOKEN U-AST).
- [x] **moset-lang/idiomas_computadora/**: Nueva carpeta creada. Reservada para futuros conectores (python.toml, js.toml) que permitan a Moset actuar como Orquestador Políglota.
- [x] **orquestadores/**: Nueva carpeta dentro de mos.et/. Reservada para puentes web (Vercel Serverless, Node Express, Python Bridge) que expondrán el Motor Moset a la web sin requerir el IDE.

### Visión Arquitectónica Registrada
### Visión Arquitectónica Registrada
- **Moset como Orquestador Universal**: El lenguaje puede actuar como "burbuja soberana" que gobierna Python, Java, Node.js u otros lenguajes mediante bloques @python {} o detección automática de sintaxis externa. El usuario final solo escribe .et; los conectores hacen el trabajo sucio invisible.
- **Ruta Web sin IDE**: Tres caminos a futuro: (1) WASM para ejecución en navegador, (2) API Serverless via Vercel + Firebase, (3) CLI moset archivo.et sin interfaz gráfica.
- **Arquitectura de 3 capas de Diccionarios**: Palabras humanas (idiomas_humanos/), plantillas de dominio (examples/), y gramáticas de lenguajes externos (idiomas_computadora/) — todo bajo mos.et/.

**Fase F — Soporte Funcional y Closures (Completada):**
- [x] Soporte en AST para `Nodo::Closure` diseñado puramente como expresión.
- [x] VM y Compilador soportan el ciclo completo de instanciación de funciones anónimas (`Valor::Closure`).
- [x] Soporte de capturas (Upvalues) mediante la propagación de scopes y compilador hijo.
- [x] Bug crítico resuelto: Stack Underflow reparado al diferenciar declaraciones `Nodo::Funcion` de expresiones de función (`Nodo::Closure`).
- [x] Sintaxis Superficial (Token `:,)`): Implementada en el Lexer y Parser. Soporte total para closures inline con retorno implícito y closures de bloque.


**Fase G � Auditor�a Definitiva Cero Bugs (Completada):**
- [x] **Zombies PTY (BUG-019/BUG-020) Erradicados**: Se implement� una destrucci�n quir�rgica de los procesos hu�rfanos de PowerShell en Windows. En el evento \CloseRequested\ (\lib.rs\) y en \kill_pty\ (\	auri_bridge.rs\), ahora se libera expl�citamente el writer, se hace \.take()\ del proceso hijo para asegurar el \wait()\, y fundamentalmente se hace un \drop\ forzado del handle \master\ de ConPTY. Esto colapsa el t�nel desde su ra�z y elimina todo rastro de procesos hu�rfanos en memoria.
- [x] **Silenciamiento de Warnings**: Eliminadas m�ltiples advertencias de c�digo inalcanzable (\unreachable_patterns\) por duplicaciones de llaves en \lexer.rs\.
- [x] **Limpieza del AST**: Se estandariz� la instanciaci�n estructural de \MoldeSchema\ (\compiler.rs\) protegiendo variables no usadas con padding (\_\).
- [x] **Refinamiento de Evaluaci�n L�gica**: La funci�n en desuso \	ry_eval_literal\ ha sido silenciada limpiamente (\_try_eval_literal\) para reservar su firma estructural sin triggerear el linter del compilador de Rust.
- [x] **Consolidaci�n de Tests**: Suite finalizada con +62 unit tests (incluyendo closures) ejecutando al 100% de solidez.
- [x] **Generaci�n de Ecosistema Documental**: Generaci�n del HUB global Documentacion_Moset (en modo Premium / Glassmorphism) que bifurca \rquitectura\, \lenguaje\, \ide\, \ia\ y \ugs\.


## Actualización (25/04/2026)
- Integración completa de MCP (Model Context Protocol).
- Integración completa de LSP (Language Server Protocol) para diagnósticos autónomos de Rust.
- Auto-Compresión Contextual en el chat para gestión inteligente de tokens.
