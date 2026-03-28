FROM node:22-alpine

WORKDIR /app

COPY dashboard.js .

EXPOSE 3080

CMD ["node", "dashboard.js"]
