// ============================================================================
// MOSET VM — Instruction Set (Opcodes)
// ============================================================================
// El "ADN" de la ejecución. Cada instrucción es de 1 byte (u8).
// Algunas instrucciones van seguidas de operandos (índices o offsets).
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
#[allow(non_camel_case_types)]
pub enum OpCode {
    /// Carga una constante desde el pool.
    /// Operandos: [byte_high, byte_low] (u16 index)
    OP_CONSTANT,
    
    /// Cargas Rápidas (Especializadas)
    OP_TRUE,
    OP_FALSE,
    OP_NIL,
    
    /// Gestión de Pila
    OP_POP,

    /// Aritmética Binaria (Pila: [izq, der] -> [resultado])
    OP_ADD,
    OP_SUB,
    OP_MUL,
    OP_DIV,
    OP_MOD,
    
    /// Comparaciones
    OP_EQUAL,
    OP_GREATER,
    OP_LESS,

    /// Operaciones Unarias
    OP_NEGATE,
    OP_NOT,

    /// Control de Flujo (Saltos Relativos)
    /// Operando: [byte_high, byte_low] (u16 offset)
    OP_JUMP,
    OP_JUMP_IF_FALSE,
    OP_LOOP,

    /// Variables Globales/Locales
    /// Operando: [byte_high, byte_low] (u16 index)
    OP_DEFINE_GLOBAL,
    OP_GET_GLOBAL,
    OP_SET_GLOBAL,
    OP_GET_LOCAL,
    OP_SET_LOCAL,

    /// --- Instrucciones de Motor Soberano ---
    
    /// Observación / Colapso Cuántico.
    /// Toma un valor 'Superposicion' de la pila y lo colapsa a 'Booleano'.
    /// La lógica de colapso puede ser probabilística o asistida por la IA.
    OP_QUANTUM_COLLAPSE,

    /// Bloque Pensar (Shadow Environment)
    /// Crea un entorno espejo aislado para simulación.
    OP_PENSAR_ENTER,
    OP_PENSAR_EXIT,

    /// Llamada a Función / Nativo
    /// Operando: [arg_count]
    OP_CALL,

    /// Salida Estándar (Interacción con consola del IDE)
    OP_PRINT,

    /// Finaliza el frame actual y retorna el valor en la cima.
    OP_RETURN,
}

impl From<u8> for OpCode {
    fn from(value: u8) -> Self {
        // En una VM de producción usaríamos una tabla de búsqueda o transmute seguro.
        // Por ahora, confiamos en la integridad del compilador.
        unsafe { std::mem::transmute(value) }
    }
}
