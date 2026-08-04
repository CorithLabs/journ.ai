import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddItemDrawer from '../AddItemDrawer';
import { FILE_MAX_BYTES } from '../clipboardConstants';
import { db } from '../../../db';

// jsdom does not implement createObjectURL / revokeObjectURL
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:preview'),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

/** Build a File of a given size and MIME type. */
function makeFile(name: string, mime: string, size: number): File {
  const blob = new Blob([new Uint8Array(Math.max(size, 0))], { type: mime });
  return new File([blob], name, { type: mime });
}

function fireUpload(file: File) {
  const input = screen.getByTestId('file-input') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('AddItemDrawer — file upload', () => {
  it('renders the dropzone in the drawer', () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
  });

  it('accepts a PNG image and shows a thumbnail preview', async () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireUpload(makeFile('boarding.png', 'image/png', 1024));
    await waitFor(() => {
      expect(screen.getByTestId('file-thumb')).toBeInTheDocument();
      expect(screen.getByTestId('file-name')).toHaveTextContent('boarding.png');
    });
  });

  it('shows a PDF icon (not a thumbnail) for PDF files with size', async () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireUpload(makeFile('voucher.pdf', 'application/pdf', 2048));
    await waitFor(() => {
      expect(screen.getByTestId('file-name')).toHaveTextContent('voucher.pdf');
      expect(screen.queryByTestId('file-thumb')).not.toBeInTheDocument();
      expect(screen.getByTestId('file-size')).toHaveTextContent('2.0 KB');
    });
  });

  it('rejects a file over 10 MB with a clear error', async () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireUpload(makeFile('big.jpg', 'image/jpeg', FILE_MAX_BYTES + 100));
    await waitFor(() => {
      expect(screen.getByTestId('file-error')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
  });

  it('accepts a file of exactly 10 MB', async () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireUpload(makeFile('exact.pdf', 'application/pdf', FILE_MAX_BYTES));
    await waitFor(() => {
      expect(screen.getByTestId('file-preview')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('file-error')).not.toBeInTheDocument();
  });

  it('rejects an unsupported file type', async () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireUpload(makeFile('notes.txt', 'text/plain', 512));
    await waitFor(() => {
      expect(screen.getByTestId('file-error')).toHaveTextContent(/Unsupported/i);
    });
  });

  it('persists fileBlob, fileName and fileSize to IndexedDB on save', async () => {
    vi.mocked(db.clipboard.add).mockResolvedValue('new-id');
    const onSaved = vi.fn();
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={onSaved} />);
    fireUpload(makeFile('pass.png', 'image/png', 4096));
    await waitFor(() => expect(screen.getByTestId('file-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('save-item-btn'));
    await waitFor(() => {
      expect(db.clipboard.add).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plan-1',
          fileName: 'pass.png',
          fileSize: 4096,
          fileBlob: expect.any(Blob),
          // Empty title falls back to the file name
          title: 'pass.png',
        }),
      );
    });
  });

  it('lets the user remove a selected file', async () => {
    render(<AddItemDrawer planId="plan-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireUpload(makeFile('pass.png', 'image/png', 4096));
    await waitFor(() => expect(screen.getByTestId('file-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('remove-file-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
      expect(screen.getByTestId('dropzone')).toBeInTheDocument();
    });
  });
});
