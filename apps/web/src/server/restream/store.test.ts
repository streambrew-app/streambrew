import {
  RestreamDestinationIdSchema,
  RestreamIngestKeySchema,
} from "@streambrew/packages/restream.js";
import { UserIdSchema } from "@streambrew/packages/schemas.js";
import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";

import { CredentialCipher } from "./credential-cipher.js";
import { RestreamDestinationLimitError, RestreamStore } from "./store.js";

type Query = { text: string; values: unknown[] };

function createSqlMock(handle: (query: Query) => unknown[]) {
  const queries: Query[] = [];
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = { text: strings.join(" ? ").replace(/\s+/g, " ").trim(), values };
    queries.push(query);
    return Promise.resolve(handle(query));
  };
  const begin = vi.fn(async (run: (transaction: typeof tag) => Promise<unknown>) => await run(tag));
  return { sql: Object.assign(tag, { begin }) as never as Sql, queries };
}

const userId = UserIdSchema.parse(7);
const destinationId = "02c45e23-ccdd-4fec-9926-cba06a1b68f7";
const sessionId = "8ddf5b1b-e236-49a7-a666-502ee8671f7e";
const ingestKey = RestreamIngestKeySchema.parse(`sb_${"a".repeat(43)}`);

function testCipher() {
  return new CredentialCipher("test-restream-credential-secret-32-characters");
}

describe("RestreamStore", () => {
  it("returns browser configuration without destination credentials", async () => {
    const cipher = testCipher();
    const database = createSqlMock((query) => {
      if (query.text.startsWith("SELECT stream_key_ciphertext")) {
        return [{ streamKeyCiphertext: cipher.encrypt(ingestKey) }];
      }
      if (query.text.includes("FROM restream_destination")) {
        return [
          {
            destinationId,
            platform: "youtube",
            label: "Main YouTube",
            serverUrl: "rtmps://live.example.com/app",
            streamKeyHint: "-key",
            enabled: true,
            position: 0,
          },
        ];
      }
      return [];
    });
    const store = new RestreamStore(database.sql, cipher, "rtmp://restream.example.com:1935");

    const config = await store.config(userId);

    expect(config.ingest?.streamKey).toBe(ingestKey);
    expect(config.destinations[0]).toMatchObject({ streamKeyHint: "-key" });
    expect(JSON.stringify(config)).not.toContain("destination-key");
  });

  it("serializes destination creation and enforces the product limit", async () => {
    const database = createSqlMock((query) =>
      query.text.startsWith("SELECT count(*)::int") ? [{ count: 3 }] : [],
    );
    const store = new RestreamStore(database.sql, testCipher(), "rtmp://restream.example.com:1935");

    await expect(
      store.createDestination(userId, {
        platform: "youtube",
        label: "Main YouTube",
        serverUrl: "rtmps://live.example.com/app",
        streamKey: "destination-key",
      }),
    ).rejects.toBeInstanceOf(RestreamDestinationLimitError);
    expect(database.queries[0]?.text).toContain("FOR UPDATE");
    expect(database.queries.some(({ text }) => text.startsWith("INSERT"))).toBe(false);
  });

  it("compacts remaining destination positions one row at a time from the lowest", async () => {
    const second = "a1d6f1c4-34c3-4f0e-9f61-1f3c4a3b1c2d";
    const third = "b2e7a2d5-45d4-4a1f-8a72-2a4d5b4c2d3e";
    const database = createSqlMock((query) => {
      if (query.text.startsWith("DELETE FROM restream_destination")) return [{ destinationId }];
      if (query.text.startsWith('SELECT restream_destination_id AS destination_id, "position"')) {
        return [
          { destinationId: second, position: 1 },
          { destinationId: third, position: 2 },
        ];
      }
      return [];
    });
    const store = new RestreamStore(database.sql, testCipher(), "rtmp://restream.example.com:1935");

    await store.deleteDestination(userId, RestreamDestinationIdSchema.parse(destinationId));

    const updates = database.queries.filter(({ text }) => text.startsWith("UPDATE"));
    expect(updates.map(({ values }) => values)).toEqual([
      [0, second],
      [1, third],
    ]);
    expect(updates.every(({ text }) => !text.includes('"position" +'))).toBe(true);
  });

  it("decrypts destination credentials only while authorizing an active publisher", async () => {
    const cipher = testCipher();
    const database = createSqlMock((query) => {
      if (query.text.startsWith("SELECT user_id FROM restream_ingest")) return [{ userId }];
      if (query.text.includes("FROM restream_destination") && query.text.includes("AND enabled")) {
        return [
          {
            destinationId,
            serverUrl: "rtmps://live.example.com/app",
            streamKeyCiphertext: cipher.encrypt("destination-key"),
          },
        ];
      }
      if (query.text.startsWith("INSERT INTO restream_session (")) return [{ sessionId }];
      return [];
    });
    const store = new RestreamStore(database.sql, cipher, "rtmp://restream.example.com:1935");

    await expect(store.authorizePublisher("fsn1-1", "publisher-1", ingestKey)).resolves.toEqual({
      sessionId,
      destinations: [{ destinationId, targetUrl: "rtmps://live.example.com/app#destination-key" }],
    });
    expect(database.queries.some(({ text }) => text.includes("stream_key_ciphertext"))).toBe(true);
  });
});
