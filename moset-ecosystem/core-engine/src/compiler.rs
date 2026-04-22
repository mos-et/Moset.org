use crate::bytecode::{Chunk, OpCode};
use crate::valor::Valor;
use crate::ast::{Nodo, OpBinario, OpUnario};
use std::collections::HashMap;

/// Schema de un molde registrado en compilación
#[derive(Debug, Clone)]
struct MoldeSchema {
    campos: Vec<String>,
    elastico: bool,
}

/// Representa una variable local en el scope del compilador
#[derive(Debug, Clone)]
struct Local {
    nombre: String,
    profundidad: i32, // -1 = no inicializada todavía
}

pub struct Compilador {
    pub chunk: Chunk,
    /// Tabla de variables locales (stack-based scoping)
    locales: Vec<Local>,
    /// Profundidad actual del scope (0 = global)
    profundidad_scope: i32,
    /// Tabla de nombres globales → índice en constantes
    globales: HashMap<String, usize>,
    /// Tabla de moldes registrados
    moldes: HashMap<String, MoldeSchema>,
    /// Directorio base del archivo fuente en ejecución.
    /// Cuando está seteado, `importar` resuelve rutas relativas contra él
    /// en lugar del CWD del proceso (BUG-026 fix).
    pub ruta_base: Option<std::path::PathBuf>,
}

impl Compilador {
    pub fn nuevo() -> Self {
        Compilador {
            chunk: Chunk::nuevo(),
            locales: Vec::new(),
            profundidad_scope: 0,
            globales: HashMap::new(),
            moldes: HashMap::new(),
            ruta_base: None,
        }
    }

    /// Punto de entrada: Compila un nodo raíz AST a un Chunk de OpCodes.
    pub fn compilar(&mut self, nodo: &Nodo) -> Result<(), String> {
        self.compilar_nodo(nodo, 1)?;
        
        // Al terminar, siempre emitimos un Retorno.
        self.emitir_byte(OpCode::Retorno as u8, 1);
        Ok(())
    }

    /// Punto de entrada principal: Compila un programa (lista de nodos/sentencias) a un Chunk.
    pub fn compilar_programa(&mut self, programa: &crate::ast::Programa) -> Result<(), String> {
        for sentencia in &programa.sentencias {
            self.compilar_nodo(sentencia, 1)?;
        }
        
        self.emitir_byte(OpCode::Retorno as u8, 1);
        Ok(())
    }

    // ─── Scope Management ───────────────────────────────────────────────────

    fn iniciar_scope(&mut self) {
        self.profundidad_scope += 1;
    }

    fn cerrar_scope(&mut self, linea: usize) {
        self.profundidad_scope -= 1;
        // Pop todas las variables locales del scope que se cierra
        while !self.locales.is_empty() 
            && self.locales.last().unwrap().profundidad > self.profundidad_scope 
        {
            self.emitir_byte(OpCode::Pop as u8, linea);
            self.locales.pop();
        }
    }

    fn añadir_local(&mut self, nombre: String) -> Result<(), String> {
        if self.locales.len() >= 256 {
            return Err("Demasiadas variables locales (máximo 256)".to_string());
        }
        self.locales.push(Local {
            nombre,
            profundidad: self.profundidad_scope,
        });
        Ok(())
    }

    fn resolver_local(&self, nombre: &str) -> Option<usize> {
        for (i, local) in self.locales.iter().enumerate().rev() {
            if local.nombre == nombre {
                return Some(i);
            }
        }
        None
    }

    fn identificador_constante(&mut self, nombre: &str) -> usize {
        // Reutilizar si ya existe
        if let Some(&idx) = self.globales.get(nombre) {
            return idx;
        }
        let idx = self.chunk.añadir_constante(Valor::Texto(nombre.to_string()));
        self.globales.insert(nombre.to_string(), idx);
        idx
    }

    // ─── Compilar Nodo ──────────────────────────────────────────────────────

