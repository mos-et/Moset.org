// ============================================================================
// MOSET VM — Chunk (Unidad de Bytecode)
// ============================================================================
// Un Chunk es un "cartucho" de ejecución: contiene el array de bytes
// (instrucciones + operandos), la tabla de constantes, y metadatos
// de línea para diagnósticos.
//
// Diseño plano y cache-friendly: todo vive en vectores contiguos.
// ============================================================================

use super::opcode::OpCode;
use super::value::VMValue;

/// Unidad atómica de bytecode compilado.
/// Un programa Moset se compila a uno o más Chunks (uno por función).
#[derive(Debug, Clone)]
pub struct Chunk {
    /// Stream de bytes: OpCodes intercalados con operandos.
    pub code: Vec<u8>,
    /// Pool de constantes: literales referenciados por OP_CONSTANT.
    pub constants: Vec<VMValue>,
    /// Mapa de línea: lines[i] = línea fuente que generó code[i].
    /// Permite diagnósticos precisos en runtime errors.
    pub lines: Vec<usize>,
}

impl Default for Chunk {
    fn default() -> Self {
        Self::new()
    }
}

impl Chunk {
    pub fn new() -> Self {
        Chunk {
            code: Vec::new(),
            constants: Vec::new(),
            lines: Vec::new(),
        }
    }

    // ─── Escritura ───────────────────────────────────────────────────────

    /// Escribe un byte crudo (opcode u operando) al stream.
    pub fn write(&mut self, byte: u8, line: usize) {
        self.code.push(byte);
        self.lines.push(line);
    }

    /// Escribe un OpCode tipado.
    pub fn write_op(&mut self, op: OpCode, line: usize) {
        self.write(op as u8, line);
    }

    /// Agrega una constante al pool y retorna su índice (u16).
    /// Paniquea si se exceden 65535 constantes (protección de integridad).
    pub fn add_constant(&mut self, value: VMValue) -> u16 {
        self.constants.push(value);
        let idx = self.constants.len() - 1;
        assert!(idx <= u16::MAX as usize, "Pool de constantes agotado (>65535)");
        idx as u16
    }

    /// Atajo: agrega constante + emite OP_CONSTANT con índice de 16-bit.
    pub fn emit_constant(&mut self, value: VMValue, line: usize) {
        let idx = self.add_constant(value);
        self.write_op(OpCode::OP_CONSTANT, line);
        // Big-endian: byte alto primero
        self.write((idx >> 8) as u8, line);
        self.write((idx & 0xFF) as u8, line);
    }

    // ─── Lectura ─────────────────────────────────────────────────────────

    /// Lee un u16 a partir de la posición `offset` (big-endian).
    pub fn read_u16(&self, offset: usize) -> u16 {
        let hi = self.code[offset] as u16;
        let lo = self.code[offset + 1] as u16;
        (hi << 8) | lo
    }

    // ─── Diagnóstico (Disassembler) ──────────────────────────────────────

    /// Imprime un volcado legible del chunk para depuración.
    pub fn disassemble(&self, name: &str) {
        println!("══════ {} ══════", name);
        let mut offset = 0;
        while offset < self.code.len() {
            offset = self.disassemble_instruction(offset);
        }
        println!("══════════════════════");
    }

    /// Desensambla una instrucción individual. Retorna el offset siguiente.
    pub fn disassemble_instruction(&self, offset: usize) -> usize {
        let line = self.lines[offset];
        let byte = self.code[offset];
        let op: OpCode = byte.into();

        // Mostrar línea solo si cambia
        let line_str = if offset > 0 && self.lines[offset - 1] == line {
            "   |".to_string()
        } else {
            format!("{:4}", line)
        };

        match op {
            // Instrucciones con operando u16
            OpCode::OP_CONSTANT
            | OpCode::OP_DEFINE_GLOBAL
            | OpCode::OP_GET_GLOBAL
            | OpCode::OP_SET_GLOBAL
            | OpCode::OP_GET_LOCAL
            | OpCode::OP_SET_LOCAL => {
                let idx = self.read_u16(offset + 1);
                let val_str = if op == OpCode::OP_CONSTANT {
                    format!(" -> {}", self.constants[idx as usize])
                } else {
                    String::new()
                };
                println!("{} {:04X} {:?} [{}]{}", line_str, offset, op, idx, val_str);
                offset + 3
            }

            // Saltos (offset u16)
            OpCode::OP_JUMP | OpCode::OP_JUMP_IF_FALSE | OpCode::OP_LOOP => {
                let jump = self.read_u16(offset + 1);
                println!("{} {:04X} {:?} -> {}", line_str, offset, op, jump);
                offset + 3
            }

            // OP_CALL: 1 byte operando (arg count)
            OpCode::OP_CALL => {
                let arg_count = self.code[offset + 1];
                println!("{} {:04X} {:?} ({})", line_str, offset, op, arg_count);
                offset + 2
            }

            // Instrucciones simples (sin operandos)
            _ => {
                println!("{} {:04X} {:?}", line_str, offset, op);
                offset + 1
            }
        }
    }
}
