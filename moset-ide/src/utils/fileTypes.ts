export interface FileTab {
  id: string;
  name: string;
  fullPath: string | null;
  language: string;
  content: string;
  modified: boolean;
}

export interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  language?: string;
  children?: TreeNode[];
  open?: boolean;
}

export interface Extension {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
}

export function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "et": case "moset": return "moset";
    case "md": case "markdown": return "markdown";
    case "js": return "javascript";
    case "ts": return "typescript";
    case "tsx": return "typescript";
    case "json": return "json";
    case "rs": return "rust";
    case "py": return "python";
    case "html": return "html";
    case "css": return "css";
    default: return "plaintext";
  }
}
