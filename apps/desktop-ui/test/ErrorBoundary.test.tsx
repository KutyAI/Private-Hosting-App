import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary');
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello World</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders fallback when error occurs', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary');
    
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
