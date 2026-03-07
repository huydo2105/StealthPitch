# ── StealthPitch Frontend ────────────────────────────────────────────
# Next.js production build
# ─────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# ── Build-time env vars (Next.js inlines NEXT_PUBLIC_* at build) ──
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS
ARG NEXT_PUBLIC_EXPLORER_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=$NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS
ENV NEXT_PUBLIC_EXPLORER_URL=$NEXT_PUBLIC_EXPLORER_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Production image ────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
