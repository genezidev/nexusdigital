import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_HOSTS, effectiveMediaHosts, hostMatches, isValidMediaHostEntry, serviceLabel, validateMediaLink } from "@/server/domain/media-link";

const ok = (raw: string, extra: string[] = []) => {
  const r = validateMediaLink(raw, extra);
  if (!r.ok) throw new Error(`esperava aceitar ${raw}: ${r.reason}`);
  return r;
};
const reason = (raw: unknown, extra: string[] = []) => {
  const r = validateMediaLink(raw, extra);
  return r.ok ? "ACEITO" : r.reason;
};

describe("validateMediaLink: aceita", () => {
  it.each(DEFAULT_MEDIA_HOSTS.map((h) => [h]))("host padrao %s", (host) => {
    expect(ok(`https://${host}/qualquer/caminho?x=1`).host).toBe(host);
  });

  it("subdominio exato de um permitido", () => {
    expect(ok("https://a.b.drive.google.com/x").host).toBe("a.b.drive.google.com");
    expect(ok("https://m.youtube.com/watch?v=abc").host).toBe("m.youtube.com");
  });

  it("normaliza: host em minusculas, porta 443 sai, fragmento vazio sai", () => {
    expect(ok("HTTPS://DRIVE.Google.COM:443/file/d/ABC/view#").href).toBe("https://drive.google.com/file/d/ABC/view");
    expect(ok("https://youtu.be/AbC#t=10").href).toBe("https://youtu.be/AbC#t=10");
  });

  it("aceita extra configurado e continua exigindo ponto", () => {
    expect(reason("https://arquivos.exemplo.com.br/a")).toBe("DOMAIN_NOT_ALLOWED");
    expect(ok("https://arquivos.exemplo.com.br/a", ["exemplo.com.br"]).host).toBe("arquivos.exemplo.com.br");
    expect(reason("https://outroexemplo.com.br/a", ["exemplo.com.br"])).toBe("DOMAIN_NOT_ALLOWED");
  });
});

