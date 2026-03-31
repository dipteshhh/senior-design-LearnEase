import type { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/server/apiProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Promise<Response> {
  return proxyRequest(request, "/health");
}
