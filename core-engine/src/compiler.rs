use crate::bytecode::{Chunk, OpCode};
use crate::valor::Valor;
use crate::ast::{Nodo, OpBinario, OpUnario};
use crate::vigilante::Vigilante;
use std::collections::HashMap;

use std::rc::Rc;
use std::cell::RefCell;

/// Schema de un molde registrado en compilación
#[derive(Debug, Clone)]
struct MoldeSchema {
    _campos: Vec<String>,
    _elastico: bool,
}

/// Representa una variable local en el scope del compilador
#[derive(Debug, Clone)]
pub(crate) struct Local {
    pub(crate) nombre: String,
    pub(crate) profundidad: i32, // -1 = no inicializada todavía
}

pub struct Scope {
    pub(crate) locales: Vec<Local>,
    pub(crate) capturas: Vec<Captura>,
    pub(crate) padre: Option<Rc<RefCell<Scope>>>,
}

impl Scope {
    pub fn nuevo(padre: Option<Rc<RefCell<Scope>>>) -> Self {
        Self {
            locales: Vec::new(),
            capturas: Vec::new(),
            padre,
        }
    }

    fn resolver_local(&self, nombre: &str) -> Option<usize> {
        for (i, local) in self.locales.iter().enumerate().rev() {
            if local.nombre == nombre {
                return Some(i);
            }
        }
        None
    }

    fn resolver_captura(&mut self, nombre: &str) -> Option<usize> {
        let padre_opt = self.padre.clone();
        if let Some(padre_rc) = padre_opt {
            let local_idx_opt = padre_rc.borrow().resolver_local(nombre);
            if let Some(local_idx) = local_idx_opt {
                return Some(self.añadir_captura(true, local_idx as u8));
            }
            let captura_idx_opt = padre_rc.borrow_mut().resolver_captura(nombre);
            if let Some(captura_idx) = captura_idx_opt {
                return Some(self.añadir_captura(false, captura_idx as u8));
            }
        }
        None
    }

    fn añadir_captura(&mut self, es_local: bool, index: u8) -> usize {
        for (i, cap) in self.capturas.iter().enumerate() {
            if cap.es_local == es_local && cap.index == index {
                return i;
            }
        }
        let i = self.capturas.len();
        self.capturas.push(Captura { es_local, index });
        i
    }
}

pub struct Compilador {
    pub chunk: Chunk,
    pub scope: Rc<RefCell<Scope>>,
    /// Profundidad actual del scope (0 = global)
    profundidad_scope: i32,
    /// Tabla de nombres globales → índice en constantes
    globales: HashMap<String, usize>,
    /// Tabla de moldes registrados
    moldes: HashMap<String, MoldeSchema>,
    /// Directorio base del archivo fuente en ejecución.
    pub ruta_base: Option<std::path::PathBuf>,
    /// Vigilante para validar rutas de importación (BUG-059)
    pub vigilante: Option<std::rc::Rc<Vigilante>>,
    /// Evita ciclos de importación infinitos
    pub importados: std::collections::HashSet<std::path::PathBuf>,
}

#[derive(Clone, Debug)]
pub struct Captura {
    pub es_local: bool,
    pub index: u8,
}

impl Compilador {
    pub fn nuevo() -> Self {
        Compilador {
            chunk: Chunk::nuevo(),
            scope: Rc::new(RefCell::new(Scope::nuevo(None))),
            profundidad_scope: 0,
            globales: HashMap::new(),
            moldes: HashMap::new(),
            ruta_base: None,
            vigilante: None,
            importados: std::collections::HashSet::new(),
        }
    }

