import type { ReactNode } from 'react';

/**
 * Minimal markdown renderer for AI chat messages.
 *
 * Supports the subset models actually use in chat: headings (#–###), fenced and
 * inline code, bullet and numbered lists, bold, italic and links. Anything else
 * falls through as plain text rather than showing raw syntax to the user.
 *
 * SAFETY: this builds React elements and never touches dangerouslySetInnerHTML,
 * so every string ends up as a text node that React escapes. Model output
 * containing HTML is displayed, not executed. Link hrefs are additionally
 * restricted to http/https/mailto so a `javascript:` URL can't be smuggled in
 * through link syntax.
 */

const SAFE_HREF = /^(https?:|mailto:)/i;

/**
 * Inline markers, matched in one pass. Code first so `**` inside it is literal.
 *
 * Built fresh per call, never shared. renderInline recurses for bold content,
 * and a shared /g/ regex would have its lastIndex reset by the inner call —
 * the outer loop would then rescan from an earlier offset and never terminate.
 */
const inlinePattern = () =>
  /`([^`]+)`|\*\*([\s\S]+?)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = inlinePattern();
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-i${i++}`;
    const [, code, bold, star, underscore, linkText, href] = match;

    if (code !== undefined) {
      out.push(
        <code key={key} className="bg-surface-base/60 rounded px-1 py-0.5 text-[0.85em] font-mono">
          {code}
        </code>,
      );
    } else if (bold !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-ink-primary">
          {renderInline(bold, key)}
        </strong>,
      );
    } else if (star !== undefined || underscore !== undefined) {
      out.push(<em key={key}>{star ?? underscore}</em>);
    } else if (linkText !== undefined && href !== undefined) {
      // An unsafe scheme renders as plain text — the label is still readable.
      if (SAFE_HREF.test(href)) {
        out.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-light"
          >
            {linkText}
          </a>,
        );
      } else {
        out.push(linkText);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

/** True for a line that opens or closes a fenced code block. */
const isFence = (line: string) => line.trimStart().startsWith('```');

export default function Markdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code — consumed verbatim, no inline parsing inside.
    if (isFence(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of input if the model never closed it)
      blocks.push(
        <pre
          key={`b${key++}`}
          className="bg-surface-base/60 rounded-lg p-2 my-1 overflow-x-auto text-xs font-mono whitespace-pre"
        >
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <p
          key={`b${key++}`}
          className={`text-ink-primary font-semibold ${level === 1 ? 'text-base' : 'text-sm'} mt-1`}
        >
          {renderInline(heading[2], `b${key}`)}
        </p>,
      );
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`b${key++}`} className="list-disc pl-5 space-y-0.5 my-1">
          {items.map((item, n) => (
            <li key={n}>{renderInline(item, `b${key}-${n}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`b${key++}`} className="list-decimal pl-5 space-y-0.5 my-1">
          {items.map((item, n) => (
            <li key={n}>{renderInline(item, `b${key}-${n}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: consecutive non-blank lines that don't open another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isFence(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={`b${key++}`} className="whitespace-pre-wrap break-words">
        {renderInline(para.join('\n'), `b${key}`)}
      </p>,
    );
  }

  return <div className="space-y-1">{blocks}</div>;
}