    fn compilar_nodo(&mut self, nodo: &Nodo, linea: usize) -> Result<(), String> {
        match nodo {
            Nodo::Metadata { linea: l, nodo: n, .. } => {
                self.compilar_nodo(n, *l)?;
            },
            
            // ─── LITERALES ──────────────────────────────────────────────────
            Nodo::EnteroLit(val) => {
                let idx = self.chunk.añadir_constante(Valor::Entero(*val));
                self.emitir_bytes(OpCode::Constante as u8, idx as u8, linea);
            },
            Nodo::DecimalLit(val) => {
                let idx = self.chunk.añadir_constante(Valor::Decimal(*val));
                self.emitir_bytes(OpCode::Constante as u8, idx as u8, linea);
            },
            Nodo::TextoLit(val) => {
                let idx = self.chunk.añadir_constante(Valor::Texto(val.clone()));
                self.emitir_bytes(OpCode::Constante as u8, idx as u8, linea);
            },
            Nodo::BooleanoLit(val) => {
                if *val {
                    self.emitir_byte(OpCode::Verdadero as u8, linea);
                } else {
                    self.emitir_byte(OpCode::Falso as u8, linea);
                }
            },
            Nodo::NuloLit => {
                self.emitir_byte(OpCode::Nulo as u8, linea);
            },

            // ─── OPERADORES UNARIOS ─────────────────────────────────────────
            Nodo::Unario { op, expr } => {
                self.compilar_nodo(expr, linea)?;
                match op {
                    OpUnario::Negar => self.emitir_byte(OpCode::Negacion as u8, linea),
                    OpUnario::No => self.emitir_byte(OpCode::No as u8, linea),
                }
            },

            // ─── OPERADORES BINARIOS ────────────────────────────────────────
            Nodo::Binario { izq, op, der } => {
                match op {
                    OpBinario::Y => {
                        self.compilar_nodo(izq, linea)?;
                        // Si izq es falso, saltamos al final (el valor de izq queda en pila como resultado)
                        let salto_fin = self.chunk.emitir_salto(OpCode::SaltoSiFalso, linea);
                        // Si izq era verdadero, lo quitamos de la pila y evaluamos der
                        self.emitir_byte(OpCode::Pop as u8, linea);
                        self.compilar_nodo(der, linea)?;
                        self.chunk.parchear_salto(salto_fin);
                    },
                    OpBinario::O => {
                        self.compilar_nodo(izq, linea)?;
                        // Si izq es verdadero, saltamos al final (el valor queda en pila)
                        // Para esto necesitamos un SaltoSiVerdadero o similar,
                        // o usar SaltoSiFalso para ir al bloque que evalúa der.
                        let salto_eval_der = self.chunk.emitir_salto(OpCode::SaltoSiFalso, linea);
                        let salto_fin = self.chunk.emitir_salto(OpCode::Salto, linea);

                        self.chunk.parchear_salto(salto_eval_der);
                        self.emitir_byte(OpCode::Pop as u8, linea);
                        self.compilar_nodo(der, linea)?;
                        self.chunk.parchear_salto(salto_fin);
                    },
                    _ => {
                        self.compilar_nodo(izq, linea)?;
                        self.compilar_nodo(der, linea)?;

                        match op {
                            OpBinario::Sumar => self.emitir_byte(OpCode::Suma as u8, linea),
                            OpBinario::Restar => self.emitir_byte(OpCode::Resta as u8, linea),
                            OpBinario::Multiplicar => self.emitir_byte(OpCode::Multiplicacion as u8, linea),
                            OpBinario::Dividir => self.emitir_byte(OpCode::Division as u8, linea),
                            OpBinario::Modulo => self.emitir_byte(OpCode::Modulo as u8, linea),
                            OpBinario::Igual => self.emitir_byte(OpCode::Igual as u8, linea),
                            OpBinario::NoIgual => self.emitir_byte(OpCode::NoIgual as u8, linea),
                            OpBinario::Mayor => self.emitir_byte(OpCode::Mayor as u8, linea),
                            OpBinario::Menor => self.emitir_byte(OpCode::Menor as u8, linea),
                            OpBinario::MayorIgual => self.emitir_byte(OpCode::MayorIgual as u8, linea),
                            OpBinario::MenorIgual => self.emitir_byte(OpCode::MenorIgual as u8, linea),
                            _ => unreachable!(),
                        }
                    }
                }
            },

            // ─── MOSTRAR ────────────────────────────────────────────────────
            Nodo::Mostrar(expr) => {
                self.compilar_nodo(expr, linea)?;
                self.emitir_byte(OpCode::Imprimir as u8, linea);
            },

            // ─── VARIABLES (ASIGNACIÓN) ─────────────────────────────────────
            Nodo::Asignacion { nombre, valor } => {
                self.compilar_nodo(valor, linea)?;

                if self.profundidad_scope > 0 {
                    // Variable local
                    if let Some(slot) = self.resolver_local(nombre) {
                        // Reasignar variable existente
                        self.emitir_bytes(OpCode::AsignarLocal as u8, slot as u8, linea);
                    } else {
                        // Definir nueva local
                        self.añadir_local(nombre.clone())?;
                        // El valor ya está en la pila, no emitimos nada más —
                        // la posición en la pila ES el slot de la variable.
                    }
                } else {
                    // Variable global
                    let idx = self.identificador_constante(nombre);
                    if self.globales.contains_key(nombre) {
                        // Puede ser definición o reasignación global
                        self.emitir_bytes(OpCode::DefinirGlobal as u8, idx as u8, linea);
                    } else {
                        self.emitir_bytes(OpCode::DefinirGlobal as u8, idx as u8, linea);
                    }
                }
            },

            // ─── VARIABLES (LECTURA) ────────────────────────────────────────
            Nodo::Identificador(nombre) => {
                if let Some(slot) = self.resolver_local(nombre) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                } else {
                    let idx = self.identificador_constante(nombre);
                    self.emitir_bytes(OpCode::ObtenerGlobal as u8, idx as u8, linea);
                }
            },

            // ─── CONDICIONAL (si/sino) ──────────────────────────────────────
            Nodo::Condicional { condicion, cuerpo_si, cuerpo_sino } => {
                // Compilar condición
                self.compilar_nodo(condicion, linea)?;

                // Si falso, salta al bloque sino (o al final)
                let salto_sino = self.chunk.emitir_salto(OpCode::SaltoSiFalso, linea);
                self.emitir_byte(OpCode::Pop as u8, linea); // pop condición

                // Compilar cuerpo_si
                self.iniciar_scope();
                for stmt in cuerpo_si {
                    self.compilar_nodo(stmt, linea)?;
                }
                self.cerrar_scope(linea);

                // Salto al final (para evitar el sino)
                let salto_fin = self.chunk.emitir_salto(OpCode::Salto, linea);

                // Parchear salto al sino
                self.chunk.parchear_salto(salto_sino);
                self.emitir_byte(OpCode::Pop as u8, linea); // pop condición (branch falso)

                // Compilar cuerpo_sino (si existe)
                if let Some(cuerpo) = cuerpo_sino {
                    self.iniciar_scope();
                    for stmt in cuerpo {
                        self.compilar_nodo(stmt, linea)?;
                    }
                    self.cerrar_scope(linea);
                }

                // Parchear salto al final
                self.chunk.parchear_salto(salto_fin);
            },

            // ─── BUCLE MIENTRAS ─────────────────────────────────────────────
            Nodo::Mientras { condicion, cuerpo } => {
                let inicio_loop = self.chunk.codigo.len();

                // Compilar condición
                self.compilar_nodo(condicion, linea)?;

                // Si falso, salir del bucle
                let salto_salida = self.chunk.emitir_salto(OpCode::SaltoSiFalso, linea);
                self.emitir_byte(OpCode::Pop as u8, linea); // pop condición

                // Compilar cuerpo
                self.iniciar_scope();
                for stmt in cuerpo {
                    self.compilar_nodo(stmt, linea)?;
                }
                self.cerrar_scope(linea);

                // Salto de vuelta al inicio
                self.chunk.emitir_bucle(inicio_loop, linea);

                // Parchear salida
                self.chunk.parchear_salto(salto_salida);
                self.emitir_byte(OpCode::Pop as u8, linea); // pop condición (branch falso)
            },

            // ─── FUNCIONES ──────────────────────────────────────────────────
            Nodo::Funcion { nombre, params, cuerpo } => {
                // Almacenar la función como un valor constante
                let func_val = Valor::Funcion {
                    nombre: nombre.clone(),
                    params: params.clone(),
                    cuerpo: cuerpo.clone(),
                };
                let idx = self.chunk.añadir_constante(func_val);
                self.emitir_bytes(OpCode::Constante as u8, idx as u8, linea);

                if self.profundidad_scope > 0 {
                    self.añadir_local(nombre.clone())?;
                } else {
                    let name_idx = self.identificador_constante(nombre);
                    self.emitir_bytes(OpCode::DefinirGlobal as u8, name_idx as u8, linea);
                }
            },

            // ─── RETORNAR ───────────────────────────────────────────────────
            Nodo::Retornar(expr) => {
                self.compilar_nodo(expr, linea)?;
                self.emitir_byte(OpCode::Retorno as u8, linea);
            },

            // ─── COMENTARIOS (no-op) ────────────────────────────────────────
            Nodo::Comentario(_) => { /* ignorado */ },

            // ─── BLOQUES PENSAR ─────────────────────────────────────────────
            Nodo::Pensar { cuerpo } => {
                // Pensar es un scope aislado: compilamos con scope nuevo
                self.iniciar_scope();
                for stmt in cuerpo {
                    self.compilar_nodo(stmt, linea)?;
                }
                self.cerrar_scope(linea);
            },

            // ─── IMPORTAR ───────────────────────────────────────────────────
            Nodo::Importar { modulo } => {
                let mut path = None;
                if let Some(ruta_base) = &self.ruta_base {
                    let full_path = ruta_base.join(modulo.clone() + ".et");
                    if full_path.exists() {
                        path = Some(full_path);
                    }
                }
                
                let final_path = path.unwrap_or_else(|| std::path::PathBuf::from(modulo.clone() + ".et"));
                let str_path = final_path.to_string_lossy();
                let fuente = std::fs::read_to_string(&final_path)
                    .map_err(|e| format!("Línea {}: No se pudo importar '{}': {}", linea, str_path, e))?;

                let mut lex = crate::lexer::Lexer::nuevo(&fuente, None);
                let tokens = lex.tokenizar().map_err(|e| format!("Línea {}: Error léxico en '{}': {}", linea, str_path, e))?;
                let mut par = crate::parser::Parser::nuevo(tokens);
                let programa_import = par.parsear().map_err(|e| format!("Línea {}: Error de sintaxis en '{}': {}", linea, str_path, e))?;

                // Guardar la ruta_base original, actualizarla, compilar y restaurar
                let old_base = self.ruta_base.clone();
                if let Ok(abs_path) = std::fs::canonicalize(&final_path) {
                    self.ruta_base = abs_path.parent().map(|p| p.to_path_buf());
                }

                for stmt in programa_import.sentencias {
                    self.compilar_nodo(&stmt, linea)?;
                }

                self.ruta_base = old_base;
            },

            // ─── SUPERPOSICIÓN CUÁNTICA ─────────────────────────────────────
            Nodo::SuperposicionLit { alpha, beta } => {
                let idx = self.chunk.añadir_constante(Valor::Superposicion {
                    alpha: *alpha,
                    beta: *beta,
                });
                self.emitir_bytes(OpCode::Constante as u8, idx as u8, linea);
            },

            // ─── COLAPSO CUÁNTICO (observar: !) ─────────────────────────────
            Nodo::Colapsar(expr) => {
                self.compilar_nodo(expr, linea)?;
                self.emitir_byte(OpCode::ColapsarQuantum as u8, linea);
            },

            // ─── LISTAS ─────────────────────────────────────────────────────
            Nodo::ListaLit(elementos) => {
                let count = elementos.len();
                for elem in elementos {
                    self.compilar_nodo(elem, linea)?;
                }
                self.emitir_bytes(OpCode::ConstruirLista as u8, count as u8, linea);
            },

            // ─── MOLDE DEFINICIÓN ───────────────────────────────────────────
            Nodo::MoldeDefinicion { nombre, campos, elastico } => {
                // Registrar molde en tabla interna para el compilador
                self.moldes.insert(nombre.clone(), MoldeSchema {
                    campos: campos.clone(),
                    elastico: *elastico,
                });
                // No emitimos bytecode — solo metadata de compilación
            },

            // ─── MOLDE INSTANCIA ────────────────────────────────────────────
            Nodo::MoldeInstancia { nombre, valores } => {
                // Construir los campos en tiempo de compilación como constante
                let mut campos_map = std::collections::HashMap::new();
                // Primero, necesitamos evaluar los valores. Para moldes con valores
                // literales podemos hacer constante directa. Para expresiones complejas,
                // generamos código que construye en runtime.
                
                // Estrategia: compilar cada valor, luego emitir un opcode especial.
                // Pero para simplificar usamos una constante si todos los valores son literales,
                // y si no, compilamos y usamos runtime.
                let mut all_literal = true;
                for (campo, val) in valores {
                    match self.try_eval_literal(val) {
                        Some(v) => { campos_map.insert(campo.clone(), v); },
                        None => { all_literal = false; break; },
                    }
                }

                if all_literal {
                    let idx = self.chunk.añadir_constante(Valor::Molde {
                        nombre: nombre.clone(),
                        campos: campos_map,
                        extra: std::collections::HashMap::new(),
                    });
                    self.emitir_bytes(OpCode::Constante as u8, idx as u8, linea);
                } else {
                    // Fallback: construir pieza a pieza en runtime
                    // Push nombre, push cada (key, val), luego ConstruirMolde
                    // Para simplificar, construimos un molde vacío y asignamos campos
                    let idx = self.chunk.añadir_constante(Valor::Molde {
                        nombre: nombre.clone(),
                        campos: std::collections::HashMap::new(),
                        extra: std::collections::HashMap::new(),
                    });
                    self.emitir_bytes(OpCode::Constante as u8, idx as u8, linea);

                    // Asignar como variable temporal para poder hacer set_field
                    let temp_name = format!("__molde_temp_{}", nombre);
                    let name_idx = self.identificador_constante(&temp_name);
                    self.emitir_bytes(OpCode::DefinirGlobal as u8, name_idx as u8, linea);

                    for (campo, val) in valores {
                        // Push el objeto
                        self.emitir_bytes(OpCode::ObtenerGlobal as u8, name_idx as u8, linea);
                        // Push el valor
                        self.compilar_nodo(val, linea)?;
                        // Set field
                        let field_idx = self.identificador_constante(campo);
                        self.emitir_bytes(OpCode::AsignarCampo as u8, field_idx as u8, linea);
                    }

                    // Hacer que el resultado sea el molde
                    self.emitir_bytes(OpCode::ObtenerGlobal as u8, name_idx as u8, linea);
                }
            },

            // ─── ASIGNACIÓN DE CAMPO (obj.campo = valor) ────────────────────
            Nodo::AsignacionCampo { objeto, campo, valor } => {
                // Push el objeto
                if let Some(slot) = self.resolver_local(objeto) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                } else {
                    let idx = self.identificador_constante(objeto);
                    self.emitir_bytes(OpCode::ObtenerGlobal as u8, idx as u8, linea);
                }
                // Push el valor
                self.compilar_nodo(valor, linea)?;
                // Emit set field
                let field_idx = self.identificador_constante(campo);
                self.emitir_bytes(OpCode::AsignarCampo as u8, field_idx as u8, linea);
                // Update the variable
                if let Some(slot) = self.resolver_local(objeto) {
                    self.emitir_bytes(OpCode::AsignarLocal as u8, slot as u8, linea);
                } else {
                    let idx = self.identificador_constante(objeto);
                    self.emitir_bytes(OpCode::AsignarGlobal as u8, idx as u8, linea);
                }
                // Pop the result that AsignarGlobal/AsignarLocal left
                self.emitir_byte(OpCode::Pop as u8, linea);
            },

