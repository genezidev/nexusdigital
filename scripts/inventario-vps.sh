#!/usr/bin/env bash
# Inventário Linux somente leitura, sem sudo, rede externa ou coleta de segredos.
set -u
export LC_ALL=C

have() { command -v "$1" >/dev/null 2>&1; }
section() { printf '\n## %s\n' "$1"; }
version() {
  local label="$1" line
  shift
  if have "$1"; then
    if line="$("$@" 2>&1)"; then
      line="${line%%$'\n'*}"
    else
      line="indisponivel"
    fi
    printf '%s: %s\n' "$label" "$line"
  fi
}

printf 'Inventario Linux UTC %s\n' "$(date -u '+%Y-%m-%d %H:%M')"
section "Sistema e capacidade"
if [[ -r /etc/os-release ]]; then
  awk -F= '$1=="PRETTY_NAME" || $1=="VERSION_ID" {print}' /etc/os-release
fi
printf 'Arquitetura: %s\n' "$(uname -m)"
printf 'Kernel: %s\n' "$(uname -r)"
if have nproc; then printf 'CPUs: %s\n' "$(nproc)"; fi
if have free; then free -m; fi
if have df; then df -hP / | awk 'NR>1 {printf "Raiz: %s total, %s usado, %s livre (%s)\n",$2,$3,$4,$5}'; fi

section "Versoes instaladas"
version Node node --version
version Python python3 --version
version Git git --version
version PostgreSQL-client psql --version
version Nginx nginx -v
version Caddy caddy version
version Docker docker --version
version Podman podman --version
version Dotnet dotnet --version
if have docker; then version Compose docker compose version; fi

section "Portas em escuta"
if have ss; then
  ss -H -lntu 2>/dev/null | awk '{
    addr=$5; port=addr; sub(/^.*:/,"",port)
    if (port !~ /^[0-9]+$/) next
    scope="interface"
    if (addr ~ /^127\./ || addr ~ /^\[::1\]:/) scope="loopback"
    if (addr ~ /^0\.0\.0\.0:/ || addr ~ /^\*:/ || addr ~ /^\[::\]:/) scope="geral"
    print $1,port,scope
  }' | sort -u
else
  printf 'ss indisponivel\n'
fi

section "Servicos systemd em execucao"
if have systemctl; then
  systemctl list-units --type=service --state=running --no-legend --no-pager --plain 2>/dev/null |
    awk '$1 ~ /\.service$/ {print $1}' | head -n 100
fi

section "Containers Docker locais"
if have docker; then
  socket=/var/run/docker.sock
  if [[ -n "${XDG_RUNTIME_DIR:-}" && -S "$XDG_RUNTIME_DIR/docker.sock" ]]; then
    socket="$XDG_RUNTIME_DIR/docker.sock"
  fi
  if [[ -S "$socket" && -w "$socket" ]]; then
    docker --host "unix://$socket" ps --format '{{.Names}}' 2>/dev/null | head -n 100
  else
    printf 'Socket Docker local indisponivel para este usuario\n'
  fi
fi
printf '\nFim do inventario. Acrescente dominio, tipo de ambiente e servicos a preservar.\n'
