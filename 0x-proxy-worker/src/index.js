export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "Content-Type,0x-api-key",
          "access-control-max-age": "86400",
        },
      });
    }

    const inUrl = new URL(request.url);

    // 👇 usa Allowance-Holder v2 (en vez de permit2)
    const target = new URL("https://api.0x.org/swap/allowance-holder/quote");
    for (const [k, v] of inUrl.searchParams) target.searchParams.set(k, v);

    const headers = new Headers();
    headers.set("accept", "application/json");
    headers.set("0x-version", "v2");
    if (env.ZEROX_API_KEY) headers.set("0x-api-key", env.ZEROX_API_KEY);

    const res = await fetch(target.toString(), { method: "GET", headers });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "Content-Type,0x-api-key",
      },
    });
  },
};