import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import RichTextView from '../components/rich-text/RichTextView';

describe('rich text renderer', () => {
  it('renders inline marks and safe links from the structured document', () => {
    render(<RichTextView value={{ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Docker', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' portfolio', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
    ] }] }} />);
    expect(screen.getByText('Docker').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'portfolio' })).toHaveAttribute('href', 'https://example.com');
  });

  it('does not render unsafe link protocols as clickable links', () => {
    render(<RichTextView value={{ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'unsafe', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
    ] }] }} />);
    expect(screen.getByText('unsafe').closest('a')).toBeNull();
  });

});
