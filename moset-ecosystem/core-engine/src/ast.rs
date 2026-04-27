// ============================================================================
// MOSET — Árbol Sintáctico Universal (U-AST)
// ============================================================================
// Todos los nodos son INMUTABLES y agnósticos al idioma humano.
// Serde permite serializar el U-AST completo para que el LSP
// renderice el código en el idioma del programador.
// ============================================================================

use serde::{Deserialize, Serialize};

/// Operadores binarios (universales)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum OpBinario {
    Sumar,       // +
    Restar,      // -
    Multiplicar, // *
    Dividir,     // /
    Modulo,      // %
    Igual,       // ==
    NoIgual,     // !=
    Mayor,       // >
    Menor,       // <
    MayorIgual,  // >=
    MenorIgual,  // <=
    Y,           // y / and
    O,           // o / or
}

/// Operadores unarios
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum OpUnario {
    Negar, // -valor
    No,    // no / not
}

/// Nodos del U-AST — Cada variante es una "intención pura"
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Nodo {
    // === Literales ===
    EnteroLit(i64),
    DecimalLit(f64),
    TextoLit(String),
    BooleanoLit(bool),
    NuloLit,

    // === Metadata Temporal (BUG-004) ===
    // Envuelve cualquier nodo con info de su posición física en el archivo
    Metadata {
        linea: usize,
        columna: usize,
        nodo: Box<Nodo>,
    },

    // === Bit Cuántico: α|0⟩ + β|1⟩ ===
    SuperposicionLit {
        alpha: f64, // amplitud |0⟩
        beta: f64,  // amplitud |1⟩
    },
    ListaLit(Vec<Nodo>),

    // === Identificadores ===
    Identificador(String),
    Este, // Referencia a la instancia actual (OOP)

    // === Operaciones ===
    Binario {
        izq: Box<Nodo>,
        op: OpBinario,
        der: Box<Nodo>,
    },
    Unario {
        op: OpUnario,
        expr: Box<Nodo>,
    },

    // === Variables (tipado por inferencia) ===
    Asignacion {
        nombre: String,
        valor: Box<Nodo>,
    },

    // === Función :,] ===
    Funcion {
        nombre: String,
        params: Vec<String>,
        cuerpo: Vec<Nodo>,
    },

    // === Closure (Función anónima) ===
    Closure {
        params: Vec<String>,
        cuerpo: Vec<Nodo>,
    },

    // === Llamada a función ===
    Llamada {
        funcion: Box<Nodo>,
        args: Vec<Nodo>,
    },

    // === Llamada a método (OOP) ===
    LlamadaMetodo {
        objeto: Box<Nodo>,
        metodo: String,
        args: Vec<Nodo>,
    },

    // === mostrar (statement nativo) ===
    Mostrar(Box<Nodo>),

    // === Condicional (como expresión) ===
    // Bloque: si cond:  /  Inline: estado = si x > 0: "A" sino: "B"
    Condicional {
        condicion: Box<Nodo>,
        cuerpo_si: Vec<Nodo>,
        cuerpo_sino: Option<Vec<Nodo>>,
    },

    // === Bucle: por cada X en Y ===
    PorCada {
        variable: String,
        iterable: Box<Nodo>,
        cuerpo: Vec<Nodo>,
    },

    // === Bucle: mientras ===
    Mientras {
        condicion: Box<Nodo>,
        cuerpo: Vec<Nodo>,
    },

    // === Catch :,[ (manejo de errores) ===
    CatchEnLinea {
        expresion: Box<Nodo>,
        fallback: Box<Nodo>,
    },

    // === Async/Await :,\ ===
    Esperar(Box<Nodo>),

    // === Colapso Cuántico: ! (observación) ===
    Colapsar(Box<Nodo>),

    // === Molde (Struct atómico / elástico) ===
    MoldeDefinicion {
        nombre: String,
        campos: Vec<String>,
        elastico: bool,   // true si tiene `...` → acepta campos dinámicos
    },
    MoldeInstancia {
        nombre: String,
        valores: Vec<(String, Nodo)>,
    },

    // === Asignación de campo: obj.campo = valor ===
    AsignacionCampo {
        objeto: String,
        campo: String,
        valor: Box<Nodo>,
    },
    // === Asignación de índice: lista[indice] = valor ===
    AsignacionIndice {
        lista: Box<Nodo>,
        indice: Box<Nodo>,
        valor: Box<Nodo>,
    },

    // === Acceso ===
    AccesoCampo {
        objeto: Box<Nodo>,
        campo: String,
    },
    AccesoIndice {
        lista: Box<Nodo>,
        indice: Box<Nodo>,
    },

    // === Import ===
    Importar { modulo: String },

    // === Retorno explícito (raro, preferimos implícito) ===
    Retornar(Box<Nodo>),

    // === Comentario :@ ===
    Comentario(String),

    // === Bloque Pensar (Shadow Env) ===
    // Ejecuta código en un entorno espejo sin afectar el estado real.
    // shell() se simula, variables no escapan.
    Pensar {
        cuerpo: Vec<Nodo>,
    },
}

/// Programa completo: un archivo .et parseado y serializable
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Programa {
    pub sentencias: Vec<Nodo>,
}
