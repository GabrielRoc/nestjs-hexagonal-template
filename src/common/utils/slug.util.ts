import { randomBytes } from 'node:crypto';

const NANO_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const NANO_ID_LENGTH = 8;
/** Maior multiplo do tamanho do alfabeto abaixo de 256 (62 * 4 = 248). */
const NANO_ID_BYTE_CEILING = 256 - (256 % NANO_ID_ALPHABET.length);

/** Converte um texto livre em slug seguro para URL, removendo acentos. */
export function slugify(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Identificador curto e aleatorio, util para desambiguar slugs em colisao.
 *
 * Usa amostragem por rejeicao: `byte % 62` sozinho favoreceria as primeiras
 * letras do alfabeto (256 % 62 = 8), entao bytes a partir de 248 sao
 * descartados e novos bytes sao sorteados ate completar o tamanho.
 */
export function generateNanoId(): string {
  let id = '';

  while (id.length < NANO_ID_LENGTH) {
    for (const byte of randomBytes(NANO_ID_LENGTH)) {
      if (byte >= NANO_ID_BYTE_CEILING) continue;
      id += NANO_ID_ALPHABET[byte % NANO_ID_ALPHABET.length];
      if (id.length === NANO_ID_LENGTH) break;
    }
  }

  return id;
}
