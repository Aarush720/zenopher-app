import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PanelRightOpen } from 'lucide-react';

interface ReviewSidebarProps {
  children: (controls: {
    collapse: () => void;
    collapseButtonRef: RefObject<HTMLButtonElement | null>;
    contentId: string;
  }) => ReactNode;
}

export function ReviewSidebar({ children }: ReviewSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const previousCollapsed = useRef(collapsed);
  const reopenButtonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const contentId = useId();

  useLayoutEffect(() => {
    if (previousCollapsed.current === collapsed) return;
    previousCollapsed.current = collapsed;
    (collapsed ? reopenButtonRef : collapseButtonRef).current?.focus();
  }, [collapsed]);

  return (
    <aside className={`floating-panel teacher-review-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Design review">
      <button
        ref={reopenButtonRef}
        className="review-panel-reopen"
        hidden={!collapsed}
        aria-label="Expand Review panel"
        aria-expanded={false}
        aria-controls={contentId}
        title="Expand Review panel"
        onClick={() => setCollapsed(false)}
      >
        <PanelRightOpen size={16} aria-hidden="true" />
        <span>Review</span>
      </button>
      <div id={contentId} className="teacher-review-content" hidden={collapsed}>
        {children({ collapse: () => setCollapsed(true), collapseButtonRef, contentId })}
      </div>
    </aside>
  );
}
