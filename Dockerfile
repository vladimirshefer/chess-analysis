# Stage 1: Build the client
FROM node:20-alpine AS build-client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Set up the server
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server/ ./server/
COPY --from=build-client /app/client/dist ./client/dist

# Expose port
EXPOSE 3001

# Command to run the server
WORKDIR /app/server
CMD ["npm", "run", "start"]
