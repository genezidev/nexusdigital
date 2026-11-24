"""Instala as skills e os agentes da base por projeto, preservando conflitos existentes.

Fonte dos agentes: .claude/agents/scaff-*.md (Claude Code). Os arquivos do Codex
(.codex/agents/scaff-*.toml) são gerados a partir dela com --gerar-codex.
"""
import argparse
import json
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_PATTERN = re.compile(rb'^---\r?\nname: ([a-z0-9-]+)\r?\ndescription: .+\r?\n---\r?\n')
AGENT_PATTERN = re.compile(r'^---\n(.*?)\n---\n(.*)\Z', re.S)


def normalize(content):
    return content.replace(b"\r\n", b"\n")


def agent_fields(origin):
    text = normalize(origin.read_bytes()).decode("utf-8")
    match = AGENT_PATTERN.match(text)
    if not match:
        raise ValueError(f"Frontmatter inválido em {origin}")
    fields = {}
    for line in match[1].splitlines():
        key, sep, value = line.partition(":")
        if sep and not line.startswith(" "):
            fields[key.strip()] = value.strip()
    name = fields.get("name", "")
    description = fields.get("description", "")
    if description.startswith('"') and description.endswith('"') and len(description) > 1:
        description = description[1:-1]
    body = match[2].strip()
    if name != origin.stem or not re.fullmatch(r"scaff-[a-z0-9-]+", name):
        raise ValueError(f"name precisa ser igual ao nome do arquivo em {origin}")
    if not description or '"' in description or not body or "'''" in body:
        raise ValueError(f"description ou instruções inválidas em {origin}")
    return name, description, body


def codex_toml(origin):
    """Gera o TOML do Codex só com os campos que ele aceita (o formato rejeita chaves desconhecidas)."""
    name, description, body = agent_fields(origin)
    content = (
        f"# Gerado por scripts/sincronizar_skills.py a partir de .claude/agents/{name}.md. Edite a fonte.\n"
        f"name = {json.dumps(name)}\n"
        f"description = {json.dumps(description, ensure_ascii=False)}\n"
        f"developer_instructions = '''\n{body}\n'''\n"
    )
    parsed = tomllib.loads(content)
    if parsed["developer_instructions"].strip() != body or parsed["description"] != description:
        raise ValueError(f"TOML gerado não confere com {origin}")
    return content.encode("utf-8")


def expected_files():
    skills = sorted((ROOT / ".agents" / "skills").glob("scaff-*/SKILL.md"))
    agents = sorted((ROOT / ".claude" / "agents").glob("scaff-*.md"))
    if not skills or not agents:
        raise ValueError("Skills ou agentes da base ausentes")
    files = []
    for origin in skills:
        content = origin.read_bytes()
        fields = SKILL_PATTERN.match(content)
        if not fields or fields[1].decode() != origin.parent.name:
            raise ValueError(f"Frontmatter inválido em {origin}")
        for directory in (".agents", ".claude"):
            files.append((Path(directory) / "skills" / origin.parent.name / "SKILL.md", content))
    for origin in agents:
        files.append((Path(".claude") / "agents" / origin.name, origin.read_bytes()))
        files.append((Path(".codex") / "agents" / f"{origin.stem}.toml", codex_toml(origin)))
    return files, len(skills), len(agents)


def generate_codex():
    files, _, total = expected_files()
    folder = ROOT / ".codex" / "agents"
    folder.mkdir(parents=True, exist_ok=True)
    wanted = set()
    for relative, content in files:
        if relative.parts[0] == ".codex":
            wanted.add(relative.name)
            (ROOT / relative).write_bytes(content)
    for stale in folder.glob("scaff-*.toml"):
        if stale.name not in wanted:
            stale.unlink()
    return total


def sync(project, check):
    files, skills, agents = expected_files()
    if project == ROOT:
        extra = {p.name for p in (ROOT / ".codex" / "agents").glob("scaff-*.toml")}
        extra -= {relative.name for relative, _ in files if relative.parts[0] == ".codex"}
        if extra:
            raise ValueError(f"Agentes do Codex sem fonte: {', '.join(sorted(extra))}. Rode --gerar-codex.")
    pending = []
    for relative, content in files:
        target = project / relative
        if target.exists() and normalize(target.read_bytes()) != normalize(content):
            hint = " Rode --gerar-codex." if project == ROOT and relative.parts[0] == ".codex" else ""
            raise ValueError(f"Conflito: {target}. Resolva as diferenças antes de sincronizar.{hint}")
        if not target.exists():
            pending.append((target, content))
    if check and pending:
        raise ValueError(f"Arquivos ausentes: {', '.join(str(target) for target, _ in pending)}")
    for target, content in pending:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as output:
            output.write(content)
    return skills, agents


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--projeto", type=Path, default=ROOT)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--gerar-codex", action="store_true", help="regenera .codex/agents da base a partir de .claude/agents")
    args = parser.parse_args()
    project = args.projeto.resolve()
    if not project.is_dir():
        parser.error(f"Diretório de projeto não encontrado: {project}")
    try:
        if args.gerar_codex:
            print(f"{generate_codex()} agentes do Codex gerados em .codex/agents")
            return
        skills, agents = sync(project, args.check)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(f"{skills} skills em .agents/skills e .claude/skills e {agents} agentes em .claude/agents e .codex/agents verificados: {project}")


if __name__ == "__main__":
    main()
