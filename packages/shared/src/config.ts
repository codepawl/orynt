/**
 * Single source of truth for backend API URL.
 * Works in both server and client contexts.
 */
export function getBackendApiUrl(): string {
  // Server-side (BACKEND_API_URL is not prefixed, so not exposed to client)
  if (typeof process !== "undefined" && process.env?.BACKEND_API_URL) {
    return process.env.BACKEND_API_URL;
  }
  // Client-side (NEXT_PUBLIC_ prefix exposes to browser)
  if (
    typeof process !== "undefined" &&
    process.env?.NEXT_PUBLIC_BACKEND_API_URL
  ) {
    return process.env.NEXT_PUBLIC_BACKEND_API_URL;
  }
  return "http://localhost:8000";
}
