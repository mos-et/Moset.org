const MAX_RENDER_CHARS = 15000;
const JSON_DUMP_THRESHOLD = 500;

export function isJsonDump(text: string): boolean {
  if (text.length < JSON_DUMP_THRESHOLD) return false;
  
  const jsonChars = (text.match(/[{}\[\]":,]/g) || []).length;
  const ratio = jsonChars / text.length;
  
  if (ratio > 0.25 && text.length > 1000) return true;
  if (text.includes('"added_tokens"') || text.includes('"vocab"') || 
      text.includes('"merges"') || text.includes('"model":{')) return true;
  
  return false;
}

export function sanitizeStreamChunk(accumulated: string, newChunk: string): { text: string; blocked: boolean } {
  let combined = accumulated + newChunk;
  
  if (isJsonDump(combined)) {
    return { 
      text: "[Motor Soberano detectó una respuesta malformada. Esto ocurre cuando el formato del prompt no es compatible con el modelo. Verificá la arquitectura del modelo cargado.]",
      blocked: true 
    };
  }
  
  combined = combined.replace(/<\|im_start\|>assistant/g, "")
    .replace(/<\|im_end\|>/g, "")
    .replace(/<\|im_start\|>/g, "")
    .replace(/<\|end\|>/g, "")
    .replace(/<\|endoftext\|>/g, "")
    .replace(/<\|eot_id\|>/g, "")
    .replace(/<\/s>/g, "")
    .replace(/<human>/gi, "")
    .replace(/<\|start_header_id\|>/gi, "")
    .replace(/im_end>/gi, "")
    .replace(/\|im_start>/gi, "");
  
  return { text: combined, blocked: false };
}
