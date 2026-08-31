# ---------- Stage 1: build the frontend ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install frontend deps and build the SPA.
# --include=dev is explicit: the build needs typescript/vite/@types, which npm
# would skip if NODE_ENV=production leaked into this stage.
COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend install --include=dev
COPY frontend ./frontend
RUN npm --prefix frontend run build

# ---------- Stage 2: runtime (backend + built frontend) ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Backend production deps only
COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev

# Backend source
COPY backend ./backend

# Built frontend from stage 1 (server.js serves ../../frontend/dist)
COPY --from=build /app/frontend/dist ./frontend/dist

# Data lives in cloud Postgres (set DATABASE_URL at runtime) — no volume needed.
EXPOSE 4000
CMD ["node", "backend/src/server.js"]
