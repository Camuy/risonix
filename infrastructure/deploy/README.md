# Risonix sulla VPS Trinode (`resonix.trinode.ee`)

Risonix gira sulla VPS **Trinode** (`2.28.4.101`) come **progetto Compose
separato** (`risonix`), accanto allo stack `trinode`. Il proxy pubblico resta
quello di Trinode (`trinode-caddy`, porte 80/443); Risonix non pubblica nulla
sull'host. Il Caddy di Trinode lo raggiunge sulla rete Docker condivisa
`trinode_edge` con l'alias `resonix`.

```
browser ──443──▶ trinode-caddy ──trinode_edge──▶ resonix (nginx:80)
                                                   ├── /      → mri-frontend-prod:3000
                                                   └── /api/  → mri-api:8000
```

## File

| File | Ruolo |
|---|---|
| `compose.trinode.yml` | override del `compose.yaml` base: rete `trinode_edge`, alias `resonix`, niente porte host, build same-origin |
| `resonix.trinode.caddy` | vhost da aggiungere al `Caddyfile.prod` di Trinode |

## Messa in linea (sulla VPS, come root)

```sh
# 1. Codice (master)
git clone https://github.com/Camuy/risonix.git /opt/risonix
cd /opt/risonix

# 2. Configurazione
cp .env.example .env
# impostare in .env:
#   COMPOSE_PROFILES=prod
#   MRI_ENV=production
#   MRI_LOG_FORMAT=json
#   MRI_BIND_ADDR=127.0.0.1      # nessun servizio esposto in chiaro
#   (MRI_API_PUBLIC_URL non serve: la SPA è compilata same-origin)

# 3. Build e avvio (solo profilo `prod`: frontend + api + nginx)
docker compose -f compose.yaml -f infrastructure/deploy/compose.trinode.yml \
  --profile prod up -d --build

# 4. Verifica interna
docker exec resonix-nginx wget -qO- http://localhost/healthz
```

## Vhost Caddy (lato Trinode)

Il contenuto di `resonix.trinode.caddy` va in coda a
`/opt/trinode/infra/caddy/Caddyfile.prod`, poi si valida e si riavvia il proxy:

```sh
cd /opt/trinode/infra/caddy
cp Caddyfile.prod Caddyfile.prod.bak-$(date +%Y%m%d-%H%M%S)

# validazione con la configurazione live (env e import risolti nel container)
docker cp Caddyfile.prod trinode-caddy:/etc/caddy/Caddyfile.new
docker exec trinode-caddy caddy validate --config /etc/caddy/Caddyfile.new

# il Caddyfile è montato come FILE singolo: la ricarica deve rifare il mount
docker restart trinode-caddy
docker logs --tail=50 trinode-caddy    # attendere "certificate obtained"
```

`resonix.trinode.ee` deve già puntare all'IP della VPS (record `A`), altrimenti
la validazione ACME fallisce.

## Aggiornamento

```sh
cd /opt/risonix && git pull
docker compose -f compose.yaml -f infrastructure/deploy/compose.trinode.yml \
  --profile prod up -d --build
```

## Note

- **Memoria**: il profilo `prod` occupa ~1.9 GB di limite (API 1.5 GB, frontend
  256 MB, nginx 128 MB). Non attivare `--profile ai`/`dicom` su questa VPS:
  PyTorch (4 GB) e Orthanc non ci stanno accanto a Trinode.
- **Proxy trappola inode**: il `Caddyfile.prod` è montato come file singolo; dopo
  una modifica serve `docker restart trinode-caddy` (non basta `caddy reload`).
- **Persistenza**: i dati dell'API stanno in `/opt/risonix/data` (bind `./data`).
