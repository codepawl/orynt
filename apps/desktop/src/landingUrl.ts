const defaultLandingUrl = "http://127.0.0.1:5173/";

export function getLandingUrl() {
  return import.meta.env.VITE_ORYNT_LANDING_URL ?? defaultLandingUrl;
}
