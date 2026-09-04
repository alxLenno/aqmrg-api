FROM grafana/grafana-oss:10.4.3

USER root

# Copy provisioning configurations and dashboards directly into image
COPY provisioning/datasources /etc/grafana/provisioning/datasources
COPY provisioning/dashboards /etc/grafana/provisioning/dashboards

# Create startup script to handle dynamic $PORT on Render/cloud hosts
RUN printf '#!/bin/sh\nif [ -n "$PORT" ]; then export GF_SERVER_HTTP_PORT="$PORT"; fi\nexec /run.sh "$@"\n' > /run-render.sh && \
    chmod +x /run-render.sh

# Environment settings for anonymous embedding
ENV GF_SECURITY_ALLOW_EMBEDDING=true \
    GF_AUTH_ANONYMOUS_ENABLED=true \
    GF_AUTH_ANONYMOUS_ORG_ROLE=Editor \
    GF_AUTH_ANONYMOUS_ORG_NAME="Main Org." \
    GF_USERS_ALLOW_SIGN_UP=false

USER grafana

EXPOSE 3000

ENTRYPOINT ["/run-render.sh"]
