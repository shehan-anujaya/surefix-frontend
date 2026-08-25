FROM nginx:1.27-alpine
ENV PORT=8080
ENV GATEWAY_URL=http://localhost:8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html app.js style.css /usr/share/nginx/html/
EXPOSE 8080
