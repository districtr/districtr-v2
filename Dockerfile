FROM node:20-buster

WORKDIR /app
COPY . .

RUN  npm i -g zx && npm i -g pnpm && pnpm install

EXPOSE 3000
ENV PORT 3000

CMD ["pnpm", "dev"]