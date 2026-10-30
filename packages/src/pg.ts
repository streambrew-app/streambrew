import jsonBigint from "json-bigint";
import postgres from "postgres";

const JSONB_OID = 3802;
const jsonParser = jsonBigint({ storeAsString: true });

export function parseJsonb(value: string) {
  const parsed: unknown = jsonParser.parse(value);
  return parsed;
}

/** Returns the constraint a PostgreSQL error reports as violated, if any. */
export function violatedConstraint(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("constraint_name" in error)) return undefined;
  return typeof error.constraint_name === "string" ? error.constraint_name : undefined;
}

export function createSql(url: string, options: { readonly searchPath?: string } = {}) {
  return postgres(url, {
    max: 10,
    connection: options.searchPath === undefined ? {} : { search_path: options.searchPath },
    transform: postgres.camel,
    types: {
      // Int64 in JSONB does not fit into JS number.
      // That's why we convert them to strings.
      jsonb: {
        from: [JSONB_OID],
        to: JSONB_OID,
        serialize: JSON.stringify,
        parse: parseJsonb,
      },
    },
  });
}
