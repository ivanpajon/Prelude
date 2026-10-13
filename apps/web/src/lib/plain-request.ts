/**
 * Next.js passes route handlers a Proxy of the request. oRPC's BodyLimitPlugin copies requests
 * with `new Request(request, init)`, which cannot read a Proxy's private fields.
 */
export function plainRequest(request: Request) {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
    // Node requires `duplex` for stream bodies; the DOM RequestInit type does not declare it.
    duplex: "half",
  } as RequestInit);
}
