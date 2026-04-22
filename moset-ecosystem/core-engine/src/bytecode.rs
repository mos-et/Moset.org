use crate::valor::Valor;

/// Representa el conjunto de instrucciones (Bytecode) que la MV entiende.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum OpCode {
    /// Retorna de la función actual o finaliza la ejecución
    Retorno = 0,
    /// Carga una constante en el tope de la pila
    Constante = 1,
    /// Operaciones aritméticas
    Suma = 2,
    Resta = 3,
    Multiplicacion = 4,
    Division = 5,
    /// Negación numérica (-)
    Negacion = 6,
    /// Booleanos y Nulos
    Verdadero = 7,
    Falso = 8,
    Nulo = 9,
    /// Lógica
    No = 10,
    Igual = 11,
    Mayor = 12,
    Menor = 13,
    /// Imprimir (para debug y la consola)
    Imprimir = 14,
    /// Termina el bloque y limpia variables locales
    Pop = 15,

    // ─── Variables Globales ──────────────────────────────────────────────
    /// Define una variable global (operando: u8 índice del nombre en constantes)
    DefinirGlobal = 16,
    /// Obtiene el valor de una variable global
    ObtenerGlobal = 17,
    /// Asigna un nuevo valor a una variable global existente
    AsignarGlobal = 18,

    // ─── Variables Locales ──────────────────────────────────────────────
    /// Lee una variable local por su slot en la pila
    ObtenerLocal = 19,
    /// Escribe una variable local por su slot en la pila
    AsignarLocal = 20,

    // ─── Control de Flujo ────────────────────────────────────────────────
    /// Salto incondicional (operando: u16 offset hacia adelante)
    Salto = 21,
    /// Salto condicional: salta si el tope de la pila es falso
    SaltoSiFalso = 22,
    /// Bucle: salto hacia atrás (operando: u16 offset)
    Bucle = 23,

    // ─── Funciones ──────────────────────────────────────────────────────
    /// Llamada a función (operando: u8 cantidad de argumentos)
    Llamar = 24,

    // ─── Comparaciones extendidas ───────────────────────────────────────
    MayorIgual = 25,
    MenorIgual = 26,
    NoIgual = 27,

    // ─── Operadores lógicos ─────────────────────────────────────────────
    Modulo = 28,

    // ─── Concatenación de texto ─────────────────────────────────────────
    Concatenar = 29,

    // ─── Quantum ────────────────────────────────────────────────────────
    /// Colapsa un Valor::Superposicion en Valor::Booleano
    ColapsarQuantum = 30,

    // ─── Listas ─────────────────────────────────────────────────────────
    /// Construye una lista. Operando: u8 cantidad de elementos en la pila
    ConstruirLista = 31,

    // ─── Campos (Moldes) ────────────────────────────────────────────────
    /// Obtiene un campo de un Molde. Operando: u8 índice del nombre en constantes
    ObtenerCampo = 32,
    /// Asigna un campo de un Molde. Operando: u8 índice del nombre en constantes
    AsignarCampo = 33,

    // ─── Builtins ───────────────────────────────────────────────────────
    /// Llama una función builtin de la stdlib. Operando: u8 nombre_idx, u8 arg_count
    LlamarBuiltin = 34,
}

impl From<u8> for OpCode {
    fn from(byte: u8) -> Self {
        match byte {
            0 => OpCode::Retorno,
            1 => OpCode::Constante,
            2 => OpCode::Suma,
            3 => OpCode::Resta,
            4 => OpCode::Multiplicacion,
            5 => OpCode::Division,
            6 => OpCode::Negacion,
            7 => OpCode::Verdadero,
            8 => OpCode::Falso,
            9 => OpCode::Nulo,
            10 => OpCode::No,
            11 => OpCode::Igual,
            12 => OpCode::Mayor,
            13 => OpCode::Menor,
            14 => OpCode::Imprimir,
            15 => OpCode::Pop,
            16 => OpCode::DefinirGlobal,
            17 => OpCode::ObtenerGlobal,
            18 => OpCode::AsignarGlobal,
            19 => OpCode::ObtenerLocal,
            20 => OpCode::AsignarLocal,
            21 => OpCode::Salto,
            22 => OpCode::SaltoSiFalso,
            23 => OpCode::Bucle,
            24 => OpCode::Llamar,
            25 => OpCode::MayorIgual,
            26 => OpCode::MenorIgual,
            27 => OpCode::NoIgual,
            28 => OpCode::Modulo,
            29 => OpCode::Concatenar,
            30 => OpCode::ColapsarQuantum,
            31 => OpCode::ConstruirLista,
            32 => OpCode::ObtenerCampo,
            33 => OpCode::AsignarCampo,
            34 => OpCode::LlamarBuiltin,
            _ => panic!("OpCode desconocido: {}", byte),
        }
    }
}

/// Un "Chunk" de bytecode representa una secuencia continua de instrucciones.
#[derive(Debug, Clone)]
pub struct Chunk {
    pub codigo: Vec<u8>,
    pub constantes: Vec<Valor>, // Pool de constantes numéricas/cadenas
    pub lineas: Vec<usize>,     // Para rastreo y errores
}

impl Default for Chunk {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl Chunk {
    pub fn nuevo() -> Self {
        Self {
            codigo: Vec::new(),
            constantes: Vec::new(),
            lineas: Vec::new(),
        }
    }

    /// Escribe una instrucción o byte en el chunk (opcodes o índices)
    pub fn escribir(&mut self, byte: u8, linea: usize) {
        self.codigo.push(byte);
        self.lineas.push(linea);
    }

    /// Añade una constante al pool y devuelve su índice
    pub fn añadir_constante(&mut self, valor: Valor) -> usize {
        self.constantes.push(valor);
        self.constantes.len() - 1
    }

    /// Escribe un salto placeholder y retorna el offset para backpatching
    pub fn emitir_salto(&mut self, opcode: OpCode, linea: usize) -> usize {
        self.escribir(opcode as u8, linea);
        // Placeholder de 2 bytes para el offset (u16 big-endian)
        self.escribir(0xFF, linea);
        self.escribir(0xFF, linea);
        self.codigo.len() - 2 // offset del primer byte del placeholder
    }

    /// Parchea un salto previo con el offset real
    pub fn parchear_salto(&mut self, offset: usize) {
        let salto = self.codigo.len() - offset - 2;
        if salto > u16::MAX as usize {
            panic!("Salto demasiado grande para u16");
        }
        self.codigo[offset] = ((salto >> 8) & 0xFF) as u8;
        self.codigo[offset + 1] = (salto & 0xFF) as u8;
    }

    /// Emite un bucle (salto hacia atrás)
    pub fn emitir_bucle(&mut self, inicio_loop: usize, linea: usize) {
        self.escribir(OpCode::Bucle as u8, linea);
        // +2 por los bytes del operando que vamos a escribir
        let offset = self.codigo.len() - inicio_loop + 2;
        if offset > u16::MAX as usize {
            panic!("Bucle demasiado grande para u16");
        }
        self.escribir(((offset >> 8) & 0xFF) as u8, linea);
        self.escribir((offset & 0xFF) as u8, linea);
    }
}
