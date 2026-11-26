# Self-hosted Nango for PaaS deploys (Render, Railway): the compose stack bind-mounts the custom
# provider templates; platforms without volumes get them baked in. Build context: repo root.
FROM nangohq/nango-server:hosted
COPY nango/providers.yaml /app/nango/packages/providers/providers.yaml
ENV FLAG_SERVE_CONNECT_UI=true PORT=3003 SERVER_PORT=3003 TELEMETRY=false NANGO_DB_SSL=false
# Browser-facing URLs live under Governly's own origin (nginx proxies /nango-api and /nango-connect).
CMD ["sh", "-c", "export NANGO_SERVER_URL=\"${NANGO_SERVER_URL:-$GOVERNLY_URL/nango-api}\" NANGO_PUBLIC_SERVER_URL=\"${NANGO_PUBLIC_SERVER_URL:-$GOVERNLY_URL/nango-api}\" NANGO_PUBLIC_CONNECT_URL=\"${NANGO_PUBLIC_CONNECT_URL:-$GOVERNLY_URL/nango-connect}\" NANGO_SECRET_KEY_DEV=\"${NANGO_SECRET_KEY_DEV:-$NANGO_SECRET_KEY}\"; exec packages/server/entrypoint.sh"]
