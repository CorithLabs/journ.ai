import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Markdown from '../Markdown';

describe('Markdown', () => {
  it('renders bold, italic and inline code', () => {
    const { container } = render(
      <Markdown content="Try **Tsukiji** at *dawn* — use `08:00`." />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('Tsukiji');
    expect(container.querySelector('em')).toHaveTextContent('dawn');
    expect(container.querySelector('code')).toHaveTextContent('08:00');
  });

  it('renders bullet and numbered lists', () => {
    const { container } = render(
      <Markdown content={'Plan:\n- Museum\n- Park\n\n1. Pack\n2. Fly'} />,
    );
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(screen.getByText('Museum')).toBeInTheDocument();
    expect(screen.getByText('Fly')).toBeInTheDocument();
  });

  it('renders fenced code without parsing markdown inside it', () => {
    const { container } = render(
      <Markdown content={'Here:\n```\n**not bold**\n```'} />,
    );
    const pre = container.querySelector('pre');
    expect(pre).toHaveTextContent('**not bold**');
    expect(pre?.querySelector('strong')).toBeNull();
  });

  it('renders an unterminated code fence instead of dropping the text', () => {
    const { container } = render(<Markdown content={'```\nnpm run build'} />);
    expect(container.querySelector('pre')).toHaveTextContent('npm run build');
  });

  it('renders headings', () => {
    const { container } = render(<Markdown content="## Day 2" />);
    expect(container.querySelector('p.font-semibold')).toHaveTextContent('Day 2');
  });

  it('renders safe links as anchors that open in a new tab', () => {
    render(<Markdown content="See [Mapbox](https://mapbox.com) for tokens." />);
    const link = screen.getByRole('link', { name: 'Mapbox' });
    expect(link).toHaveAttribute('href', 'https://mapbox.com');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  // Model output is untrusted input: it can be steered by anything the user
  // pasted into a plan, an activity note, or a clipboard item.
  describe('safety', () => {
    it('renders HTML in model output as text, not markup', () => {
      const { container } = render(
        <Markdown content={'<img src=x onerror="alert(1)">'} />,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain('<img src=x');
    });

    it('does not create a script element from model output', () => {
      const { container } = render(
        <Markdown content={'<script>alert(1)</script>'} />,
      );
      expect(container.querySelector('script')).toBeNull();
    });

    it('refuses a javascript: link, keeping the label as plain text', () => {
      const { container } = render(
        // eslint-disable-next-line no-script-url
        <Markdown content="[click me](javascript:alert(1))" />,
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('click me');
    });
  });

  // renderInline recurses for bold content. With a module-level /g/ regex the
  // inner call reset lastIndex, so the outer loop rescanned from an earlier
  // offset forever — this input exhausted the heap before the fix.
  it('terminates on nested inline markers inside bold', () => {
    const { container } = render(
      <Markdown content="**bold with `code` and *italic* inside** then more text" />,
    );
    expect(container.querySelector('strong')).toBeTruthy();
    expect(container.querySelector('strong code')).toHaveTextContent('code');
    expect(container.textContent).toContain('then more text');
  });

  it('terminates on repeated bold segments in one line', () => {
    const { container } = render(
      <Markdown content="**one** plain **two** plain **three**" />,
    );
    expect(container.querySelectorAll('strong')).toHaveLength(3);
  });

  it('leaves plain text untouched', () => {
    render(<Markdown content="Just a normal sentence." />);
    expect(screen.getByText('Just a normal sentence.')).toBeInTheDocument();
  });
});
