import { generateNanoId, slugify } from './slug.util';

describe('slugify', () => {
  it('remove acentos e normaliza para minusculas', () => {
    expect(slugify('João & Maria')).toBe('joao-maria');
  });

  it('colapsa separadores repetidos', () => {
    expect(slugify('a---b   c')).toBe('a-b-c');
  });

  it('remove hifens das pontas', () => {
    expect(slugify('  !ola!  ')).toBe('ola');
  });

  it('devolve string vazia quando nao sobra nada', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('generateNanoId', () => {
  it('gera 8 caracteres alfanumericos', () => {
    expect(generateNanoId()).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it('nao repete em 100 chamadas', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateNanoId()));
    expect(ids.size).toBe(100);
  });
});
