/** Keep modern IDs; map old string IDs to stable UUIDv5 values per employee. */
export async function legacyNoteId(employeeId: string, id: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return id;
  const namespace = 'b52b630167f548ed8d7c472d406d3fa1';
  const name = new TextEncoder().encode(employeeId + ':' + id);
  const bytes = new Uint8Array(16 + name.length);
  for (let index = 0; index < 16; index++) bytes[index] = Number.parseInt(namespace.slice(index * 2, index * 2 + 2), 16);
  bytes.set(name, 16);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)).slice(0, 16);
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
