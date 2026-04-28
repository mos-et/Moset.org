import iconScript from "../assets/icons/script_file.ico";
import iconText from "../assets/icons/text_file.ico";
import iconWebpage from "../assets/icons/webpage_file.ico";
import iconImage from "../assets/icons/image_file.ico";
import iconAudio from "../assets/icons/audio_file.ico";
import iconVideo from "../assets/icons/video_file.ico";
import iconWorkspace from "../assets/icons/workspace.ico";
import iconSpreadsheet from "../assets/icons/spreadsheet_file.ico";
import iconGithub from "../assets/icons/github.ico";
import iconPassword from "../assets/icons/password_manager.ico";
import iconStickyNote from "../assets/icons/sticky_note.ico";
import iconPaint from "../assets/icons/paint.ico";

export const FILE_ICON_MAP: Record<string, string> = {
  ".et":   iconScript,    // Moset files → script retro icon
  ".rs":   iconScript,
  ".toml": iconWorkspace,
  ".md":   iconStickyNote,
  ".ts":   iconScript,
  ".tsx":  iconScript,
  ".json": iconSpreadsheet,
  ".css":  iconPaint,
  ".py":   iconScript,
  ".js":   iconScript,
  ".html": iconWebpage,
  ".sh":   iconScript,
  ".txt":  iconText,
  ".lock": iconPassword,
  ".png":  iconImage,
  ".jpg":  iconImage,
  ".jpeg": iconImage,
  ".svg":  iconImage,
  ".gif":  iconImage,
  ".webp": iconImage,
  ".mp3":  iconAudio,
  ".wav":  iconAudio,
  ".ogg":  iconAudio,
  ".mp4":  iconVideo,
  ".webm": iconVideo,
  ".yml":  iconWorkspace,
  ".yaml": iconWorkspace,
  ".git":  iconGithub,
};

export function getIconSrc(name: string): string {
  if (name === "folder") return iconWorkspace;
  const ext = name.slice(name.lastIndexOf("."));
  return FILE_ICON_MAP[ext] ?? iconText;
}

export function FileIcon({ name, size = 15 }: { name: string; size?: number }) {
  return <img src={getIconSrc(name)} alt="" width={size} height={size} style={{ imageRendering: "pixelated" }} />;
}
