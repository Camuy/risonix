import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

export type StateVariant = 'loading' | 'empty' | 'success' | 'error';

const VARIANT_ICON: Record<StateVariant, IconName> = {
  loading: 'loader',
  empty: 'image',
  success: 'check',
  error: 'alert',
};

interface StateMessageProps {
  variant: StateVariant;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

/** Messaggio di stato coerente per loading / empty / success / error. */
export function StateMessage({ variant, title, description, action, compact }: StateMessageProps) {
  const role = variant === 'error' ? 'alert' : 'status';
  return (
    <div className={`state-message${compact ? ' state-message--compact' : ''}`} role={role}>
      <span className="state-message__icon" data-variant={variant}>
        <Icon
          name={VARIANT_ICON[variant]}
          size={compact ? 16 : 20}
          className={variant === 'loading' ? 'spin' : undefined}
        />
      </span>
      <div>
        <p className="state-message__title">{title}</p>
        {description ? <p className="state-message__description">{description}</p> : null}
      </div>
      {action ? <div className="state-message__action">{action}</div> : null}
    </div>
  );
}
