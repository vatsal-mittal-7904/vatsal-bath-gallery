import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    return (
      <div className="flex flex-col gap-1 w-full">
        {label && <label htmlFor={inputId} className="text-sm font-medium text-gray-700">{label}</label>}
        <input
          id={inputId}
          ref={ref}
          className={`px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300'
          } ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
