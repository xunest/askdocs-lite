import { type ReactNode, type MouseEvent } from 'react';

type IconBtnVariant = 'default' | 'danger' | 'success' | 'primary';

interface IconBtnProps {
  icon: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  variant?: IconBtnVariant;
  size?: number;
  disabled?: boolean;
}

const variantStyles: Record<IconBtnVariant, { color: string; hoverBg: string; hoverColor: string }> = {
  default: {
    color: 'var(--td-text-color-secondary)',
    hoverBg: 'var(--td-bg-color-component-hover)',
    hoverColor: 'var(--td-text-color-primary)',
  },
  danger: {
    color: 'var(--td-text-color-secondary)',
    hoverBg: '#ffe4e6',
    hoverColor: '#e34d59',
  },
  success: {
    color: 'var(--td-text-color-secondary)',
    hoverBg: '#e8f5e9',
    hoverColor: '#2ba471',
  },
  primary: {
    color: 'var(--td-text-color-secondary)',
    hoverBg: 'var(--td-brand-color-light)',
    hoverColor: 'var(--td-brand-color)',
  },
};

export function IconBtn({ icon, onClick, title, variant = 'default', size = 18, disabled }: IconBtnProps) {
  const style = variantStyles[variant];
  return (
    <button
      className="flex items-center justify-center rounded-lg cursor-pointer transition-all flex-shrink-0"
      style={{
        width: '32px',
        height: '32px',
        color: style.color,
        backgroundColor: 'transparent',
        opacity: disabled ? 0.4 : 1,
      }}
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = style.hoverBg;
        e.currentTarget.style.color = style.hoverColor;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = style.color;
      }}
    >
      {icon}
    </button>
  );
}
