import { createFileRoute } from "@tanstack/react-router";
import { healthResponse } from "@web/server/health";
import { sql } from "@web/server/sensors/db/index";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => healthResponse(() => sql`select 1`),
    },
  },
});
