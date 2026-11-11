# syntax=docker/dockerfile:1
FROM nginx:stable-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx dist/ /srv/stickerboard/
USER nginx
EXPOSE 8080
STOPSIGNAL SIGQUIT
# Bypass entrypoint scripts: configuration and root filesystem are read-only.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
