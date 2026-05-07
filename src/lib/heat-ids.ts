import crypto from 'crypto';

export function generateSongId(anchor: string): string {
  return `KH-${crypto.createHash('sha256').update(anchor).digest('hex').slice(0, 10)}`;
}

export function generateArtistId(anchor: string): string {
  return `HA-${crypto.createHash('sha256').update(anchor).digest('hex').slice(0, 10)}`;
}

export function isSongId(id: string): boolean {
  return /^KH-[0-9a-f]{10}$/.test(id);
}

export function isArtistId(id: string): boolean {
  return /^HA-[0-9a-f]{10}$/.test(id);
}
