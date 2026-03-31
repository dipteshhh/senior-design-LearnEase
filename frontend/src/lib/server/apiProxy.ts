import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "./backendApi";

const REQUEST_HEADERS_TO_SKIP = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "transfer-encoding",
]);

const RESPONSE_HEADERS_TO_SKIP = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "set-cookie",
  "transfer-encoding",
]);

function normalizeUpstreamPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUpstreamUrl(path: string, search: string): string {
  return `${getBackendApiBaseUrl()}${normalizeUpstreamPath(path)}${search}`;
}

function buildUpstreamHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);

  for (const header of REQUEST_HEADERS_TO_SKIP) {
    headers.delete(header);
  }

  const requestHost = request.headers.get("host");
  if (requestHost) {
    headers.set("x-forwarded-host", requestHost);
  }
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(/:$/, ""));

  return headers;
}

function hasRequestBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

async function readRequestBody(request: NextRequest): Promise<ArrayBuffer | undefined> {
  if (!hasRequestBody(request.method)) {
    return undefined;
  }

  const body = await request.arrayBuffer();
  return body.byteLength > 0 ? body : undefined;
}

function getSetCookieValues(headers: Headers): string[] {
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof extendedHeaders.getSetCookie === "function") {
    const values = extendedHeaders.getSetCookie();
    if (values.length > 0) {
      return values;
    }
  }

  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

function buildDownstreamHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers();

  upstreamHeaders.forEach((value, key) => {
    if (RESPONSE_HEADERS_TO_SKIP.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });

  for (const setCookie of getSetCookieValues(upstreamHeaders)) {
    headers.append("set-cookie", setCookie);
  }

  return headers;
}

export async function proxyRequest(request: NextRequest, upstreamPath: string): Promise<Response> {
  const upstreamUrl = buildUpstreamUrl(upstreamPath, request.nextUrl.search);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request),
      body: await readRequestBody(request),
      redirect: "manual",
      cache: "no-store",
    });

    const responseHeaders = buildDownstreamHeaders(upstreamResponse.headers);
    const responseBody = await upstreamResponse.arrayBuffer();

    return new Response(responseBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_PROXY_FAILED",
          message: "Backend service is unavailable.",
          details: {
            reason: error instanceof Error ? error.message : "Unknown proxy error.",
          },
        },
      },
      { status: 502 }
    );
  }
}
