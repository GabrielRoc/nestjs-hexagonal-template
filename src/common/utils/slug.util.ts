import { randomBytes } from 'node:crypto';

const NANO_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const NANO_ID_LENGTH = 8;

/** Converte um texto livre em slug seguro para URL, removendo acentos. */
export function slugify(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Identificador curto e aleatorio, util para desambiguar slugs em colisao. */
export function generateNanoId(): string {
  const bytes = randomBytes(NANO_ID_LENGTH);
  return Array.from(
    bytes,
    (b) => NANO_ID_ALPHABET[b % NANO_ID_ALPHABET.length],
  ).join('');
}
