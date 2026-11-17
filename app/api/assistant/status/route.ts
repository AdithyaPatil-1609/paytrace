/** GET /api/assistant/status — which local models are running, for the chat panel's status dot. */
import { modelStatus } from "@/lib/assistant/models";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await modelStatus(), { headers: { "Cache-Control": "no-store" } });
}
