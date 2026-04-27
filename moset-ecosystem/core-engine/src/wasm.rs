use wasm_bindgen::prelude::*;
use crate::{lexer::Lexer, parser::Parser, compiler::Compilador, vm::VM};
use std::sync::{Arc, Mutex};

#[wasm_bindgen]
pub fn run_moset_wasm(codigo: &str, idioma_opcional: Option<String>) -> String {
    let output = Arc::new(Mutex::new(String::new()));
    let output_clone = Arc::clone(&output);

    let idioma = idioma_opcional.unwrap_or_else(|| "es".to_string());
    
    let mut lex = Lexer::nuevo(codigo, Some(&idioma));
    let tokens = match lex.tokenizar() {
        Ok(t) => t,
        Err(e) => return format!("Error léxico: {}", e),
    };

    let mut par = Parser::nuevo(tokens);
    let programa = match par.parsear() {
        Ok(p) => p,
        Err(e) => return format!("Error de sintaxis: {}", e),
    };

    let mut compilador = Compilador::nuevo();
    if let Err(e) = compilador.compilar_programa(&programa) {
        return format!("Error de compilación: {}", e);
    }

    let mut maquina = VM::nueva(compilador.chunk);
    
    // Capturar mostrar() en el buffer para devolverlo como String final a JS
    maquina.on_print = Some(Box::new(move |s| {
        if let Ok(mut guard) = output_clone.lock() {
            guard.push_str(s);
            guard.push('\n');
        }
    }));

    match maquina.ejecutar() {
        Ok(res) => {
            let guard = output.lock().unwrap();
            if guard.is_empty() {
                res.to_string()
            } else {
                guard.clone()
            }
        },
        Err(e) => format!("Error de ejecución: {}", e),
    }
}
