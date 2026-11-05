import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  label: string;
  icon: IconName;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}

/** Bottone quadrato con sola icona; l'etichetta resta accessibile. */
export function IconButton({ label, icon, onClick, pressed, disabled }: IconButtonProps) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  icon?: IconName;
  variant?: 'default' | 'primary' | 'ghost';
  disabled?: boolean;
}

/** Bottone con etichetta (verbo + oggetto). */
export function Button({ children, onClick, icon, variant = 'default', disabled }: ButtonProps) {
  const variantClass = variant === 'default' ? '' : ` button--${variant}`;
  return (
    <button type="button" className={`button${variantClass}`} onClick={onClick} disabled={disabled}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}
