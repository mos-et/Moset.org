use wasm_bindgen::prelude::*;
use crate::{lexer::Lexer, parser::Parser, compiler::Compilador, vm::{VM, engine::EstadoVM}, valor::Valor};
use std::rc::Rc;
use std::cell::RefCell;

#[wasm_bindgen]
pub struct MosetWasmRuntime {
    maquina: VM,
    output: Rc<RefCell<String>>,
}

#[wasm_bindgen]
impl MosetWasmRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(codigo: &str, idioma_opcional: Option<String>) -> Result<MosetWasmRuntime, JsValue> {
        let idioma = idioma_opcional.unwrap_or_else(|| "es".to_string());
        
        let mut lex = Lexer::nuevo(codigo, Some(&idioma));
        let tokens = match lex.tokenizar() {
            Ok(t) => t,
            Err(e) => return Err(JsValue::from_str(&format!("Error léxico: {}", e))),
        };

        let mut par = Parser::nuevo(tokens);
        let programa = match par.parsear() {
            Ok(p) => p,
            Err(e) => return Err(JsValue::from_str(&format!("Error de sintaxis: {}", e))),
        };

        let mut compilador = Compilador::nuevo();
        if let Err(e) = compilador.compilar_programa(&programa) {
            return Err(JsValue::from_str(&format!("Error de compilación: {}", e)));
        }

        let mut maquina = VM::nueva(compilador.chunk);
        
        let output = Rc::new(RefCell::new(String::new()));
        let output_clone = Rc::clone(&output);

        maquina.on_print = Some(Box::new(move |s| {
            let mut guard = output_clone.borrow_mut();
            guard.push_str(s);
            guard.push('\n');
        }));

        Ok(MosetWasmRuntime {
            maquina,
            output,
        })
    }

    pub fn ejecutar(&mut self) -> Result<JsValue, JsValue> {
        let resultado = self.maquina.ejecutar();
        self.manejar_estado(resultado)
    }

    pub fn reanudar(&mut self, valor_resuelto_json: &str) -> Result<JsValue, JsValue> {
        let valor_resuelto = match serde_json::from_str::<serde_json::Value>(valor_resuelto_json) {
            Ok(json_val) => Self::json_a_valor(&json_val),
            Err(_) => Valor::Texto(valor_resuelto_json.to_string()), // Fallback for raw strings
        };
        let resultado = self.maquina.reanudar(valor_resuelto);
        self.manejar_estado(resultado)
    }

    fn json_a_valor(json_val: &serde_json::Value) -> Valor {
        match json_val {
            serde_json::Value::Null => Valor::Nulo,
            serde_json::Value::Bool(b) => Valor::Booleano(*b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Valor::Entero(i)
                } else if let Some(f) = n.as_f64() {
                    Valor::Decimal(f)
                } else {
                    Valor::Nulo
                }
            },
            serde_json::Value::String(s) => Valor::Texto(s.clone()),
            serde_json::Value::Array(arr) => {
                let mut vec = Vec::new();
                for v in arr {
                    vec.push(Self::json_a_valor(v));
                }
                Valor::Lista(Rc::new(RefCell::new(vec)))
            },
            serde_json::Value::Object(obj) => {
                let mut campos = std::collections::HashMap::new();
                for (k, v) in obj {
                    campos.insert(k.clone(), Self::json_a_valor(v));
                }
                Valor::Molde(Rc::new(RefCell::new(crate::valor::InstanciaMolde {
                    nombre: "ObjetoJS".to_string(),
                    campos,
                    extra: std::collections::HashMap::new(),
                })))
            }
        }
    }

    fn manejar_estado(&self, resultado: Result<EstadoVM, String>) -> Result<JsValue, JsValue> {
        match resultado {
            Ok(EstadoVM::Terminado(res)) => {
                let guard = self.output.borrow();
                let output_str = if guard.is_empty() {
                    res.to_string()
                } else {
                    guard.clone()
                };
                let obj = js_sys::Object::new();
                js_sys::Reflect::set(&obj, &JsValue::from_str("estado"), &JsValue::from_str("Terminado")).unwrap();
                js_sys::Reflect::set(&obj, &JsValue::from_str("resultado"), &JsValue::from_str(&output_str)).unwrap();
                Ok(obj.into())
            },
            Ok(EstadoVM::Suspendido(promesa)) => {
                let obj = js_sys::Object::new();
                js_sys::Reflect::set(&obj, &JsValue::from_str("estado"), &JsValue::from_str("Suspendido")).unwrap();
                js_sys::Reflect::set(&obj, &JsValue::from_str("promesa"), &JsValue::from_str(&promesa.to_string())).unwrap();
                Ok(obj.into())
            },
            Err(e) => Err(JsValue::from_str(&format!("Error de ejecución: {}", e))),
        }
    }
}
