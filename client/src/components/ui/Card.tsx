import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
  accentHeader?: boolean;
}

export function Card({
  children,
  interactive = false,
  accentHeader = false,
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-raid-border bg-raid-card p-6 ${
        interactive ? 'cursor-pointer transition-colors hover:border-raid-accent/40' : ''
      } ${accentHeader ? 'border-t-2 border-t-raid-accent' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
