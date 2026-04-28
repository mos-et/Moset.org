// ============================================================================
// MOSET — Motor Soberano v0.1.0
// ============================================================================
// Punto de entrada del lenguaje. Tres modos de operación:
//   moset run archivo.et  → Ejecutar un script
//   moset ast archivo.et  → Serializar el U-AST como JSON
//   moset                 → REPL interactivo
// ============================================================================

use moset_core::{lexer, parser, compiler, vm, valor};

use clap::{Parser as ClapParser, Subcommand};
use std::io::{self, Write};

#[derive(ClapParser)]
#[command(
    name = "moset",
    version = "0.1.0",
    about = "Moset — El Motor Soberano",
    long_about = "Lenguaje de programación de alto rendimiento para orquestación de IA.\n\
                  Diseñado por Naraka Studio."
)]
struct Cli {
    #[command(subcommand)]
    comando: Option<Comandos>,
}

#[derive(Subcommand)]
enum Comandos {
    /// Ejecutar un archivo .et
    Run {
        /// Ruta al archivo Moset (.et)
        archivo: String,
        /// Idioma del código fuente (es/en)
        #[arg(short, long, default_value = "es")]
        idioma: String,
    },
    /// Serializar el U-AST de un archivo .et como JSON
    Ast {
        /// Ruta al archivo Moset (.et)
        archivo: String,
        /// Idioma del código fuente (es/en)
        #[arg(short, long, default_value = "es")]
        idioma: String,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.comando {
        Some(Comandos::Run { archivo, idioma }) => ejecutar_archivo(&archivo, &idioma),
        Some(Comandos::Ast { archivo, idioma }) => mostrar_ast(&archivo, &idioma),
        None => repl(),
    }
}

/// Ejecutar un archivo .et
fn ejecutar_archivo(ruta: &str, idioma: &str) -> anyhow::Result<()> {
    let fuente = std::fs::read_to_string(ruta)
        .map_err(|e| anyhow::anyhow!("No se puede leer '{}': {}", ruta, e))?;

    let mut lex = lexer::Lexer::nuevo(&fuente, Some(idioma));
    let tokens = lex
        .tokenizar()
        .map_err(|e| anyhow::anyhow!("Error léxico: {}", e))?;

    let mut par = parser::Parser::nuevo(tokens);
    let programa = par
        .parsear()
        .map_err(|e| anyhow::anyhow!("Error de sintaxis: {}", e))?;

    let mut compilador = compiler::Compilador::nuevo();
    // BUG-026: pasar el directorio del archivo fuente para resolver importar
    // con rutas relativas al propio archivo y no al CWD del proceso.
    if let Ok(abs) = std::fs::canonicalize(ruta) {
        compilador.ruta_base = abs.parent().map(|p| p.to_path_buf());
    }
    compilador.compilar_programa(&programa)
        .map_err(|e| anyhow::anyhow!("Error de compilación: {}", e))?;
    
    let mut vm = vm::VM::nueva(compilador.chunk);
    vm.ejecutar()
        .map_err(|e| anyhow::anyhow!("Error de ejecución: {}", e))?;

    Ok(())
}

/// Mostrar el U-AST serializado como JSON
fn mostrar_ast(ruta: &str, idioma: &str) -> anyhow::Result<()> {
    let fuente = std::fs::read_to_string(ruta)
        .map_err(|e| anyhow::anyhow!("No se puede leer '{}': {}", ruta, e))?;

    let mut lex = lexer::Lexer::nuevo(&fuente, Some(idioma));
    let tokens = lex
        .tokenizar()
        .map_err(|e| anyhow::anyhow!("Error léxico: {}", e))?;

    let mut par = parser::Parser::nuevo(tokens);
    let programa = par
        .parsear()
        .map_err(|e| anyhow::anyhow!("Error de sintaxis: {}", e))?;

    let json = serde_json::to_string_pretty(&programa)?;
    println!("{}", json);

    Ok(())
}

/// REPL interactivo de Moset
fn repl() -> anyhow::Result<()> {
    println!();
    println!("  ╔══════════════════════════════════════════╗");
    println!("  ║  MOSET v0.1.0 — Motor Soberano          ║");
    println!("  ║  El lenguaje del Puro Fierro             ║");
    println!("  ║  Naraka Studio © 2026                    ║");
    println!("  ╚══════════════════════════════════════════╝");
    println!();
    println!("  Comandos: 'salir' para terminar | ':@' para comentar");
    println!();

    let stdin = io::stdin();
    let mut buffer = String::new();

    loop {
        if buffer.is_empty() {
            print!("  moset> ");
        } else {
            print!("   ...> ");
        }
        io::stdout().flush()?;

        let mut linea = String::new();
        let bytes = stdin.read_line(&mut linea)?;

        // EOF (Ctrl+D / Ctrl+Z)
        if bytes == 0 {
            println!();
            break;
        }

        let linea_trim = linea.trim();

        if buffer.is_empty() && linea_trim.is_empty() {
            continue;
        }
        if buffer.is_empty() && linea_trim == "salir" {
            println!("  ¡Hasta la próxima, Soberano!");
            break;
        }

        buffer.push_str(&linea);

        // Intento de procesar
        let mut lex = lexer::Lexer::nuevo(&buffer, None);
        match lex.tokenizar() {
            Ok(tokens) => {
                let mut par = parser::Parser::nuevo(tokens);
                match par.parsear() {
                    Ok(programa) => {
                        let mut compilador = compiler::Compilador::nuevo();
                        // BUG-058/BUG-026: Configurar ruta_base en el REPL usando CWD
                        if let Ok(cwd) = std::env::current_dir() {
                            compilador.ruta_base = Some(cwd);
                        }
                        if let Err(e) = compilador.compilar_programa(&programa) {
                            eprintln!("  ✗ Error de Compilación: {}", e);
                            buffer.clear();
                            continue;
                        }

                        let mut vm = vm::VM::nueva(compilador.chunk);
                        match vm.ejecutar() {
                            Ok(estado) => {
                                match estado {
                                    moset_core::vm::engine::EstadoVM::Terminado(v) => {
                                        if !matches!(v, valor::Valor::Nulo) {
                                            println!("  => {:?}", v);
                                        }
                                    },
                                    moset_core::vm::engine::EstadoVM::Suspendido(_) => {
                                        println!("  => (Suspendido)");
                                    }
                                }
                            }
                            Err(e) => eprintln!("  ✗ Error de Ejecución: {}", e),
                        }
                        buffer.clear();
                    }
                    Err(e) => {
                        // Si el error indica EOF, es un bloque incompleto
                        if e.contains("Eof") || e.contains("EOF") {
                            continue;
                        } else {
                            eprintln!("  ✗ Sintaxis:\n{}", e);
                            buffer.clear();
                        }
                    }
                }
            }
            Err(e) => {
                // Si el lexer indica algo sin cerrar, es bloque incompleto
                if e.contains("sin cerrar") {
                    continue;
                } else {
                    eprintln!("  ✗ Léxico: {}", e);
                    buffer.clear();
                }
            }
        }
    }

    Ok(())
}
