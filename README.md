<div align="center">
  <img src="logos%20moset/Logo%20Moset%20v2.png" alt="Moset Logo" width="200" />
  
  # Moset Ecosystem
  **Inteligencia Soberana. Desarrollo Nativo.**

  [![CI/CD](https://github.com/narakastudio/moset/actions/workflows/moset-ci.yml/badge.svg)](https://github.com/narakastudio/moset/actions/workflows/moset-ci.yml)
  [![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0)
  [![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-yellow.svg)](https://tauri.app/)
</div>

<br/>

**Moset** (del selk'nam: *"Soberanía"*) es mucho más que un framework; es un ecosistema completo para el desarrollo de Inteligencia Artificial local, privada y de alto rendimiento. Desarrollado por **Naraka Studio**, Moset combina la potencia inmaculada de **Rust** con la flexibilidad visual de **Tauri** y **React**, creando un IDE revolucionario que corre IA nativa sin ataduras a la nube.

---

## 🌌 Visión y Arquitectura

Para entender a fondo la filosofía, los fundamentos técnicos estructurales y el "Lore" detrás de este proyecto, te invitamos a leer nuestra documentación central:

👉 **[Leer La Biblia de Moset](./Biblia_Moset.md)**

## 🚀 Características Principales

- **Privacidad Absoluta**: Los modelos de IA corren en tu hardware, fuera de la red.
- **Rendimiento Nativo**: Motor `core-engine` escrito 100% en Rust.
- **Aceleración Multiplataforma**: Soporte opcional para CUDA, además de compatibilidad probada en Windows, macOS y Linux.
- **Frontend Glassmorphism**: Entorno de desarrollo (IDE) con diseño inmersivo y de vanguardia bajo `naraka-ide`.
- **Moset-Lang**: Un lenguaje propio diseñado para interoperabilidad semántica con LLMs.

## ⚙️ Estructura del Repositorio

El monorepo está organizado de la siguiente manera:

```text
/moset-ecosystem
 ├── core-engine/      # Motor backend Rust puro
 ├── naraka-ide/       # Frontend Tauri + React
 ├── moset-lang/       # Librería del lenguaje de Moset
 └── scripts/          # Automatizaciones, descargas y fine-tuning de modelos LLM
/logos moset/          # Identidad Visual
/Iconos Retro/         # Assets gráficos
```

## 🛠️ Instalación y Compilación Básica

### Requisitos
- **Rust** y **Cargo**
- **Node.js** y **npm** (para Tauri)

### Correr el Entorno de Desarrollo (IDE)

```bash
cd moset-ecosystem/naraka-ide
npm install
npm run tauri dev
```

> **Nota:** La descarga y carga de los modelos pesados locales (`.safetensors`, `.gguf`) se configuran desde los scripts integrados, los cuales son ignorados por control de versiones nativamente por tamaño.

---
<div align="center">
  <i>Construido en Argentina por <b>Naraka Studio</b>.</i>
</div>
