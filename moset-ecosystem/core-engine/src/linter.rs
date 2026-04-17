use crate::ast::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Severidad {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub linea: usize,
    pub columna: usize,
    pub mensaje: String,
    pub severidad: Severidad,
}

// Tipo simplificado para análisis estático
#[derive(Debug, Clone, PartialEq)]
pub enum TipoInferido {
    Entero,
    Decimal,
    Texto,
    Booleano,
    Superposicion,
    Lista,
    Molde,
    Nulo,
    Desconocido,
}

pub struct Linter {
    diagnosticos: Vec<Diagnostic>,
    // Scopes: cada nivel es un HashMap de nombre -> TipoInferido
    entorno: Vec<HashMap<String, TipoInferido>>,
    linea_actual: usize,
    columna_actual: usize,
}

impl Linter {
    pub fn nuevo() -> Self {
        Linter {
            diagnosticos: Vec::new(),
            entorno: vec![HashMap::new()], // Scope global predeterminado
            linea_actual: 1,
            columna_actual: 1,
        }
    }

    pub fn analizar(&mut self, programa: &Programa) -> Vec<Diagnostic> {
        self.diagnosticos.clear();
        self.entorno = vec![HashMap::new()]; // Limpiar entorno

        for sentencia in &programa.sentencias {
            self.visitar(sentencia);
        }

        self.diagnosticos.clone()
    }

    fn push_scope(&mut self) {
        self.entorno.push(HashMap::new());
    }

    fn pop_scope(&mut self) {
        self.entorno.pop();
    }

    fn registrar_tipo(&mut self, nombre: &str, tipo: TipoInferido) {
        if let Some(scope) = self.entorno.last_mut() {
            scope.insert(nombre.to_string(), tipo);
        }
    }

    fn obtener_tipo(&self, nombre: &str) -> Option<TipoInferido> {
        for scope in self.entorno.iter().rev() {
            if let Some(t) = scope.get(nombre) {
                return Some(t.clone());
            }
        }
        None
    }

    fn reportar(&mut self, mensaje: &str, severidad: Severidad) {
        self.diagnosticos.push(Diagnostic {
            linea: self.linea_actual,
            columna: self.columna_actual,
            mensaje: mensaje.to_string(),
            severidad,
        });
    }

    fn inferir_tipo(&self, nodo: &Nodo) -> TipoInferido {
        match nodo {
            Nodo::EnteroLit(_) => TipoInferido::Entero,
            Nodo::DecimalLit(_) => TipoInferido::Decimal,
            Nodo::TextoLit(_) => TipoInferido::Texto,
            Nodo::BooleanoLit(_) => TipoInferido::Booleano,
            Nodo::SuperposicionLit { .. } => TipoInferido::Superposicion,
            Nodo::ListaLit(_) => TipoInferido::Lista,
            Nodo::NuloLit => TipoInferido::Nulo,
            Nodo::Identificador(nom) => self.obtener_tipo(nom).unwrap_or(TipoInferido::Desconocido),
            Nodo::MoldeInstancia { .. } => TipoInferido::Molde,
            Nodo::Metadata { nodo, .. } => self.inferir_tipo(nodo),
            _ => TipoInferido::Desconocido, // Simplificado, un Linter real calcularía las operaciones binarias
        }
    }

    fn visitar(&mut self, nodo: &Nodo) {
        match nodo {
            Nodo::Metadata { linea, columna, nodo } => {
                self.linea_actual = *linea;
                self.columna_actual = *columna;
                self.visitar(nodo);
            }

            Nodo::Asignacion { nombre, valor } => {
                self.visitar(valor);
                let tipo_nuevo = self.inferir_tipo(valor);

                if let Some(tipo_previo) = self.obtener_tipo(nombre) {
                    if tipo_previo != TipoInferido::Desconocido && tipo_nuevo != TipoInferido::Desconocido && tipo_previo != tipo_nuevo {
                        self.reportar(&format!("TypeError: Intento de reasignar variable estricta '{}' de tipo {:?} a {:?}", nombre, tipo_previo, tipo_nuevo), Severidad::Error);
                    }
                } else if tipo_nuevo == TipoInferido::Nulo {
                    self.reportar(&format!("Warning: Variable '{}' está siendo inicializada en 'nulo' explícitamente. Considera usar un tipo seguro.", nombre), Severidad::Warning);
                }
                
                // Shadowing in-place o actualización de tipo
                self.registrar_tipo(nombre, tipo_nuevo);
            }

            Nodo::Funcion { params, cuerpo, .. } => {
                self.push_scope();
                for param in params {
                    self.registrar_tipo(param, TipoInferido::Desconocido); // Params no tipados explícitamente en AST actual
                }
                for expr in cuerpo {
                    self.visitar(expr);
                }
                self.pop_scope();
            }

            Nodo::Condicional { condicion, cuerpo_si, cuerpo_sino } => {
                self.visitar(condicion);
                self.push_scope();
                for expr in cuerpo_si {
                    self.visitar(expr);
                }
                self.pop_scope();

                if let Some(sino) = cuerpo_sino {
                    self.push_scope();
                    for expr in sino {
                        self.visitar(expr);
                    }
                    self.pop_scope();
                }
            }

            Nodo::PorCada { variable, iterable, cuerpo } => {
                self.visitar(iterable);
                self.push_scope();
                self.registrar_tipo(variable, TipoInferido::Desconocido);
                for expr in cuerpo {
                    self.visitar(expr);
                }
                self.pop_scope();
            }

            Nodo::Mientras { condicion, cuerpo } => {
                self.visitar(condicion);
                self.push_scope();
                for expr in cuerpo {
                    self.visitar(expr);
                }
                self.pop_scope();
            }

            Nodo::Binario { izq, der, .. } => {
                self.visitar(izq);
                self.visitar(der);
            }
            Nodo::Unario { expr, .. } => self.visitar(expr),
            Nodo::Llamada { funcion, args } => {
                self.visitar(funcion);
                for arg in args {
                    self.visitar(arg);
                }
            }
            Nodo::Mostrar(expr) => self.visitar(expr),
            Nodo::Esperar(expr) => self.visitar(expr),
            Nodo::Colapsar(expr) => self.visitar(expr),
            Nodo::CatchEnLinea { expresion, fallback } => {
                self.visitar(expresion);
                self.visitar(fallback);
            }
            Nodo::AccesoCampo { objeto, .. } => self.visitar(objeto),
            Nodo::AccesoIndice { lista, indice } => {
                self.visitar(lista);
                self.visitar(indice);
            }
            Nodo::Pensar { cuerpo } => {
                // El Shadow Env Aisla las variables
                self.push_scope();
                for expr in cuerpo {
                    self.visitar(expr);
                }
                self.pop_scope();
            }
            _ => {} // Literales y declaraciones no arrojan semánticas solas
        }
    }
}
