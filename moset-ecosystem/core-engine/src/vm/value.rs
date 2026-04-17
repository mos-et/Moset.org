// ============================================================================
// MOSET VM — Values
// ============================================================================
// Representación de datos en la pila de la VM.
// ============================================================================

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum VMValue {
    Nil,
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(String),
    
    /// Bit Cuántico en superposición
    Quantum {
        alpha: f64, // |0> amplitude
        beta:  f64, // |1> amplitude
    },

    /// Estructuras complejas (referenciadas o clonadas)
    List(Vec<VMValue>),
    
    /// Molde (Struct / Objeto)
    Object {
        name: String,
        fields: HashMap<String, VMValue>,
    },
}

impl std::fmt::Display for VMValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VMValue::Nil => write!(f, "nulo"),
            VMValue::Bool(b) => write!(f, "{}", if *b { "verdadero" } else { "falso" }),
            VMValue::Int(n) => write!(f, "{}", n),
            VMValue::Float(n) => write!(f, "{:.2}", n),
            VMValue::Str(s) => write!(f, "{}", s),
            VMValue::Quantum { alpha: _, beta } => {
                let p1 = beta * beta;
                write!(f, "Bit:[{:.2}] ({:.0}%)", p1, p1 * 100.0)
            }
            VMValue::List(l) => write!(f, "[...] ({} items)", l.len()),
            VMValue::Object { name, .. } => write!(f, "<objeto {}>", name),
        }
    }
}
