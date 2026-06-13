import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext → Cloudflare Workers adapter. Default config: no ISR/edge-cache
// needs (all state lives in Supabase + the Cloudflare Realtime SFU). Deployed
// at translator.sundaysuite.app.
export default defineCloudflareConfig();
