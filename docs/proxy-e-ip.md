# Proxy reverso e IP do cliente (M-1)

O app limita tentativas de login, redefinição e aceite de convite por IP e por e-mail. Para isso ele precisa saber qual é o IP real de quem chama, e **só o proxy na frente do app sabe**. Esta página diz o que o proxy precisa fazer e o que o app configura. Não afirma nada sobre a capacidade da VPS: o inventário (`playbook/vps.md`) vem antes.

## Variáveis do app (nomes em `app/.env.example`)

| Variável | Padrão | Significado |
|---|---|---|
| `TRUST_PROXY` | sem padrão em produção | `true` só se há proxy confiável na frente que define o cabecalho abaixo; `false` se o app é acessado direto (nenhum cabeçalho de IP vale). **Em produção (`NODE_ENV=production`) o app não inicia sem ela definida**, com mensagem que cita só o nome da variável. Fora de produção, o padrão é `false`. |
| `TRUSTED_IP_HEADER` | `x-real-ip` | Nome do cabeçalho com o IP do cliente, que **só o proxy define**. Cloudflare: `cf-connecting-ip`. Cadeia (`x-forwarded-for`): ver `TRUSTED_PROXIES`. |
| `TRUSTED_PROXIES` | vazio | Lista (vírgulas) de IPs ou CIDRs dos proxies **próprios**. Só para cabeçalhos com cadeia. Com a lista, o app usa o primeiro valor, da direita para a esquerda, que não seja um desses proxies, e ignora tudo o que está à esquerda (o cliente pode forjar). |
| `AUTH_SIGNIN_RATE_MAX` | `5` | Tentativas de login por minuto e por IP. |
| `AUTH_SIGNIN_EMAIL_MAX` | `10` | Falhas de login por (e-mail, IP) em 15 minutos. Só falhas contam; zera quando o login dá certo. |
| `AUTH_SIGNIN_EMAIL_GLOBAL_MAX` | `100` | Teto de falhas por e-mail em 15 minutos, de qualquer IP (só contra ataque distribuído). |

Regras que o app aplica ao valor do cabeçalho (`app/src/server/http/client-ip.ts`): precisa ser IPv4 ou IPv6 válido, com no máximo 512 caracteres e 16 saltos; IPv4 mapeado em IPv6 vira IPv4; IPv6 vira o prefixo /64. Sem `TRUSTED_PROXIES`, mais de um valor no cabeçalho é recusado (o primeiro seria forjável). O que não passa vira "IP desconhecido".

## O que acontece sem IP confiável

IP ausente, inválido, ambíguo ou `TRUST_PROXY=false` **não cria balde global**. O limite passa a ser do identificador da própria requisição:

- pedido de redefinição: o e-mail informado;
- redefinição por token: o token (do corpo ou do `?token=`);
- troca de senha: a sessão;
- aceite de convite: o token do convite;
- login: o e-mail (balde "sem-ip" do e-mail, 10 falhas em 15 minutos).

Quem não manda identificador não tem balde (a requisição é inválida de qualquer forma): nas rotas de login, redefinição e pedido de redefinição, sem e-mail ou token válido o app responde 400 sem consultar o Better Auth. O corpo dessas rotas precisa ser `application/json` (415 caso contrário): o Better Auth aceitaria também form-urlencoded e `text/plain`, que o app não saberia contar.

## Como o login é limitado

Só **falhas** contam, com a vaga reservada antes (sem corrida) e devolvida quando o login dá certo:

1. por IP e rota: 5 tentativas por minuto (toda tentativa conta);
2. por (e-mail, IP /64): 10 falhas em 15 minutos; quem já entrou com sucesso na conta daquele IP (marca de 30 dias) não é barrado por este balde;
3. por e-mail, de qualquer IP: 100 falhas em 15 minutos, só contra ataque distribuído.

Efeito: alguém de outro IP errando a senha do administrador gasta o próprio balde (e-mail, IP) e o próprio limite por IP, e o administrador entra normalmente. A resposta 429 é igual para conta existente e inexistente (não revela quais e-mails existem).

**Limite residual honesto:** um atacante distribuído (muitos IPs) que consiga 100 ou mais falhas em 15 minutos para o mesmo e-mail ainda pode atrasar o login daquela conta, inclusive o do administrador, por até 15 minutos. Mitigações: MFA do admin na fase 5 e banimento de IP no proxy (fail2ban ou regra do proxy). Sem IP confiável (`TRUST_PROXY=false`) todos os anônimos dividem o balde "sem-ip" do e-mail: 10 falhas travam aquele e-mail por 15 minutos para quem não tem IP conhecido; em produção prefira sempre proxy configurado. A marca "já entrou deste IP" guarda hash do e-mail e IP por 30 dias em `rate_limits` (dado pessoal; revisão de LGPD).

## O que o proxy precisa fazer

Regra geral: **sobrescrever** (não acrescentar) o cabeçalho de IP com o endereço da conexão que ele recebeu, e nunca repassar o valor que veio do cliente. O app porta `3000` não pode ficar acessível de fora: só o proxy fala com ele (rede interna do Docker ou `127.0.0.1`), senão qualquer um forja o cabeçalho.

### Nginx

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;          # sobrescreve o que o cliente mandou
    proxy_set_header X-Forwarded-For $remote_addr;    # idem, sem cadeia
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Com `TRUST_PROXY=true` e `TRUSTED_IP_HEADER=x-real-ip` (padrão).

### Caddy

```caddyfile
exemplo.com.br {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
    }
}
```

`header_up` com valor define o cabeçalho (substitui o do cliente). Mesmas variáveis do Nginx. Confira na documentação do Caddy da versão instalada antes de aplicar.

### Cloudflare (na frente do Nginx/Caddy ou do túnel)

A Cloudflare envia `CF-Connecting-IP` com o IP real. Use `TRUST_PROXY=true` e `TRUSTED_IP_HEADER=cf-connecting-ip`, e só aceite conexões vindas da Cloudflare no servidor de origem (firewall do provedor com as faixas publicadas por ela), senão o cabeçalho é forjável por quem acessa a origem direto. O túnel da Cloudflare passa por cima do firewall: veja `playbook/publicacao/cloudflare.md`.

### Cadeia de proxies

Com mais de um proxy (por exemplo Cloudflare e depois Nginx), use `TRUSTED_IP_HEADER=x-forwarded-for` e liste em `TRUSTED_PROXIES` os IPs/CIDRs dos proxies próprios que ficam entre o cliente e o app. O primeiro valor da direita que não for deles é o cliente.

## Conferência depois de configurar

1. De fora, `curl -H "X-Real-IP: 1.2.3.4" https://dominio/login` não deve mudar o IP visto pelo app (o proxy sobrescreve). Os testes `app/tests/http/rate-limit.test.ts` cobrem o lado do app; o lado do proxy só se prova no servidor.
2. Erre a senha 6 vezes seguidas do mesmo lugar: a sexta deve responder 429 (limite por IP). Em seguida, entre de outro IP com a senha certa: deve funcionar.
3. Confira que a porta do app não responde de fora.
4. `rate_limits` guarda IP e hash de e-mail (dado pessoal). A retenção está na lista da revisão de LGPD; o app remove, em lotes e de vez em quando, linhas `app:` paradas há mais de 1 hora (marcas de IP conhecido: 30 dias).
