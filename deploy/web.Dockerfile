# syntax=docker/dockerfile:1
FROM nginx:stable-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/start.sh /usr/local/bin/stickit-nginx-start
COPY --chown=nginx:nginx dist/ /srv/stickerboard/
USER nginx
EXPOSE 8080
STOPSIGNAL SIGQUIT
# Generate the optional trusted-proxy configuration in the writable tmpfs.
ENTRYPOINT ["/bin/sh", "/usr/local/bin/stickit-nginx-start"]
