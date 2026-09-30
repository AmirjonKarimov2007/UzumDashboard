// The public nginx configuration sends `/api/*` to NestJS. Re-export the
// allow-listed Uzum CDN proxy on a web-owned path so product images keep working
// in production as well as in local development.
export { GET, runtime } from "../api/product-image/route";
