import { readRuntimeConfig } from "./config.js";
import { publicError } from "./errors.js";
import { KagiClient } from "./kagi-client.js";

async function main(): Promise<void> {
  const client = new KagiClient(readRuntimeConfig());
  const query = process.env.KAGI_SMOKE_QUERY?.trim() || "Kagi Search";
  const response = await client.search({
    query,
    limit: 3,
    page: 1,
    timeRange: "any",
    sort: "relevance",
    region: "no_region",
    verbatim: false,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        query: response.query,
        returned: response.returned,
        results: response.results.map(({ rank, title, url }) => ({
          rank,
          title,
          url,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const safe = publicError(error);
  console.error(`Smoke test failed (${safe.code}): ${safe.message}`);
  process.exitCode = 1;
});
