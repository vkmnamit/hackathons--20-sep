import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:   'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-400/30 hover:-translate-y-px',
  secondary: 'bg-[#182130] hover:bg-[#202d40] text-[#e8e8ed] border border-[#2a3a50]',
  ghost:     'hover:bg-[#182130] text-[#a0a0b0] hover:text-[#e8e8ed]',
  danger:    'bg-red-600/80 hover:bg-red-600 text-white',
  outline:   'border border-[#2a3a50] hover:border-blue-400/60 hover:bg-blue-500/10 text-[#e8e8ed]',
};

const sizes: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-sm gap-1.5',
  md: 'px-4.5 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
};

export function Button({
  children, variant = 'secondary', size = 'md', loading, disabled, className, onClick, type = 'button',
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold transition-all duration-150 cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
    >
      {loading && <Loader2 className="animate-spin" size={14} />}
      {children}
    </button>
  );
}