            // ─── ACCESO A CAMPO (obj.campo) ─────────────────────────────────
            Nodo::AccesoCampo { objeto, campo } => {
                self.compilar_nodo(objeto, linea)?;
                let field_idx = self.identificador_constante(campo);
                self.emitir_bytes(OpCode::ObtenerCampo as u8, field_idx as u8, linea);
            },

            // ─── LLAMADAS (extendido para builtins) ─────────────────────────
            Nodo::Llamada { funcion, args } => {
                // Check if it's a builtin call
                let builtin_name = match funcion.as_ref() {
                    Nodo::Identificador(name) => {
                        match name.as_str() {
                            "shell" | "leer" | "escribir" | "entorno" | "existe" | "peticion_get" 
                                => Some(name.clone()),
                            _ => None,
                        }
                    },
                    _ => None,
                };

                if let Some(name) = builtin_name {
                    // Compile arguments
                    for arg in args {
                        self.compilar_nodo(arg, linea)?;
                    }
                    let name_idx = self.identificador_constante(&name);
                    self.emitir_byte(OpCode::LlamarBuiltin as u8, linea);
                    self.emitir_byte(name_idx as u8, linea);
                    self.emitir_byte(args.len() as u8, linea);
                } else {
                    // Regular function call
                    self.compilar_nodo(funcion, linea)?;
                    for arg in args {
                        self.compilar_nodo(arg, linea)?;
                    }
                    self.emitir_bytes(OpCode::Llamar as u8, args.len() as u8, linea);
                }
            },

