/**
 * Reads a small JSON body with a hard size limit, so no route reads a large
 * body into memory. The declared length is checked before reading, and the
 * real length after, because a client can lie about Content-Length.
 */
export type JsonBody = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBody> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > maxBytes) return { ok: false, status: 413, error: "Request too large" };
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes) return { ok: false, status: 413, error: "Request too large" };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: "Send valid JSON" };
  }
}
