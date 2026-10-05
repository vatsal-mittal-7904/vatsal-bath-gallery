import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, rightElement, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700 select-none">
            {label}
          </label>
        )}
        <div className="relative w-full">
          <input
            id={inputId}
            ref={ref}
            className={`w-full px-3.5 py-2.5 text-sm bg-white text-gray-900 placeholder:text-gray-400 border rounded-lg shadow-xs transition-colors duration-150 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 disabled:border-gray-200 disabled:cursor-not-allowed ${
              error
                ? 'border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/20'
                : 'border-gray-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20'
            } ${rightElement ? 'pr-10' : ''} ${className}`}
            {...props}
          />
          {rightElement && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-auto">
              {rightElement}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-red-600 font-medium">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';