            // ─── ACCESO A ÍNDICE (lista[i]) ─────────────────────────────────
            Nodo::AccesoIndice { lista, indice } => {
                self.compilar_nodo(lista, linea)?;
                self.compilar_nodo(indice, linea)?;
                // Usamos una llamada interna — por ahora, fallback
                return Err(format!(
                    "Línea {}: Acceso por índice aún no soportado en bytecode.",
                    linea
                ));
            },

            // ─── CATCH EN LINEA (expr :,[ fallback) ─────────────────────────
            Nodo::CatchEnLinea { .. } => {
                return Err(format!(
                    "Línea {}: `catch` en línea aún no está soportado en el compilador bytecode.",
                    linea
                ));
            },

            // ─── ESPERAR (await) ────────────────────────────────────────────
            Nodo::Esperar(_) => {
                return Err(format!(
                    "Línea {}: `esperar` aún no está soportado en el compilador bytecode.",
                    linea
                ));
            },

            // ─── POR CADA ──────────────────────────────────────────────────
            Nodo::PorCada { variable: _, iterable, cuerpo: _ } => {
                self.compilar_nodo(iterable, linea)?;
                return Err(format!(
                    "Línea {}: `por cada` aún no está soportado en el compilador bytecode. Usa `mientras` como alternativa.",
                    linea
                ));
            },

