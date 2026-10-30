import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { RestreamServerUrlSchema } from "@streambrew/packages/restream.js";
import { AuthUserIdSchema, SlugSchema } from "@streambrew/packages/schemas.js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Store } from "../sensors/db/store.js";
import { CredentialCipher } from "./credential-cipher.js";
import { RestreamStore } from "./store.js";

const databaseUrl = process.env["VIDEO_INGEST_TEST_DATABASE_URL"];
const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(import.meta.resolve("../../../../../"));

describe.skipIf(!databaseUrl)("restream destinations in PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;
  let admin: ReturnType<typeof postgres>;
  let schemaName: string;
  let store: RestreamStore;

  beforeEach(async () => {
    schemaName = `restream_test_${randomUUID().replaceAll("-", "")}`;
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schemaName}`);
    const testDatabaseUrl = new URL(databaseUrl!);
    testDatabaseUrl.searchParams.set("search_path", `${schemaName},${schemaName}_auth`);
    await execFileAsync(
      resolve(repositoryRoot, "node_modules/.bin/dbmate"),
      ["--no-dump-schema", "up"],
      {
        cwd: repositoryRoot,
        env: { ...process.env, DATABASE_URL: testDatabaseUrl.toString() },
      },
    );
    sql = postgres(testDatabaseUrl.toString(), {
      transform: postgres.camel,
      onnotice: () => {},
    });
    store = new RestreamStore(
      sql,
      new CredentialCipher("test-restream-credential-secret-32-characters"),
      "rtmp://restream.example.com:1935",
    );
  });

  afterEach(async () => {
    await sql?.end();
    // This generated schema belongs only to this test, never to the application's data.
    if (schemaName) await admin.unsafe(`DROP SCHEMA ${schemaName} CASCADE`);
    if (schemaName) await admin.unsafe(`DROP SCHEMA ${schemaName}_auth CASCADE`);
    await admin?.end();
  });

  async function user() {
    await sql`INSERT INTO auth_user (id, name, email, "emailVerified") VALUES ('streamer', 'streamer', 'streamer@test.invalid', true)`;
    return await new Store(sql).getOrCreateUserId(
      AuthUserIdSchema.parse("streamer"),
      SlugSchema.parse("streamer"),
    );
  }

  async function createDestinations(userId: Awaited<ReturnType<typeof user>>, count: number) {
    const destinationIds = [];
    for (let index = 0; index < count; index += 1) {
      destinationIds.push(
        await store.createDestination(userId, {
          platform: "custom",
          label: `Destination ${index}`,
          serverUrl: RestreamServerUrlSchema.parse(`rtmps://live${index}.example.com/app`),
          streamKey: `destination-key-${index}`,
        }),
      );
    }
    return destinationIds;
  }

  async function positions(userId: Awaited<ReturnType<typeof user>>) {
    const config = await store.config(userId);
    return config.destinations.map(({ destinationId, position }) => [destinationId, position]);
  }

  it("compacts positions after deleting the first of two destinations", async () => {
    const userId = await user();
    const [first, second] = await createDestinations(userId, 2);

    await store.deleteDestination(userId, first!);

    expect(await positions(userId)).toEqual([[second, 0]]);
  });

  it.each([0, 1, 2])(
    "preserves order after deleting position %i of three destinations",
    async (deletedPosition) => {
      const userId = await user();
      const destinationIds = await createDestinations(userId, 3);

      await store.deleteDestination(userId, destinationIds[deletedPosition]!);

      expect(await positions(userId)).toEqual(
        destinationIds
          .filter((_, position) => position !== deletedPosition)
          .map((destinationId, position) => [destinationId, position]),
      );
      const [replacement] = await createDestinations(userId, 1);
      expect((await positions(userId)).at(-1)).toEqual([replacement, 2]);
    },
  );
});
