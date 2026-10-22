import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { haptic } from '../lib/haptics';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'accent';
  tall?: boolean;
  compact?: boolean;
  icon?: ReactNode;
  sub?: string;
};

/** Pill button: scales to 0.97 on press with a haptic tap. */
export function Button({ variant = 'primary', tall, compact, icon, sub, children, className = '', onPointerDown, ...rest }: Props) {
  const cls = ['btn', variant === 'primary' ? 'btn-primary' : 'btn-secondary', variant === 'accent' ? 'accent' : '', tall ? 'tall' : '', compact ? 'compact' : '', className]
    .filter(Boolean).join(' ');
  return (
    <button
      className={cls}
      onPointerDown={(e) => { if (!rest.disabled) haptic(8); onPointerDown?.(e); }}
      {...rest}
    >
      {icon}
      {tall ? <span className="lbl">{children}{sub && <span className="sub">{sub}</span>}</span> : children}
    </button>
  );
}

export function IconButton({ label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className="icon-btn" aria-label={label} onPointerDown={() => haptic(6)} {...rest}>{children}</button>
  );
}
