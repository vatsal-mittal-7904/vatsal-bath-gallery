import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white text-gray-900 shadow-sm rounded-xl border border-gray-200/80 ${className}`}>
      {children}
    </div>
  );
}

