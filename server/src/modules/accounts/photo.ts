// Only small JPEGs produced by the browser's canvas are accepted, never SVG or remote URLs.
export function validAvatarPhoto(value: string): boolean {
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const encoded = value.slice('data:image/jpeg;base64,'.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 128 * 1024 || bytes.toString('base64') !== encoded || bytes.length < 12
    || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return false;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return false;
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      return width > 0 && width <= 512 && height > 0 && height <= 512;
    }
    if (marker === 0xda) return false;
    offset += 2 + length;
  }
  return false;
}
