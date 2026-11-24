"""Valida a configuração e roda as checagens autorizadas sob demanda."""
import argparse
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def config():
    raw = json.loads((ROOT / "quality" / "checks.json").read_text(encoding="utf-8-sig"))
    items = raw.get("checks") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        raise ValueError("checks precisa ser uma lista")
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Cada check precisa ser um objeto")
        name, args = item.get("nome"), item.get("args")
        cwd = item.get("diretorio", ".")
        timeout = item.get("timeout", 120)
        if not isinstance(name, str) or not name.strip() or name in seen:
            raise ValueError("Cada check precisa de nome único")
        if not isinstance(args, list) or not args or not all(isinstance(v, str) and v and "\x00" not in v for v in args):
            raise ValueError(f"{name}: use uma lista de argumentos não vazios")
        if not isinstance(cwd, str) or Path(cwd).is_absolute():
            raise ValueError(f"{name}: use diretório relativo ao projeto")
        path = (ROOT / cwd).resolve()
        if (ROOT not in path.parents and path != ROOT) or not path.is_dir():
            raise ValueError(f"{name}: diretório ausente ou fora do projeto")
        if type(timeout) is not int or not 1 <= timeout <= 3600:
            raise ValueError(f"{name}: timeout inteiro de 1 a 3600 segundos")
        seen.add(name)
        yield name, args, path, timeout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executar", action="store_true")
    args = parser.parse_args()
    required = ("AGENTS.md", "CLAUDE.md", "contexto/PROJETO.md", "contexto/HANDOFF.md")
    if any(not (ROOT / file).is_file() for file in required):
        parser.exit(1, "Arquivos de contexto ausentes\n")
    try:
        checks = list(config())
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Configuração válida. {len(checks)} checagens de aplicação configuradas.", flush=True)
    failed = False
    for name, command, directory, timeout in checks:
        if not args.executar:
            print(f"Disponível: {name}")
            continue
        executable = shutil.which(command[0])
        if not executable or Path(executable).suffix.lower() in {".bat", ".cmd"}:
            print(f"ERRO {name}: indique um executável direto. Para npm no Windows, use node com o caminho do CLI local do teste.")
            failed = True
            continue
        try:
            result = subprocess.run([executable, *command[1:]], cwd=directory, timeout=timeout, check=False)
            print(f"{'OK' if result.returncode == 0 else 'FALHOU'} {name} ({result.returncode})", flush=True)
            failed |= result.returncode != 0
        except (OSError, subprocess.TimeoutExpired) as error:
            print(f"ERRO {name}: {error}", flush=True)
            failed = True
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
