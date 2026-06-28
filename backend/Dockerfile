FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y \
    build-essential cmake git \
    libboost-system-dev libboost-dev \
    libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN cmake -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --parallel $(nproc)

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    libboost-system-dev libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/build/raft_sim .

EXPOSE 8080
CMD ["./raft_sim"]
