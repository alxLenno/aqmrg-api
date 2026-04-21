FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build || true

EXPOSE 8004

CMD ["npm", "run", "dev"]
