import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../../src/client/App';

describe('App Component', () => {
  test('renders the app correctly', () => {
    render(<App />);
    const linkElement = screen.getByText(/Welcome to the Game/i);
    expect(linkElement).toBeInTheDocument();
  });
});