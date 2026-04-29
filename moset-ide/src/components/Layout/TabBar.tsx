import { FileTab } from "../../utils/fileTypes";
import { FileIcon } from "../../utils/iconMap";

export function TabBar({ tabs, activeId, onSelect, onClose }: {
  tabs: FileTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab ${activeId === tab.id ? "tab-active" : ""}`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab-icon"><FileIcon name={tab.name} size={13} /></span>
          <span className="tab-name">{tab.name}</span>
          {tab.modified && <span className="tab-dot">●</span>}
          <button
            className="tab-close"
            onClick={e => { e.stopPropagation(); onClose(tab.id); }}
          >✕</button>
        </div>
      ))}
    </div>
  );
}
