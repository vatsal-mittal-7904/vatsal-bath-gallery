import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white shadow rounded-lg border border-gray-200 ${className}`}>
      {children}
    </div>
  );
}
