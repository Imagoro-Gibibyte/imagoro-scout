import type { Session } from "./types";

interface Props {
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  menuOpen: boolean;
}

export function TabBar({ sessions, activeId, onSelect, onClose, onAdd, menuOpen }: Props) {
  return (
    <div className="tabbar" role="tablist">
      <div className="tabs">
        {sessions.map((s) => (
          <div
            key={s.id}
            role="tab"
            aria-selected={s.id === activeId}
            className="tab"
            data-active={s.id === activeId}
            onMouseDown={(e) => {
              if (e.button === 0) onSelect(s.id);
            }}
          >
            <span className="tab-kind" data-kind={s.kind} />
            <span className="tab-title">{s.title}</span>
            {sessions.length > 1 && (
              <button
                className="tab-close"
                aria-label={`close ${s.title}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onClose(s.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="tab-add" aria-label="new tab" aria-expanded={menuOpen} onClick={onAdd}>
        +
      </button>
    </div>
  );
}
