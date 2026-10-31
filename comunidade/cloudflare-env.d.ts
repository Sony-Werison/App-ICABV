declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CHURCH_OWNER_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
