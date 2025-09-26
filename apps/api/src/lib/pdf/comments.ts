export function appendPdfComment(
  pdfBytes: Uint8Array,
  comment: string,
  encoding: BufferEncoding = 'utf8'
): Uint8Array {
  const normalizedComment = comment.endsWith('\n') ? comment : `${comment}\n`;
  const commentBuffer = encoding === 'latin1'
    ? latin1Buffer(normalizedComment)
    : Buffer.from(normalizedComment, encoding);
  const original = Buffer.from(pdfBytes);
  const eofMarker = Buffer.from('%%EOF', 'utf8');

  const eofIndex = original.lastIndexOf(eofMarker);
  if (eofIndex === -1) {
    return Uint8Array.from(Buffer.concat([original, Buffer.from('\n'), commentBuffer]));
  }

  const beforeEof = original.subarray(0, eofIndex);
  const afterEof = original.subarray(eofIndex);

  return Uint8Array.from(Buffer.concat([beforeEof, Buffer.from('\n'), commentBuffer, afterEof]));
}

function latin1Buffer(value: string): Buffer {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return Buffer.from(bytes);
}
