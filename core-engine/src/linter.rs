// Código de Fase Futura: Análisis semántico estático (Linter). Aún no integrado.
// TODO: Implementación futura del Linter Estático para Moset IDE.
// Analiza el AST sin generar bytecode ni ejecutar en la VM.
// Mantenemos las estructuras para desarrollo posterior.

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
        // Resetear posición — Nodo::Metadata actualizará linea/columna
        // antes de cada visita, así los diagnósticos tendrán la posición
        // del nodo más cercano envuelto en Metadata.
        self.linea_actual = 1;
        self.columna_actual = 1;

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
            Nodo::Binario { izq, op, der } => {
                use crate::ast::OpBinario::*;
                match op {
                    Igual | NoIgual | Mayor | Menor | MayorIgual | MenorIgual | Y | O => TipoInferido::Booleano,
                    Sumar | Restar | Multiplicar | Dividir | Modulo => {
                        let t_izq = self.inferir_tipo(izq);
                        let t_der = self.inferir_tipo(der);
                        if t_izq == TipoInferido::Texto || t_der == TipoInferido::Texto {
                            TipoInferido::Texto
                        } else if t_izq == TipoInferido::Decimal || t_der == TipoInferido::Decimal {
                            TipoInferido::Decimal
                        } else if t_izq == TipoInferido::Entero && t_der == TipoInferido::Entero {
                            TipoInferido::Entero
                        } else {
                            TipoInferido::Desconocido
                        }
                    }
                }
            },
            Nodo::Unario { op, expr } => {
                use crate::ast::OpUnario::*;
                match op {
                    No => TipoInferido::Booleano,
                    Negar => {
                        let t = self.inferir_tipo(expr);
                        if t == TipoInferido::Decimal { TipoInferido::Decimal }
                        else if t == TipoInferido::Entero { TipoInferido::Entero }
                        else { TipoInferido::Desconocido }
                    }
                }
            },
            Nodo::Colapsar(_) => TipoInferido::Entero,
            Nodo::Esperar(expr) => self.inferir_tipo(expr),
            Nodo::Condicional { cuerpo_si, .. } => {
                cuerpo_si.last().map(|n| self.inferir_tipo(n)).unwrap_or(TipoInferido::Nulo)
            },
            _ => TipoInferido::Desconocido,
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
            Nodo::Closure { params, cuerpo } => {
                self.push_scope();
                for param in params {
                    self.registrar_tipo(param, TipoInferido::Desconocido);
                }
                for expr in cuerpo {
                    self.visitar(expr);
                }
                self.pop_scope();
            }
            Nodo::LlamadaMetodo { objeto, args, .. } => {
                self.visitar(objeto);
                for arg in args {
                    self.visitar(arg);
                }
            }
            Nodo::MoldeInstancia { valores, .. } => {
                for (_, valor) in valores {
                    self.visitar(valor);
                }
            }
            Nodo::ListaLit(elementos) => {
                for elem in elementos {
                    self.visitar(elem);
                }
            }
            Nodo::AsignacionCampo { valor, .. } => {
                self.visitar(valor);
            }
            Nodo::AsignacionIndice { lista, indice, valor } => {
                self.visitar(lista);
                self.visitar(indice);
                self.visitar(valor);
            }
            Nodo::Retornar(expr) => self.visitar(expr),
            _ => {} // Literales, comentarios, imports y declaraciones (MoldeDefinicion) no arrojan semánticas solas
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linter_nuevo() {
        let linter = Linter::nuevo();
        assert_eq!(linter.diagnosticos.len(), 0);
        assert_eq!(linter.entorno.len(), 1);
    }

    #[test]
    fn test_linter_asignacion() {
        let programa = Programa {
            sentencias: vec![
                Nodo::Metadata {
                    linea: 1,
                    columna: 1,
                    nodo: Box::new(Nodo::Asignacion {
                        nombre: "x".to_string(),
                        valor: Box::new(Nodo::EnteroLit(10)),
                    }),
                },
                Nodo::Metadata {
                    linea: 2,
                    columna: 1,
                    nodo: Box::new(Nodo::Asignacion {
                        nombre: "x".to_string(),
                        valor: Box::new(Nodo::TextoLit("hola".to_string())),
                    }),
                },
            ],
        };

        let mut linter = Linter::nuevo();
        let diags = linter.analizar(&programa);

        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].linea, 2);
        assert_eq!(diags[0].severidad, Severidad::Error);
        assert!(diags[0].mensaje.contains("TypeError"));
    }
}
