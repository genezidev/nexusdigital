"""Compara a versão analisada no catálogo com a release estável mais recente (GitHub ou npm).

Use antes de instalar uma ferramenta do catálogo. Só lê dados públicos: não instala nada.
Usa o `gh` autenticado quando existe; sem ele, a API pública do GitHub (limite de 60 consultas por hora).
Quando a entrada tem "Pacote npm", a versão atual vem da tag `latest` do npm, e o script avisa se ela
apontar para um pré-lançamento (já aconteceu com o Prisma).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGO = ROOT / "catalogo" / "repositorios.md"
LINK = re.compile(r"https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)")
VERSAO = re.compile(r"\bv?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.]+)?)\b")
DATA = re.compile(r"\b(20\d\d-\d\d-\d\d)\b")
NPM = re.compile(r"Pacote npm: `([^`]+)`")
PRE = re.compile(r"-(?:\d+\.)*\d*\.?(?:alpha|beta|rc|pre|canary|next|dev|nightly)", re.I)


class Limite(Exception):
    pass


def entradas(texto):
    """Uma entrada por seção ###: nome, repositório e versão/data analisadas."""
    for bloco in re.split(r"^### ", texto, flags=re.M)[1:]:
        linhas = bloco.splitlines()
        nome, repo, versao, data, npm = linhas[0].strip(), None, None, None, None
        for linha in linhas[1:]:
            if linha.startswith("## "):
                break
            if repo is None and linha.startswith("- Link"):
                achado = LINK.search(linha)
                repo = achado.group(1).removesuffix(".git") if achado else None
            if npm is None and NPM.search(linha):
                npm = NPM.search(linha).group(1)
            if "Revisão analisada" in linha:
                trecho = linha.split("Revisão analisada", 1)[1].split(" · ", 1)[0]
                trecho = re.sub(r"`[0-9a-f]{7,40}`", "", trecho)
                datas = DATA.findall(trecho)
                data = datas[0] if datas else None
                sem_datas = DATA.sub("", trecho)
                achado = VERSAO.search(sem_datas)
                versao = achado.group(1) if achado else None
        if repo:
            yield nome, repo, versao, data, npm


def consultar(caminho):
    gh = shutil.which("gh")
    if gh:
        feito = subprocess.run([gh, "api", caminho], capture_output=True, text=True,
                               encoding="utf-8", timeout=60, check=False)
        if feito.returncode == 0:
            return json.loads(feito.stdout)
        if "rate limit" in feito.stderr.lower():
            raise Limite
        return None
    pedido = urllib.request.Request(f"https://api.github.com/{caminho}",
                                    headers={"Accept": "application/vnd.github+json",
                                             "User-Agent": "conferir-versoes"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        pedido.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(pedido, timeout=60) as resposta:
            return json.load(resposta)
    except urllib.error.HTTPError as erro:
        if erro.code == 403 and erro.headers.get("X-RateLimit-Remaining") == "0":
            raise Limite from erro
        return None


def npm_latest(pacote):
    """Tag `latest` do pacote no npm (só leitura, sem instalar)."""
    url = f"https://registry.npmjs.org/-/package/{urllib.parse.quote(pacote, safe='@')}/dist-tags"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "conferir-versoes"}),
                                    timeout=60) as resposta:
            return json.load(resposta).get("latest")
    except (urllib.error.URLError, ValueError):
        return None


def numeros(versao):
    base = re.match(r"(\d+(?:\.\d+)*)", versao)
    partes = [int(n) for n in base.group(1).split(".")] if base else []
    return tuple(partes + [0] * (3 - len(partes))), versao[base.end():] if base else versao


def versao_da_tag(tag):
    achado = VERSAO.search(tag or "")
    return achado.group(1) if achado else None


def ultima_estavel(repo):
    """Release estável mais recente com número de versão na tag (ignora 'latest', pré-lançamentos e rascunhos)."""
    lista = consultar(f"repos/{repo}/releases?per_page=20") or []
    for release in lista:
        versao = versao_da_tag(release.get("tag_name"))
        if not release.get("draft") and not release.get("prerelease") and versao and not PRE.search(versao):
            return release
    return None


def comparar(analisada, atual):
    if not analisada:
        return "conferir"
    return "igual" if numeros(analisada) == numeros(versao_da_tag(atual)) else "MUDOU"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("filtro", nargs="?", default="",
                        help="parte do nome ou do repositório (ex.: trivy)")
    args = parser.parse_args()
    itens = [e for e in entradas(CATALOGO.read_text(encoding="utf-8"))
             if args.filtro.lower() in (e[0] + " " + e[1]).lower()]
    if not itens:
        parser.exit(1, "Nada no catálogo com esse filtro.\n")
    mudou = 0
    print(f"{'Repositório':45} {'Analisada':18} {'Atual':22} Situação")
    for nome, repo, versao, data, npm in itens:
        try:
            info = consultar(f"repos/{repo}")
            release = ultima_estavel(repo) if info else None
            latest = npm_latest(npm) if npm else None
        except Limite:
            print("Limite de consultas do GitHub atingido. Faça login com `gh auth login` ou tente em uma hora.")
            break
        if not info:
            print(f"{repo:45} {'':18} {'':22} não encontrado (renomeado ou removido?)")
            continue
        atual = release.get("tag_name") if release else None
        aviso = ""
        if latest and PRE.search(latest):
            aviso = f" · ATENÇÃO: `latest` do npm é pré-lançamento ({latest}); fixe a versão estável"
        elif latest:
            atual, release = latest, {"published_at": ""}
        if atual:
            situacao = comparar(versao, atual)
        else:
            atualizado = (info.get("pushed_at") or "")[:10]
            situacao = f"sem release; último envio {atualizado}"
            if data and atualizado > data:
                situacao += " (mudou desde a análise)"
        if info.get("archived"):
            situacao += " · ARQUIVADO"
        situacao += aviso
        if situacao.startswith("MUDOU"):
            mudou += 1
            if release.get("published_at"):
                situacao += f" (publicada {release['published_at'][:10]})"
        analisada = versao or data or "?"
        print(f"{repo:45} {analisada:18} {atual or '-':22} {situacao}")
    print()
    print("Antes de instalar uma versão mais nova que a do catálogo, leia as notas da versão e os avisos de "
          "segurança do repositório. Fixe o número da versão instalada; não use `latest`.")
    if mudou:
        print(f"{mudou} repositório(s) com versão diferente da analisada.")


if __name__ == "__main__":
    main()
