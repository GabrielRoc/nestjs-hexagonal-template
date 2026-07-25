/**
 * Nomes dos campos de controle e chaves de metadata do modulo anti-bot.
 *
 * Ficam TODOS aqui porque os campos sao lidos pelos guards e removidos pelo
 * BodySanitizerInterceptor: com o nome repetido em dois arquivos, renomear um
 * campo e esquecer o outro faz o campo de controle vazar para o DTO, para o
 * audit log e para o dominio, sem quebrar nenhum teste. Um teste em
 * body-sanitizer.interceptor.spec.ts garante que a lista de remocao cobre todos.
 */

/**
 * Campo isca. Fica escondido no formulario (CSS, nunca `type="hidden"`, que
 * alguns bots ignoram); navegador de gente envia vazio, bot que preenche tudo
 * envia com valor. O nome precisa parecer legitimo — `website` e um campo comum
 * o suficiente para o bot querer preencher.
 */
export const HONEYPOT_FIELD = 'website';

/** Timestamp (ms) da renderizacao do formulario, colocado pelo frontend. */
export const TIMESTAMP_FIELD = '_t';

/** Nome fixado pelo widget da Cloudflare; nao pode ser trocado. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

/** Resposta do desafio (pergunta/segredo do recurso protegido). */
export const CHALLENGE_ANSWER_FIELD = '_challenge_answer';

/** Header do form token de uso unico emitido por GET /v1/anti-bot/form-token. */
export const FORM_TOKEN_HEADER = 'x-form-token';

/**
 * Campos de controle que o BodySanitizerInterceptor remove do corpo antes do
 * ZodValidationPipe e do handler. Mantenha em sincronia com os campos acima.
 */
export const ANTI_BOT_BODY_FIELDS = [
  HONEYPOT_FIELD,
  TIMESTAMP_FIELD,
  TURNSTILE_FIELD,
  CHALLENGE_ANSWER_FIELD,
] as const;

/**
 * Metadata com o nome do parametro de rota que identifica o recurso protegido
 * por desafio (ex.: `'slug'` em `POST /v1/things/:slug/messages`). Sem ela o
 * ChallengeGuard nao tem o que resolver e passa direto.
 */
export const ANTI_BOT_CHALLENGE_PARAM_KEY = 'antiBotChallengeParam';