    /// Punto de entrada: Compila un nodo raíz AST a un Chunk de OpCodes.
    /// Usado internamente en tests.
    #[allow(dead_code)]
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
        self.emitir_byte(OpCode::Nulo as u8, 1);
        self.emitir_byte(OpCode::Retorno as u8, 1);
        Ok(())
    }

    // ─── Scope Management ───────────────────────────────────────────────────

    fn iniciar_scope(&mut self) {
        self.profundidad_scope += 1;
    }

    fn cerrar_scope(&mut self, linea: usize) {
        self.profundidad_scope -= 1;
        let pops = {
            let mut scope = self.scope.borrow_mut();
            let mut count = 0;
            while !scope.locales.is_empty() 
                && scope.locales.last().unwrap().profundidad > self.profundidad_scope 
            {
                scope.locales.pop();
                count += 1;
            }
            count
        };
        for _ in 0..pops {
            self.emitir_byte(OpCode::Pop as u8, linea);
        }
    }

    fn añadir_local(&mut self, nombre: String) -> Result<(), String> {
        let mut scope = self.scope.borrow_mut();
        if scope.locales.len() >= 256 {
            return Err("Demasiadas variables locales (máximo 256)".to_string());
        }
        scope.locales.push(Local {
            nombre,
            profundidad: self.profundidad_scope,
        });
        Ok(())
    }

    fn resolver_local(&self, nombre: &str) -> Option<usize> {
        self.scope.borrow().resolver_local(nombre)
    }

    fn resolver_captura(&mut self, nombre: &str) -> Option<usize> {
        self.scope.borrow_mut().resolver_captura(nombre)
    }

    fn identificador_constante(&mut self, nombre: &str) -> Result<usize, String> {
        // Reutilizar si ya existe
        if let Some(&idx) = self.globales.get(nombre) {
            return Ok(idx);
        }
        let idx = self.chunk.añadir_constante(Valor::Texto(nombre.to_string()))?;
        self.globales.insert(nombre.to_string(), idx);
        Ok(idx)
    }

    // ─── Compilar Nodo ──────────────────────────────────────────────────────

    fn compilar_nodo(&mut self, nodo: &Nodo, linea: usize) -> Result<(), String> {
        match nodo {
            Nodo::Metadata { linea: l, nodo: n, .. } => {
                self.compilar_nodo(n, *l)?;
            },
            
            // ─── LITERALES ──────────────────────────────────────────────────
            Nodo::EnteroLit(val) => {
                let idx = self.chunk.añadir_constante(Valor::Entero(*val))?;
                self.emitir_op_u16(OpCode::Constante as u8, idx as u16, linea);
            },
            Nodo::DecimalLit(val) => {
                let idx = self.chunk.añadir_constante(Valor::Decimal(*val))?;
                self.emitir_op_u16(OpCode::Constante as u8, idx as u16, linea);
            },
            Nodo::TextoLit(val) => {
                let idx = self.chunk.añadir_constante(Valor::Texto(val.clone()))?;
                self.emitir_op_u16(OpCode::Constante as u8, idx as u16, linea);
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
                        self.chunk.parchear_salto(salto_fin)?;
                    },
                    OpBinario::O => {
                        self.compilar_nodo(izq, linea)?;
                        // Si izq es verdadero, saltamos al final (el valor queda en pila)
                        // Para esto necesitamos un SaltoSiVerdadero o similar,
                        // o usar SaltoSiFalso para ir al bloque que evalúa der.
                        let salto_eval_der = self.chunk.emitir_salto(OpCode::SaltoSiFalso, linea);
                        let salto_fin = self.chunk.emitir_salto(OpCode::Salto, linea);

                        self.chunk.parchear_salto(salto_eval_der)?;
                        self.emitir_byte(OpCode::Pop as u8, linea);
                        self.compilar_nodo(der, linea)?;
                        self.chunk.parchear_salto(salto_fin)?;
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
                // BUG-054: 'Mostrar' siempre es una sentencia, por lo que hacemos Pop
                // del valor Nulo que 'Imprimir' empuja para evitar stack pollution.
                self.emitir_byte(OpCode::Pop as u8, linea);
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
                    let idx = self.identificador_constante(nombre)?;
                    self.emitir_op_u16(OpCode::DefinirGlobal as u8, idx as u16, linea);
                }
            },

            // ─── VARIABLES (LECTURA) ────────────────────────────────────────
            Nodo::Identificador(nombre) => {
                if let Some(slot) = self.resolver_local(nombre) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                } else if let Some(idx) = self.resolver_captura(nombre) {
                    self.emitir_bytes(OpCode::ObtenerCaptura as u8, idx as u8, linea);
                } else {
                    let idx = self.identificador_constante(nombre)?;
                    self.emitir_op_u16(OpCode::ObtenerGlobal as u8, idx as u16, linea);
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
                self.chunk.parchear_salto(salto_sino)?;
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
                self.chunk.parchear_salto(salto_fin)?;
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
                self.chunk.emitir_bucle(inicio_loop, linea)?;

                // Parchear salida
                self.chunk.parchear_salto(salto_salida)?;
                self.emitir_byte(OpCode::Pop as u8, linea); // pop condición (branch falso)
            },

            // ─── FUNCIONES ──────────────────────────────────────────────────
            Nodo::Funcion { nombre, params, cuerpo } => {
                // Crear un nuevo compilador para la función
                let mut comp_hijo = Compilador::nuevo();
                comp_hijo.ruta_base = self.ruta_base.clone();
                comp_hijo.vigilante = self.vigilante.clone();
                comp_hijo.moldes = self.moldes.clone();
                comp_hijo.scope.borrow_mut().padre = Some(self.scope.clone()); // Permitir resolución de capturas

                // Añadir parámetros como variables locales (slot 0 en adelante)
                // Usamos scope 1 para que sean tratadas como locales inmediatamente
                comp_hijo.profundidad_scope = 1;
                for param in params.iter() {
                    comp_hijo.añadir_local(param.clone())?;
                }

                // Compilar el cuerpo
                for stmt in cuerpo {
                    comp_hijo.compilar_nodo(stmt, linea)?;
                }

                // Si no hay retorno explícito al final, añadir Nulo + Retorno por defecto
                comp_hijo.emitir_byte(OpCode::Nulo as u8, linea);
                comp_hijo.emitir_byte(OpCode::Retorno as u8, linea);

                // Almacenar la función compilada como un valor constante en el padre
                let func_val = Valor::Funcion {
                    nombre: nombre.clone(),
                    arity: params.len(),
                    chunk: std::rc::Rc::new(comp_hijo.chunk),
                };
                let idx = self.chunk.añadir_constante(func_val)?;
                
                if comp_hijo.scope.borrow().capturas.is_empty() {
                    self.emitir_op_u16(OpCode::Constante as u8, idx as u16, linea);
                } else {
                    self.emitir_op_u16(OpCode::ConstruirClosure as u8, idx as u16, linea);
                    self.emitir_byte(comp_hijo.scope.borrow().capturas.len() as u8, linea);
                    for cap in &comp_hijo.scope.borrow().capturas {
                        self.emitir_byte(if cap.es_local { 1 } else { 0 }, linea);
                        self.emitir_byte(cap.index, linea);
                    }
                }

                if self.profundidad_scope > 0 {
                    self.añadir_local(nombre.clone())?;
                } else {
                    let name_idx = self.identificador_constante(nombre)?;
                    self.emitir_op_u16(OpCode::DefinirGlobal as u8, name_idx as u16, linea);
                }
            },

            // ─── CLOSURES (Funciones Anónimas) ──────────────────────────────
            Nodo::Closure { params, cuerpo } => {
                let mut comp_hijo = Compilador::nuevo();
                comp_hijo.ruta_base = self.ruta_base.clone();
                comp_hijo.vigilante = self.vigilante.clone();
                comp_hijo.moldes = self.moldes.clone();
                comp_hijo.scope.borrow_mut().padre = Some(self.scope.clone());

                comp_hijo.profundidad_scope = 1;
                for param in params.iter() {
                    comp_hijo.añadir_local(param.clone())?;
                }

                for stmt in cuerpo {
                    comp_hijo.compilar_nodo(stmt, linea)?;
                }

                comp_hijo.emitir_byte(OpCode::Nulo as u8, linea);
                comp_hijo.emitir_byte(OpCode::Retorno as u8, linea);

                let func_val = Valor::Funcion {
                    nombre: "<closure>".to_string(),
                    arity: params.len(),
                    chunk: std::rc::Rc::new(comp_hijo.chunk),
                };
                let idx = self.chunk.añadir_constante(func_val)?;
                
                if comp_hijo.scope.borrow().capturas.is_empty() {
                    self.emitir_op_u16(OpCode::Constante as u8, idx as u16, linea);
                } else {
                    self.emitir_op_u16(OpCode::ConstruirClosure as u8, idx as u16, linea);
                    self.emitir_byte(comp_hijo.scope.borrow().capturas.len() as u8, linea);
                    for cap in &comp_hijo.scope.borrow().capturas {
                        self.emitir_byte(if cap.es_local { 1 } else { 0 }, linea);
                        self.emitir_byte(cap.index, linea);
                    }
                }
                // No lo asignamos a ninguna variable; el valor se queda en la pila para ser usado como expresión
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
                // Pensar is an isolated scope, and requires VM support to isolate side-effects
                self.emitir_byte(OpCode::EntrarPensar as u8, linea);
                self.iniciar_scope();
                for stmt in cuerpo {
                    self.compilar_nodo(stmt, linea)?;
                }
                self.cerrar_scope(linea);
                self.emitir_byte(OpCode::SalirPensar as u8, linea);
            },

            // ─── Superposición Cuántica ─────────────────────────────────────
            Nodo::SuperposicionLit { alpha, beta } => {
                // The values alpha and beta must be put on the stack, then we emit CrearQubit
                let val_alpha = Valor::Decimal(*alpha);
                let val_beta = Valor::Decimal(*beta);
                let idx_a = self.chunk.añadir_constante(val_alpha)?;
                let idx_b = self.chunk.añadir_constante(val_beta)?;
                self.emitir_op_u16(OpCode::Constante as u8, idx_a as u16, linea);
                self.emitir_op_u16(OpCode::Constante as u8, idx_b as u16, linea);
                self.emitir_byte(OpCode::CrearQubit as u8, linea);
            },

            // ─── Colapso Cuántico ───────────────────────────────────────────
            Nodo::Colapsar(expr) => {
                self.compilar_nodo(expr, linea)?;
                self.emitir_byte(OpCode::ColapsarQuantum as u8, linea);
            },

            // ─── Identificadores ───────────────────────────────────────────────────
            #[cfg(not(target_arch = "wasm32"))]
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

                // BUG-059 Fix: Validar la ruta contra el Vigilante antes de leer
                if let Some(ref vigilante) = self.vigilante {
                    vigilante.autorizar_ruta(&str_path)
                        .map_err(|e| format!("Línea {}: Importación bloqueada para '{}': {}", linea, str_path, e))?;
                }

                // Ciclo de importación check
                let abs_path = std::fs::canonicalize(&final_path).unwrap_or_else(|_| final_path.clone());
                if self.importados.contains(&abs_path) {
                    return Err(format!("Línea {}: Ciclo de importación detectado en '{}'", linea, str_path));
                }
                self.importados.insert(abs_path.clone());

                let fuente = std::fs::read_to_string(&final_path)
                    .map_err(|e| format!("Línea {}: No se pudo importar '{}': {}", linea, str_path, e))?;

                let mut lex = crate::lexer::Lexer::nuevo(&fuente, None);
                let tokens = lex.tokenizar().map_err(|e| format!("Línea {}: Error léxico en '{}': {}", linea, str_path, e))?;
                let mut par = crate::parser::Parser::nuevo(tokens);
                let programa_import = par.parsear().map_err(|e| format!("Línea {}: Error de sintaxis en '{}': {}", linea, str_path, e))?;

                // Guardar la ruta_base original, actualizarla, compilar y restaurar
                let old_base = self.ruta_base.clone();
                self.ruta_base = abs_path.parent().map(|p| p.to_path_buf());

                for stmt in programa_import.sentencias {
                    self.compilar_nodo(&stmt, linea)?;
                }

                self.ruta_base = old_base;
            },

            #[cfg(target_arch = "wasm32")]
            Nodo::Importar { modulo } => {
                return Err(format!("Línea {}: La importación de módulos ('{}') no está soportada en WebAssembly", linea, modulo));
            },


            // ─── MOLDE INSTANCIA ────────────────────────────────────────────
            Nodo::MoldeInstancia { nombre, valores } => {
                let name_idx = self.identificador_constante(nombre)?;
                self.emitir_op_u16(OpCode::ConstruirMolde as u8, name_idx as u16, linea);

                for (campo, val) in valores {
                    // El ConstruirMolde (o el AsignarCampo anterior) deja el molde en el tope de la pila.
                    // Empujamos el valor
                    self.compilar_nodo(val, linea)?;
                    
                    // AsignarCampo (u16 operand para el nombre del campo)
                    // Poperá el valor y el molde, y volverá a pushear el molde mutado.
                    let field_idx = self.identificador_constante(campo)?;
                    self.emitir_op_u16(OpCode::AsignarCampo as u8, field_idx as u16, linea);
                }
            },

            // ─── LISTAS ─────────────────────────────────────────────────────
            Nodo::ListaLit(elementos) => {
                let count = elementos.len();
                for elem in elementos {
                    self.compilar_nodo(elem, linea)?;
                }
                self.emitir_op_u16(OpCode::ConstruirLista as u8, count as u16, linea);
            },

            // ─── MOLDE DEFINICIÓN ───────────────────────────────────────────
            Nodo::MoldeDefinicion { nombre, campos, elastico } => {
                // Registrar molde en tabla interna para el compilador
                self.moldes.insert(nombre.clone(), MoldeSchema {
                    _campos: campos.clone(),
                    _elastico: *elastico,
                });
                // No emitimos bytecode — solo metadata de compilación
            },



            // ─── ASIGNACIÓN DE CAMPO (obj.campo = valor) ────────────────────
            Nodo::AsignacionCampo { objeto, campo, valor } => {
                // Compilar el objeto base
                self.compilar_nodo(objeto, linea)?;

                // Compilar el valor
                self.compilar_nodo(valor, linea)?;

                let field_idx = self.identificador_constante(campo)?;
                self.emitir_op_u16(OpCode::AsignarCampo as u8, field_idx as u16, linea);
            },

            // ─── ASIGNACIÓN DE ÍNDICE (lista[indice] = valor) ────────────────
            Nodo::AsignacionIndice { lista, indice, valor } => {
                // BUG-052: lista es ahora una expresión general, no un identificador.
                self.compilar_nodo(lista, linea)?;
                
                // Push el índice
                self.compilar_nodo(indice, linea)?;
                // Push el valor
                self.compilar_nodo(valor, linea)?;
                
                // Emit set index (consume valor, indice, lista, y pushea la lista mutada)
                self.emitir_byte(OpCode::AsignarIndice as u8, linea);
                
                // Pop la lista mutada para evitar stack pollution. 
                // Las listas son Rc<RefCell>, la mutación ya es visible globalmente.
                self.emitir_byte(OpCode::Pop as u8, linea);
            },

            // ─── ACCESO A CAMPO (obj.campo) ─────────────────────────────────
            Nodo::AccesoCampo { objeto, campo } => {
                self.compilar_nodo(objeto, linea)?;
                let field_idx = self.identificador_constante(campo)?;
                self.emitir_op_u16(OpCode::ObtenerCampo as u8, field_idx as u16, linea);
            },

            // ─── LLAMADAS (extendido para builtins) ─────────────────────────
            Nodo::Llamada { funcion, args } => {
                // Check if it's a builtin call
                let funcion_real = match funcion.as_ref() {
                    Nodo::Metadata { nodo, .. } => nodo.as_ref(),
                    otro => otro,
                };
                let builtin_name = match funcion_real {
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
                    let name_idx = self.identificador_constante(&name)?;
                    self.emitir_byte(OpCode::LlamarBuiltin as u8, linea);
                    let bytes = (name_idx as u16).to_le_bytes();
                    self.emitir_byte(bytes[0], linea);
                    self.emitir_byte(bytes[1], linea);
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
                self.emitir_byte(OpCode::ObtenerIndice as u8, linea);
            },

            // ─── CATCH EN LINEA (expr :,[ fallback) ─────────────────────────
            Nodo::CatchEnLinea { expresion, fallback } => {
                let salto_catch = self.chunk.emitir_salto(OpCode::ConfigurarCatch, linea);
                
                self.compilar_nodo(expresion, linea)?;
                
                self.emitir_byte(OpCode::LimpiarCatch as u8, linea);
                let salto_fin = self.chunk.emitir_salto(OpCode::Salto, linea);

                self.chunk.parchear_salto(salto_catch)?;
                // BUG-048: En lugar de contaminar el scope global con "ultimo_error",
                // simplemente hacemos Pop del error ya que CatchEnLinea no tiene "binding".
                self.emitir_byte(OpCode::Pop as u8, linea);
                
                self.compilar_nodo(fallback, linea)?;
                
                self.chunk.parchear_salto(salto_fin)?;
            },

            // ─── ESPERAR (await) ────────────────────────────────────────────
            Nodo::Esperar(expr) => {
                self.compilar_nodo(expr, linea)?;
                self.emitir_byte(OpCode::Esperar as u8, linea);
            },

            // ─── POR CADA ──────────────────────────────────────────────────
            Nodo::PorCada { variable, iterable, cuerpo } => {
                // Scope exterior para aislar variables internas
                self.iniciar_scope();
                
                // Compilar iterable y guardarlo en local oculta
                self.compilar_nodo(iterable, linea)?;
                let hidden_list = format!("__iter_list_{}", self.profundidad_scope);
                self.añadir_local(hidden_list.clone())?; // valor en pila

                // Obtener longitud y guardar en local oculta
                if let Some(slot) = self.resolver_local(&hidden_list) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                }
                self.emitir_byte(OpCode::ObtenerLongitud as u8, linea);
                let hidden_len = format!("__iter_len_{}", self.profundidad_scope);
                self.añadir_local(hidden_len.clone())?;

                // Inicializar índice a 0
                let zero_idx = self.chunk.añadir_constante(Valor::Entero(0))?;
                self.emitir_op_u16(OpCode::Constante as u8, zero_idx as u16, linea);
                let hidden_idx = format!("__iter_idx_{}", self.profundidad_scope);
                self.añadir_local(hidden_idx.clone())?;

                // Guardar inicio de bucle
                let inicio_loop = self.chunk.codigo.len();

                // Condición: índice < longitud
                if let Some(slot) = self.resolver_local(&hidden_idx) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                }
                if let Some(slot) = self.resolver_local(&hidden_len) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                }
                self.emitir_byte(OpCode::Menor as u8, linea);

                let salto_salida = self.chunk.emitir_salto(OpCode::SaltoSiFalso, linea);
                self.emitir_byte(OpCode::Pop as u8, linea); // pop boolean

                // Scope del cuerpo del bucle
                self.iniciar_scope();

                // Asignar elemento actual a `variable`
                if let Some(slot) = self.resolver_local(&hidden_list) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                }
                if let Some(slot) = self.resolver_local(&hidden_idx) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                }
                self.emitir_byte(OpCode::ObtenerIndice as u8, linea);
                self.añadir_local(variable.clone())?; // El valor ya está en la pila, se mapea al nombre `variable`

                // Compilar el cuerpo
                for stmt in cuerpo {
                    self.compilar_nodo(stmt, linea)?;
                }

                // Cerrar scope del cuerpo
                self.cerrar_scope(linea);

                // Incrementar índice
                if let Some(slot) = self.resolver_local(&hidden_idx) {
                    self.emitir_bytes(OpCode::ObtenerLocal as u8, slot as u8, linea);
                }
                let one_idx = self.chunk.añadir_constante(Valor::Entero(1))?;
                self.emitir_op_u16(OpCode::Constante as u8, one_idx as u16, linea);
                self.emitir_byte(OpCode::Suma as u8, linea);
                if let Some(slot) = self.resolver_local(&hidden_idx) {
                    self.emitir_bytes(OpCode::AsignarLocal as u8, slot as u8, linea);
                }
                self.emitir_byte(OpCode::Pop as u8, linea); // Pop el resultado de la suma

                // Volver al inicio
                self.chunk.emitir_bucle(inicio_loop, linea)?;

                // Parchear salto de salida
                self.chunk.parchear_salto(salto_salida)?;
                self.emitir_byte(OpCode::Pop as u8, linea); // pop boolean (branch falso)

                // Cerrar scope exterior (limpia las variables ocultas)
                self.cerrar_scope(linea);
            },

            // ─── MÉTODOS Y OOP (FASE H) ─────────────────────────────────────
            Nodo::Este => {
                self.emitir_byte(OpCode::ObtenerEste as u8, linea);
            },
            Nodo::LlamadaMetodo { objeto, metodo, args } => {
                // Then compile the object (so it's below the arguments in the stack)
                self.compilar_nodo(objeto, linea)?;
                // Compile arguments after
                for arg in args {
                    self.compilar_nodo(arg, linea)?;
                }
                // Emit InvocacionMetodo
                let name_idx = self.identificador_constante(metodo)?;
                self.emitir_op_u16(OpCode::InvocacionMetodo as u8, name_idx as u16, linea);
                self.emitir_byte(args.len() as u8, linea);
            },
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

    fn emitir_op_u16(&mut self, opcode: u8, operando: u16, linea: usize) {
        self.chunk.escribir(opcode, linea);
        let bytes = operando.to_le_bytes();
        self.chunk.escribir(bytes[0], linea);
        self.chunk.escribir(bytes[1], linea);
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

    #[test]
    fn test_compilar_acceso_indice() {
        let programa = crate::ast::Programa {
            sentencias: vec![
                Nodo::Mostrar(Box::new(Nodo::AccesoIndice {
                    lista: Box::new(Nodo::ListaLit(vec![
                        Nodo::EnteroLit(10),
                        Nodo::EnteroLit(20),
                        Nodo::EnteroLit(30),
                    ])),
                    indice: Box::new(Nodo::EnteroLit(1)),
                })),
            ],
        };
        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());
        let mut vm = crate::vm::VM::nueva(compilador.chunk);
        assert!(vm.ejecutar().is_ok());
    }

    #[test]
    fn test_compilar_por_cada() {
        let programa = crate::ast::Programa {
            sentencias: vec![
                Nodo::PorCada {
                    variable: "x".to_string(),
                    iterable: Box::new(Nodo::ListaLit(vec![
                        Nodo::EnteroLit(1),
                        Nodo::EnteroLit(2),
                    ])),
                    cuerpo: vec![
                        Nodo::Mostrar(Box::new(Nodo::Identificador("x".to_string()))),
                    ],
                },
            ],
        };
        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());
        let mut vm = crate::vm::VM::nueva(compilador.chunk);
        assert!(vm.ejecutar().is_ok());
    }
}
