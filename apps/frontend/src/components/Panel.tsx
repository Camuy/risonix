import type { ReactNode } from 'react';

interface PanelProps {
  side: 'left' | 'right';
  width: number;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Pannello laterale con intestazione e corpo scrollabile. */
export function Panel({ side, width, title, actions, children }: PanelProps) {
  return (
    <aside className={`panel panel--${side}`} style={{ width }} aria-label={title}>
      <div className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {actions ? <div className="panel__actions">{actions}</div> : null}
      </div>
      <div className="panel__body">{children}</div>
    </aside>
  );
}
