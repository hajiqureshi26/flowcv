import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { CheckboxField, SelectField, TextareaField } from '@/components/ui/FormFields';
import { Alert, EmptyState, Progress, Skeleton } from '@/components/ui/Feedback';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

afterEach(cleanup);

describe('shared UI primitives', () => {
  it('traps dialog focus, closes on Escape, and restores the previous focus', () => {
    const close = vi.fn();
    const opener = document.createElement('button');
    opener.textContent = 'Open dialog';
    document.body.append(opener);
    opener.focus();
    render(<Dialog titleId="dialog-title" onClose={close}><h2 id="dialog-title">Settings</h2><button>First</button><button>Last</button></Dialog>);
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    expect(first).toHaveFocus();
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    cleanup();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('associates field hints and validation errors with the input', () => {
    render(<TextField name="email" label="Email" hint="Work address" error="Enter a valid email" />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Work address Enter a valid email');
  });

  it('provides labelled native fields, disabled buttons, and semantic feedback primitives', () => {
    render(<>
      <SelectField label="Template" name="template" error="Choose a template"><option value="ats">ATS</option></SelectField>
      <TextareaField label="Notes" name="notes" hint="Optional"/>
      <CheckboxField label="Current role" name="current"/>
      <Button disabled>Save</Button>
      <Alert tone="error">Could not save</Alert>
      <Progress value={140} label="Upload progress"/>
      <Skeleton data-testid="skeleton"/>
      <EmptyState title="Nothing here yet"/>
      <Surface as="article">Card content</Surface>
      <Tooltip content="More information"><button>Details</button></Tooltip>
    </>);
    expect(screen.getByLabelText('Template')).toHaveAccessibleDescription('Choose a template');
    expect(screen.getByLabelText('Notes')).toHaveAccessibleDescription('Optional');
    expect(screen.getByLabelText('Current role')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
    expect(screen.getByRole('article')).toHaveTextContent('Card content');
    expect(screen.getByRole('button', { name: 'Details' })).toHaveAccessibleDescription('More information');
    expect(screen.getByRole('tooltip')).toHaveTextContent('More information');
  });
});
