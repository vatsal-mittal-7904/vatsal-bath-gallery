// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Input } from '../../src/components/ui/Input';

describe('UI Components', () => {
  it('renders Button correctly', () => {
    render(<Button>Click Me</Button>);
    const btn = screen.getByRole('button', { name: /click me/i });
    expect(btn).toBeDefined();
    expect(btn.disabled).toBe(false);
  });

  it('renders Loading Button correctly', () => {
    render(<Button isLoading>Click Me</Button>);
    const btn = screen.getByRole('button', { name: /loading/i });
    expect(btn).toBeDefined();
    expect(btn.disabled).toBe(true);
  });

  it('renders Card correctly', () => {
    render(<Card>Card Content</Card>);
    expect(screen.getByText('Card Content')).toBeDefined();
  });

  it('renders Input correctly', () => {
    render(<Input label="Username" placeholder="Enter username" />);
    expect(screen.getByLabelText('Username')).toBeDefined();
    expect(screen.getByPlaceholderText('Enter username')).toBeDefined();
  });

  it('renders Input with error', () => {
    render(<Input error="Invalid input" />);
    expect(screen.getByText('Invalid input')).toBeDefined();
  });
});
