import { createTranslations, createTranslator, useI18n, type Locale } from "./i18n";

const apiErrorCodes = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

/** Copy from the caller's catalog that replaces the shared message for one code or for any other failure. */
export type ApiErrorMessages = Partial<Record<ApiErrorCode | "fallback", string>>;

const translations = createTranslations({
  badRequest: {
    en: "Check the entered values and try again.",
    ru: "Проверьте введённые данные и попробуйте ещё раз.",
  },
  unauthorized: {
    en: "Your session has expired. Sign in again.",
    ru: "Сессия истекла. Войдите снова.",
  },
  forbidden: {
    en: "You don't have permission to do this.",
    ru: "Недостаточно прав для этого действия.",
  },
  notFound: {
    en: "Not found. Refresh the page and try again.",
    ru: "Не найдено. Обновите страницу и попробуйте ещё раз.",
  },
  conflict: {
    en: "This value is already in use.",
    ru: "Это значение уже используется.",
  },
  tooManyRequests: {
    en: "Too many attempts. Wait a moment and try again.",
    ru: "Слишком много попыток. Подождите немного и попробуйте ещё раз.",
  },
  fallback: {
    en: "Couldn't save changes. Please try again.",
    ru: "Не удалось сохранить изменения. Попробуйте ещё раз.",
  },
});

const messageKeys = {
  BAD_REQUEST: "badRequest",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "notFound",
  CONFLICT: "conflict",
  TOO_MANY_REQUESTS: "tooManyRequests",
} as const satisfies Record<ApiErrorCode, keyof typeof translations>;

function apiErrorCode(error: unknown): ApiErrorCode | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const { data } = error;
  if (typeof data !== "object" || data === null || !("code" in data)) return null;
  const { code } = data;
  return apiErrorCodes.find((known) => known === code) ?? null;
}

/**
 * Localizes a failed tRPC call by its error code. Server messages are never shown: they are
 * English and may describe internals.
 */
export function apiErrorMessage(locale: Locale, error: unknown, messages: ApiErrorMessages = {}) {
  const t = createTranslator(locale, translations);
  const code = apiErrorCode(error);
  if (code === null) return messages.fallback ?? t("fallback");
  return messages[code] ?? t(messageKeys[code]);
}

export function useApiErrorMessage() {
  const { locale } = useI18n(translations);
  return (error: unknown, messages?: ApiErrorMessages) =>
    error === null || error === undefined ? null : apiErrorMessage(locale, error, messages);
}
