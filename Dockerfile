# Sitio estático servido por nginx. Igual que el resto de las apps de TD Studio.
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docs/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
