# Public entry point for PaaS deploys (Render, Railway). Same routes as deploy/nginx.conf; only the
# upstream hostnames differ, because each platform gives every private service its own hostname.
# Build context: repo root.
FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/nginx.conf.in
# ponytail: onnx-service is not deployed on PaaS (ML guards off), so its upstream points nowhere
# unless ONNX_HOST is set; add the service and set ONNX_HOST to turn the ML guards on.
CMD sed -e "s|server controlnet:8000;|server ${CONTROLNET_HOST}:8000;|" \
        -e "s|server web:8080;|server ${WEB_HOST}:8080;|" \
        -e "s|server onnx-service:8002;|server ${ONNX_HOST:-127.0.0.1}:8002;|" \
        -e "s|server nango-server:|server ${NANGO_HOSTNAME}:|" \
        -e "s|listen 80 default_server;|listen ${PORT:-80} default_server;|" \
        /etc/nginx/nginx.conf.in > /etc/nginx/nginx.conf \
    && exec nginx -g 'daemon off;'
