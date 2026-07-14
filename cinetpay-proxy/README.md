# CinetPay Fixed-IP Proxy

Mini serveur HTTP proxy à déployer **une fois** sur une plateforme qui fournit une IP IPv4 fixe. Toutes les Edge Functions CinetPay routeront leurs requêtes à travers lui → CinetPay verra toujours **la même IP**.

## Pourquoi

Supabase Edge Functions tournent sur un pool d'IP AWS dynamiques (13.x, 35.x, 52.x…). CinetPay n'accepte pas les plages CIDR, donc impossible de whitelister. Ce proxy donne une IP unique et fixe.

## Recommandation : Fly.io (IPv4 dédiée ~$2/mois)

Fly.io propose une IPv4 dédiée pour $2/mois — la plus simple option avec IP fixe garantie.
Alternatives gratuites : Render Web Service (IP partagée mais stable), Railway (similaire).

## Déploiement Fly.io

```bash
# 1. Installer flyctl : https://fly.io/docs/hands-on/install-flyctl/
cd cinetpay-proxy
fly launch --no-deploy --copy-config --name cinetpay-proxy-<unique>
fly ips allocate-v4                                # ← alloue ton IP fixe (note-la !)
fly secrets set PROXY_TOKEN=<un-long-secret-aléatoire>
fly deploy
```

L'IP affichée par `fly ips allocate-v4` est celle à **coller dans CinetPay**.

## Configuration côté Supabase

Dans les secrets du projet (déjà créés) :
- `CINETPAY_PROXY_URL` = `https://cinetpay-proxy-<unique>.fly.dev/forward`
- `CINETPAY_PROXY_TOKEN` = la même valeur que `PROXY_TOKEN` ci-dessus

Puis appelle l'endpoint admin `cinetpay-proxy-check` pour vérifier que l'IP retournée correspond à celle allouée par Fly.

## Vérification

```bash
curl -H "Authorization: Bearer <admin-jwt>" \
  https://hvpylzrcbswxhyjbgelz.supabase.co/functions/v1/cinetpay-proxy-check
```

La réponse `proxy_egress_ip` = IP à whitelister chez CinetPay.
