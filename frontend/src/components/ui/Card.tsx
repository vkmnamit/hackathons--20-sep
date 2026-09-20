import { cn } from '@/lib/utils';

export function Card({ children, className, onClick }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[#101620]/90 border border-[#223044] rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.16)] backdrop-blur-sm',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:border-blue-400/40 hover:shadow-[0_18px_42px_rgba(0,0,0,0.24)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4 border-b border-[#223044] bg-white/[0.015]', className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}