            // ─── FALLBACK ───────────────────────────────────────────────────
            _ => return Err(format!(
                "Línea {}: El compilador no soporta todavía el nodo: {:?}", 
                linea, nodo
            )),
        }
        Ok(())
    }

    // ─── Helpers de Emisión ─────────────────────────────────────────────────

    fn emitir_byte(&mut self, byte: u8, linea: usize) {
        self.chunk.escribir(byte, linea);
    }

    fn emitir_bytes(&mut self, byte1: u8, byte2: u8, linea: usize) {
        self.chunk.escribir(byte1, linea);
        self.chunk.escribir(byte2, linea);
    }

    /// Intenta evaluar un nodo como un literal constante en tiempo de compilación.
    /// Retorna None si el nodo es demasiado complejo para evaluar estáticamente.
    fn try_eval_literal(&self, nodo: &Nodo) -> Option<Valor> {
        match nodo {
            Nodo::EnteroLit(v) => Some(Valor::Entero(*v)),
            Nodo::DecimalLit(v) => Some(Valor::Decimal(*v)),
            Nodo::TextoLit(v) => Some(Valor::Texto(v.clone())),
            Nodo::BooleanoLit(v) => Some(Valor::Booleano(*v)),
            Nodo::NuloLit => Some(Valor::Nulo),
            Nodo::SuperposicionLit { alpha, beta } => Some(Valor::Superposicion {
                alpha: *alpha,
                beta: *beta,
            }),
            Nodo::Metadata { nodo: inner, .. } => self.try_eval_literal(inner),
            _ => None,
        }
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aritmética_completa_con_compilador() {
        // 1 + 2 * 3 = 7
        let n_1 = Box::new(Nodo::EnteroLit(1));
        let n_2 = Box::new(Nodo::EnteroLit(2));
        let n_3 = Box::new(Nodo::EnteroLit(3));

        let mul = Box::new(Nodo::Binario {
            izq: n_2,
            op: OpBinario::Multiplicar,
            der: n_3,
        });

        let eq = Nodo::Binario {
            izq: n_1,
            op: OpBinario::Sumar,
            der: mul,
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar(&eq).is_ok());

        // Verificar que el chunk tiene instrucciones
        assert!(!compilador.chunk.codigo.is_empty());
    }

    #[test]
    fn test_compilar_variable_global() {
        use crate::ast::Programa;
        
        let programa = Programa {
            sentencias: vec![
                Nodo::Asignacion {
                    nombre: "x".to_string(),
                    valor: Box::new(Nodo::EnteroLit(42)),
                },
                Nodo::Mostrar(Box::new(Nodo::Identificador("x".to_string()))),
            ],
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());
        assert!(!compilador.chunk.codigo.is_empty());
    }

    #[test]
    fn test_compilar_condicional() {
        let programa = crate::ast::Programa {
            sentencias: vec![
                Nodo::Condicional {
                    condicion: Box::new(Nodo::BooleanoLit(true)),
                    cuerpo_si: vec![
                        Nodo::Mostrar(Box::new(Nodo::TextoLit("si!".to_string()))),
                    ],
                    cuerpo_sino: Some(vec![
                        Nodo::Mostrar(Box::new(Nodo::TextoLit("no!".to_string()))),
                    ]),
                },
            ],
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());
    }

    #[test]
    fn test_compilar_mientras() {
        let programa = crate::ast::Programa {
            sentencias: vec![
                Nodo::Asignacion {
                    nombre: "i".to_string(),
                    valor: Box::new(Nodo::EnteroLit(0)),
                },
                Nodo::Mientras {
                    condicion: Box::new(Nodo::Binario {
                        izq: Box::new(Nodo::Identificador("i".to_string())),
                        op: OpBinario::Menor,
                        der: Box::new(Nodo::EnteroLit(5)),
                    }),
                    cuerpo: vec![
                        Nodo::Mostrar(Box::new(Nodo::Identificador("i".to_string()))),
                    ],
                },
            ],
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());
    }

    #[test]
    fn test_compilar_texto() {
        let mut compilador = Compilador::nuevo();
        let nodo = Nodo::TextoLit("Hola Mundo".to_string());
        assert!(compilador.compilar(&nodo).is_ok());
    }
}
