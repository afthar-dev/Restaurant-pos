import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Edit Onion
      </button>
      {open && (
        <Dialog label="Edit Onion" onClose={() => setOpen(false)}>
          <input aria-label="Name" />
        </Dialog>
      )}
    </>
  );
}

describe('Dialog', () => {
  it('is named, takes focus, closes on Escape and returns focus to the opener', async () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Edit Onion' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Edit Onion' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('closes with its close button', async () => {
    const onClose = vi.fn();
    render(
      <Dialog label="History" onClose={onClose}>
        <p>Nothing yet</p>
      </Dialog>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog', () => {
  it('names the action and lets the user back out', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Void bill 12?"
        description="The bill number stays on record."
        confirmLabel="Void bill 12"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Void bill 12?' });
    expect(dialog).toHaveAccessibleDescription('The bill number stays on record.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Void bill 12' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
