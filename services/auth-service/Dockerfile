FROM node:18-alpine

# Install build dependencies for bcrypt
RUN apk add --no-cache make gcc g++ python3

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build || true

EXPOSE 8001

CMD ["npm", "run", "dev"]
