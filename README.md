<div align="center">
  <img src="moset-ecosystem/naraka-ide/src/assets/moset-logo.png" alt="Moset Logo" width="200" />
  
  # Moset Ecosystem
  **Sovereign Intelligence. Native Development.**

  [![CI/CD](https://github.com/narakastudio/moset/actions/workflows/moset-ci.yml/badge.svg)](https://github.com/narakastudio/moset/actions/workflows/moset-ci.yml)
  [![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0)
  [![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-yellow.svg)](https://tauri.app/)

  <br>
  <a href="https://www.paypal.com/donate/?hosted_button_id=SJEV4XPZGFNP6">
    <img src="https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal" />
  </a>
  <br>
  <i>Created and maintained by <b><a href="https://narakastudio.com">narakastudio.com</a></b></i>
</div>

<br/>

**Moset** (from Selk'nam: *"Sovereignty"*) is much more than a framework; it is a complete ecosystem for developing local, private, and high-performance Artificial Intelligence. Developed by **Naraka Studio**, Moset combines the spotless power of **Rust** with the visual flexibility of **Tauri** and **React**, creating a revolutionary IDE that runs native AI without relying on the cloud.

---

## 🎨 Screenshots
*(Replace IMAGEN1, IMAGEN2, etc. with the link to your screenshot when uploading to GitHub)*

### Welcome Screen & Config
![Welcome Screen](IMAGEN1)

### Moset Main IDE & Customization
![IDE General Interface](IMAGEN2)

### The Sovereign Engine (Local Terminal)
![Settings and Console Panel](IMAGEN3)

---

## 🌌 Vision and Architecture

To fully dive into the philosophy, technical foundations, and the "Lore" behind this project, we invite you to read our central documentation:

👉 **[Read The Moset Bible](./Biblia_Moset.md)**

## 🚀 Key Features

- **Absolute Privacy**: AI models run directly on your hardware, offline.
- **Native Performance**: `core-engine` backend completely written in pure Rust.
- **Cross-Platform Acceleration**: Optional CUDA support, plus proven compatibility on Windows, macOS, and Linux.
- **Glassmorphism Frontend**: Immersive and cutting-edge Integrated Development Environment (IDE) under `naraka-ide`.
- **Moset-Lang**: A custom programming language designed for semantic interoperability with LLMs.

## ⚙️ Repository Structure

The monorepo is organized as follows:

```text
/moset-ecosystem
 ├── core-engine/      # Pure Rust backend engine
 ├── naraka-ide/       # Tauri + React frontend
 ├── moset-lang/       # Moset language parser/library
 └── scripts/          # LLM model downloads, fine-tuning, and automations
/logos moset/          # Visual Identity and branding
/Iconos Retro/         # Graphic assets
```

## 🛠️ Installation & Basic Build

### Requirements
- **Rust** and **Cargo**
- **Node.js** and **npm** (for Tauri)

### Running the Development Environment (IDE)

```bash
cd moset-ecosystem/naraka-ide
npm install
npm run tauri dev
```

> **Note:** The heavy model downloads (`.safetensors`, `.gguf`) are configured using the integrated scripts, which are ignored by native version control due to their large file size.

---
<div align="center">
  <i>Moset 2026 - Developed by <b>narakastudio.com</b></i>
</div>
