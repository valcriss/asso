export interface ParsedOfxTransaction {
  fitId: string;
  postedAt: Date;
  amount: string;
  name: string;
  memo?: string;
}

interface OfxNode {
  tag: string;
  text: string;
  children: OfxNode[];
}

export function parseOfxTransactions(content: string): ParsedOfxTransaction[] {
  const ofxBody = extractOfxBody(content);
  const root = parseSgml(ofxBody);
  const transactions: ParsedOfxTransaction[] = [];

  const stmtNodes = collectNodes(root, 'STMTTRN');

  for (const node of stmtNodes) {
    const fitId = getChildText(node, 'FITID');
    const postedRaw = getChildText(node, 'DTPOSTED');
    const amountRaw = getChildText(node, 'TRNAMT');

    if (!fitId || !postedRaw || !amountRaw) {
      continue;
    }

    const postedAt = parseOfxDate(postedRaw);
    if (!postedAt) {
      continue;
    }

    const amount = normalizeAmount(amountRaw);
    if (!amount) {
      continue;
    }

    const name = getChildText(node, 'NAME') ?? getChildText(node, 'PAYEE') ?? getChildText(node, 'MEMO') ?? 'Transaction';
    const memo = getChildText(node, 'MEMO');

    transactions.push({
      fitId,
      postedAt,
      amount,
      name,
      memo: memo ?? undefined,
    });
  }

  return transactions;
}

function extractOfxBody(content: string): string {
  const index = content.toUpperCase().indexOf('<OFX');
  if (index === -1) {
    throw new Error('The OFX payload does not contain an <OFX> root element.');
  }

  return content.slice(index);
}

function parseSgml(input: string): OfxNode {
  const sanitized = input.replace(/\r/g, '');
  const root: OfxNode = { tag: 'ROOT', text: '', children: [] };
  const stack: OfxNode[] = [root];
  let index = 0;

  while (index < sanitized.length) {
    const char = sanitized[index];

    if (char === '<') {
      const end = sanitized.indexOf('>', index);
      if (end === -1) {
        break;
      }

      const rawTag = sanitized.slice(index + 1, end).trim();
      index = end + 1;

      if (!rawTag) {
        continue;
      }

      if (rawTag.startsWith('!')) {
        continue;
      }

      if (rawTag.startsWith('/')) {
        const closing = rawTag.slice(1).toUpperCase();
        while (stack.length > 1) {
          const node = stack.pop()!;
          if (node.tag === closing) {
            break;
          }
        }
      } else {
        const tag = rawTag.toUpperCase();
        const node: OfxNode = { tag, text: '', children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      }
    } else {
      const nextTagIndex = sanitized.indexOf('<', index);
      const segmentEnd = nextTagIndex === -1 ? sanitized.length : nextTagIndex;
      const segment = sanitized.slice(index, segmentEnd);
      index = segmentEnd;
      const text = segment.trim();

      if (!text) {
        continue;
      }

      const current = stack[stack.length - 1];
      current.text += text;

      if (stack.length > 1) {
        const nextTagContent = nextTagIndex === -1 ? '' : readTagName(sanitized, nextTagIndex);
        if (!nextTagContent.startsWith('/')) {
          stack.pop();
        }
      }
    }
  }

  return root;
}

function readTagName(source: string, startIndex: number): string {
  const end = source.indexOf('>', startIndex);
  if (end === -1) {
    return '';
  }

  return source.slice(startIndex + 1, end).trim();
}

function collectNodes(node: OfxNode, tag: string): OfxNode[] {
  const target = tag.toUpperCase();
  const results: OfxNode[] = [];

  const stack: OfxNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.tag === target) {
      results.push(current);
    }

    for (let i = current.children.length - 1; i >= 0; i -= 1) {
      stack.push(current.children[i]);
    }
  }

  return results;
}

function getChildText(node: OfxNode, tag: string): string | null {
  const target = tag.toUpperCase();
  for (const child of node.children) {
    if (child.tag === target) {
      return child.text.trim();
    }
  }
  return null;
}

function parseOfxDate(value: string): Date | null {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 8) {
    return null;
  }

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const hour = digits.length >= 10 ? Number(digits.slice(8, 10)) : 0;
  const minute = digits.length >= 12 ? Number(digits.slice(10, 12)) : 0;
  const second = digits.length >= 14 ? Number(digits.slice(12, 14)) : 0;

  if (!isValidDateComponents(year, month, day, hour, minute, second)) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function isValidDateComponents(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }

  if (month < 1 || month > 12) {
    return false;
  }

  if (day < 1 || day > 31) {
    return false;
  }

  if (hour < 0 || hour > 23) {
    return false;
  }

  if (minute < 0 || minute > 59) {
    return false;
  }

  if (second < 0 || second > 59) {
    return false;
  }

  return true;
}

function normalizeAmount(value: string): string | null {
  const normalized = value.trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  return normalized;
}
