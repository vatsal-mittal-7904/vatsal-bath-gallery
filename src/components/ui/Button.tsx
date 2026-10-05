import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  isLoading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed shadow-xs active:scale-[0.99]';
  
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500 disabled:bg-blue-400 disabled:text-white/80',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300 focus:ring-gray-400 disabled:bg-gray-100 disabled:text-gray-400 border border-gray-200',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500 disabled:bg-red-400 disabled:text-white/80',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  );
}

