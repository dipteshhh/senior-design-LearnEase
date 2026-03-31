import type { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/server/apiProxy";
import { buildBackendApiPath } from "@/lib/server/backendApiPath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const upstreamPath = buildBackendApiPath(path);
  return proxyRequest(request, upstreamPath);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
