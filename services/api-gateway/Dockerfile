FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build || true

EXPOSE 8000

# For development, we'll use ts-node-dev if available, or just node
CMD ["npm", "run", "dev"]
