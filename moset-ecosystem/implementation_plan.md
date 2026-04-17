# Auditoría y Reparación del Ecosistema Moset

El objetivo de este plan es analizar y reparar los errores identificados en la auditoría general del proyecto `Moset` (tanto en `core-engine` como en `naraka-ide`), y reflejar estos cambios en `Biblia_Moset.md`.

## Proposed Changes

### Core Engine (Backend Rust)

Se van a corregir múltiples errores de buenas prácticas (`clippy`) y eliminarán posibles statements de debug sueltos (`eprintln!`/`println!`).  Además, se validará que las correcciones de bugs mencionadas en la Biblia hayan sido realmente implementadas.

#### [MODIFY] `core-engine/src/evaluador.rs`
- Corregir `clippy::type-complexity` definiendo un alias de tipo o simplificando la firma para `on_print`.
- Eliminar el bloque repetido en `if self.modo_latente` (`clippy::if-same-then-else`).
- Cambiar la combinación `.trim().split_whitespace()` a simplemente `.split_whitespace()` (`clippy::trim-split-whitespace`).
- Sustituir el `match` por the question mark operator `?` en las llamadas que puedan fallar (`clippy::question-mark`).
- Remplazar `args.len() < 1` con `args.is_empty()` (`clippy::len-zero`).

#### [MODIFY] `core-engine/src/lexer.rs`
- Simplificar llamadas redundantes `map_or` por `is_some_and` (`clippy::unnecessary-map-or`).
- Actualizar comparación manual de rangos `prob < 0.0 || prob > 1.0` a usa la función `contains(&prob)` (`clippy::manual-range-contains`).

#### [MODIFY] `core-engine/src/parser.rs`
- Sustituir el uso innecesario de `map_or` por `is_some_and` en las validaciones de char (`clippy::unnecessary-map-or`).

#### [MODIFY] `core-engine/src/vm/chunk.rs`
- Implementar el trait `Default` para la estructura `Chunk` y reparar the fallback from custom implementation (`clippy::new-without-default`).

#### [MODIFY] `core-engine/src/vm/mod.rs`
- Corregir el the module architecture problem that forces `clippy::module-inception`.

#### [MODIFY] `core-engine/src/ai.rs`
- Eliminar o cambiar a macros de bitácora (`log`) los llamados estáticos a terminales como `eprintln!` o `println!` (referente al BUG-027).

### Naraka IDE (Frontend React + Tauri)

Se van a corregir los problemas de TypeScript detectados durante el linting y se van a crear los elementos interactivos o interactuables listados como pendientes en la Biblia de Moset.

#### [MODIFY] `naraka-ide/src/App.tsx`
- **TypeScript Fixes**: Remover la variable no utilizada `brainIcon`.
- **UX-002**: Agregr un placeholder interactivo y lógico elemental al Panel de "BUSCAR".
- **UX-003**: Dar vida al panel de "EXTENSIONES", eliminando referencias al "hardcoding" e introduciendo un flujo simulado para cargar plugins locales si estuviesen estandarizados.

#### [MODIFY] `naraka-ide/src/ChatPanel.tsx`
- **UX-006**: Agregar botón de "Cerrar Panel" expuesto al componente de interfaz (ActivityBar o Layout parent) para omitir dicho panel desde su mismo control.

### Documentación

#### [MODIFY] `Biblia_Moset.md`
- Actualizar el apartado 10 *Registro de Bugs y Correcciones Propuestas* para reflejar el cierre explícito de los bugs:
  - BUG-016 (Linter enums tipados - En status actual revisado en codebase: Resuelto)
  - BUG-021 (`Pensar {}` - En status actual revisado en codebase: Resuelto)
  - BUG-027 (`eprintln!` in ai.rs - Serán eliminados en este fix)
- Actualizar apartado de bugs relacionados a `UX` para marcar los UX-002, UX-003 y UX-006 como ✅ RESUELTO.
- Acomodar el estado del Roadmap/Phase a medida de lo necesario.

## Verification Plan

### Automated Tests
- Ejecutar `cargo check` y `cargo clippy -- -D warnings` en `core-engine` y lograr exit status 0 (0 errors, 0 warnings).
- Ejecutar `npm run check` (o `npx tsc`) en `naraka-ide` y lograr compilation zero-errors en TypeScript.

### Manual Verification
- Comprobar lectura en el IDE Naraka: "Cerrar" el chat, buscar el Search feature y visualizar Extension status.