describe("validateMediaLink: recusa", () => {
  it.each([
    ["javascript:alert(1)", "NOT_HTTPS"],
    ["JaVaScRiPt:alert(1)", "NOT_HTTPS"],
    ["data:text/html;base64,PHNjcmlwdD4=", "NOT_HTTPS"],
    ["file:///etc/passwd", "NOT_HTTPS"],
    ["http://drive.google.com/x", "NOT_HTTPS"],
    ["//drive.google.com/x", "NOT_HTTPS"],
    ["drive.google.com/x", "NOT_HTTPS"],
    ["ftp://drive.google.com/x", "NOT_HTTPS"],
    ["https:drive.google.com/x", "NOT_HTTPS"],
    ["https:/drive.google.com/x", "NOT_HTTPS"],
  ])("esquema %s", (raw, expected) => expect(reason(raw)).toBe(expected));

  it.each([
    ["https://user@drive.google.com/x", "CREDENTIALS"],
    ["https://user:pass@drive.google.com/x", "CREDENTIALS"],
    ["https://drive.google.com@evil.com/x", "CREDENTIALS"],
    ["https://drive.google.com:443@evil.com/x", "CREDENTIALS"],
    ["https://:@drive.google.com/x", "ACEITO_OU_CREDENCIAL"],
  ])("userinfo %s", (raw, expected) => {
    const r = reason(raw);
    if (expected === "ACEITO_OU_CREDENCIAL") expect(["CREDENTIALS", "ACEITO"]).toContain(r);
    else expect(r).toBe(expected);
  });

  it.each([
    ["https://drive.google.com:8443/x", "PORT"],
    ["https://drive.google.com:80/x", "PORT"],
    ["https://drive.google.com:0/x", "PORT"],
  ])("porta %s", (raw, expected) => expect(reason(raw)).toBe(expected));

  it.each([
    "https://127.0.0.1/x",
    "https://10.0.0.5/x",
    "https://192.168.1.1/x",
    "https://169.254.169.254/latest/meta-data",
    "https://2130706433/x",
    "https://0x7f.1/x",
    "https://0177.0.0.1/x",
    "https://[::1]/x",
    "https://[::ffff:127.0.0.1]/x",
    "https://[2001:db8::1]/x",
  ])("IP literal %s", (raw) => expect(reason(raw)).toBe("IP_LITERAL"));

  it.each([
    "https://localhost/x",
    "https://LOCALHOST/x",
    "https://intranet/x",
    "https://servidor.local/x",
    "https://api.internal/x",
    "https://app.localhost/x",
  ])("host interno %s", (raw) => expect(reason(raw)).toBe("INTERNAL_HOST"));

  it("localhost com ponto final nao vira atalho", () => {
    expect(reason("https://localhost./x")).not.toBe("ACEITO");
    expect(reason("https://drive.google.com./x")).not.toBe("ACEITO");
  });

  it.each([
    "https://xn--drve-google-9db.com/x",
    "https://xn--80ak6aa92e.com/x",
    "https://drive.google.com.xn--p1ai/x",
    "https://www.xn--youtube-0ya.com/x",
    "https://dríve.google.com/x",
    "https://drive.gооgle.com/x", // letras cirilicas parecidas
    "https://drive.google.ｃｏｍ/x", // largura total
  ])("punycode/IDN %s", (raw) => expect(reason(raw)).toBe("PUNYCODE"));

  it("IDN com letra acentuada vira punycode e e recusado como PUNYCODE", () => {
    expect(reason("https://dríve.google.com/x")).toBe("PUNYCODE");
  });

  it.each([
    "https://evil-drive.google.com.attacker.com/x",
    "https://drive.google.com.attacker.com/x",
    "https://notdrive.google.com/x",
    "https://xdrive.google.com/x",
    "https://google.com/x",
    "https://youtube.com.br/x",
    "https://myyoutu.be/x",
    "https://youtu.be.evil.io/x",
    "https://evil.com/?u=https://drive.google.com/x",
    "https://evil.com/drive.google.com",
    "https://vimeo.com.evil.com/x",
    "https://dropbox.co/x",
  ])("host parecido %s", (raw) => expect(reason(raw)).toBe("DOMAIN_NOT_ALLOWED"));

  it("barra invertida em qualquer ponto", () => {
    expect(reason("https://drive.google.com\\@evil.com/x")).toBe("BACKSLASH");
    expect(reason("https://evil.com\\.drive.google.com/x")).toBe("BACKSLASH");
    expect(reason("https://drive.google.com/a\\b")).toBe("BACKSLASH");
    expect(reason("https:\\\\drive.google.com/x")).toBe("BACKSLASH");
  });

  it.each([
    ["https://drive.google.com/a b"],
    [" https://drive.google.com/x"],
    ["https://drive.google.com/x "],
    ["https://drive.google.com/\tx"],
    ["https://drive.google.com/\nx"],
    ["https://drive.google.com/\rx"],
    ["https://drive.google.com/\u0000x"],
    ["https://drive.google.com/\u007fx"],
    ["https://drive.google.com/\u0085x"],
    ["https://drive.google.com/\u00a0x"],
    ["https://drive.google.com/\u200bx"],
    ["https://drive.google.com/\u202ex"],
    ["https://drive.google.com/\u2066x"],
    ["https://drive.google.com/\ufeffx"],
    ["https://drive.google.com/\u2028x"],
  ])("caractere de controle ou invisivel %j", (raw) => expect(reason(raw)).toBe("BAD_CHARACTERS"));

  it("tamanho: 2048 passa, 2049 nao", () => {
    const prefix = "https://drive.google.com/";
    expect(validateMediaLink(prefix + "a".repeat(2048 - prefix.length)).ok).toBe(true);
    expect(reason(prefix + "a".repeat(2049 - prefix.length))).toBe("TOO_LONG");
  });

  it.each([[""], [undefined], [null], [123], [{}], [["https://drive.google.com/x"]]])("vazio ou nao texto %j", (raw) => expect(reason(raw)).toBe("EMPTY"));

  it("URL sem host ou quebrada", () => {
    expect(["INVALID_URL", "NOT_HTTPS"]).toContain(reason("https://"));
    expect(reason("https:///x")).not.toBe("ACEITO");
    expect(reason("https://exa mple.com")).toBe("BAD_CHARACTERS");
    expect(reason("https://drive.google.com%2f@evil.com/")).not.toBe("ACEITO");
  });

  it("o cabecalho Host injetado por %0d%0a nao chega: controle literal e recusado", () => {
    expect(reason("https://drive.google.com/x\r\nHost: evil.com")).toBe("BAD_CHARACTERS");
  });
});

describe("lista de hosts", () => {
  it("hostMatches exige igualdade ou ponto antes do dominio", () => {
    const list = ["drive.google.com"];
    expect(hostMatches("drive.google.com", list)).toBe(true);
    expect(hostMatches("a.drive.google.com", list)).toBe(true);
    expect(hostMatches("notdrive.google.com", list)).toBe(false);
    expect(hostMatches("evil-drive.google.com.attacker.com", list)).toBe(false);
    expect(hostMatches("drive.google.com.attacker.com", list)).toBe(false);
  });

  it("entradas de configuracao invalidas sao ignoradas", () => {
    expect(isValidMediaHostEntry("exemplo.com.br")).toBe(true);
    for (const bad of ["", "com", "https://exemplo.com", "exemplo.com/x", "exemplo.com:443", "*.exemplo.com", "Exemplo.com", "127.0.0.1", "x.local", "xn--abc.com", "-a.com", "exemplo..com"]) {
      expect(isValidMediaHostEntry(bad)).toBe(false);
    }
    expect(effectiveMediaHosts(["exemplo.com.br", "https://ruim.com", "localhost"])).toEqual([...DEFAULT_MEDIA_HOSTS, "exemplo.com.br"]);
  });

  it("serviceLabel mostra o nome do servico e, se for outro, o proprio host", () => {
    expect(serviceLabel("drive.google.com")).toBe("Google Drive");
    expect(serviceLabel("www.youtube.com")).toBe("YouTube");
    expect(serviceLabel("1drv.ms")).toBe("OneDrive");
    expect(serviceLabel("arquivos.exemplo.com.br")).toBe("arquivos.exemplo.com.br");
  });
});
