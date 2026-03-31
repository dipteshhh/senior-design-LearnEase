export function buildBackendApiPath(pathSegments: string[]): string {
  return `/api/${pathSegments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
