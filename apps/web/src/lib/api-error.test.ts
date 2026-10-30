import { describe, expect, it } from "vitest";

import { apiErrorMessage } from "./api-error";

function trpcError(code: string, message = "Server detail that must not be shown") {
  return Object.assign(new Error(message), { data: { code, httpStatus: 400 } });
}

describe("apiErrorMessage", () => {
  it.each([
    ["BAD_REQUEST", "en", "Check the entered values and try again."],
    ["UNAUTHORIZED", "ru", "Сессия истекла. Войдите снова."],
    ["FORBIDDEN", "en", "You don't have permission to do this."],
    ["NOT_FOUND", "ru", "Не найдено. Обновите страницу и попробуйте ещё раз."],
    ["CONFLICT", "en", "This value is already in use."],
    ["TOO_MANY_REQUESTS", "ru", "Слишком много попыток. Подождите немного и попробуйте ещё раз."],
  ] as const)("localizes %s in %s", (code, locale, expected) => {
    expect(apiErrorMessage(locale, trpcError(code))).toBe(expected);
  });

  it.each([
    ["an internal error", trpcError("INTERNAL_SERVER_ERROR")],
    ["a network failure without tRPC data", new TypeError("Failed to fetch")],
    ["a non-error value", "boom"],
  ])("falls back to a generic message for %s", (_name, error) => {
    expect(apiErrorMessage("ru", error)).toBe(
      "Не удалось сохранить изменения. Попробуйте ещё раз.",
    );
  });

  it("never exposes the server message, including Zod issue JSON", () => {
    const zodIssues = '[{"code":"too_small","minimum":1,"path":["label"]}]';
    const message = apiErrorMessage("en", trpcError("BAD_REQUEST", zodIssues));

    expect(message).not.toContain("too_small");
  });

  it("uses form-specific copy for a code or for the fallback", () => {
    const messages = { CONFLICT: "This handle is already taken.", fallback: "Couldn't save." };

    expect(apiErrorMessage("en", trpcError("CONFLICT"), messages)).toBe(
      "This handle is already taken.",
    );
    expect(apiErrorMessage("en", trpcError("NOT_FOUND"), messages)).toBe(
      "Not found. Refresh the page and try again.",
    );
    expect(apiErrorMessage("en", new TypeError("Failed to fetch"), messages)).toBe(
      "Couldn't save.",
    );
  });
});
