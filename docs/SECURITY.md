# Sécurité, licence, accès, taxes, RGPD

## 🔒 Sécurité des Systèmes

### Authentication & Authorization

- **Wallet-based authentication** : Utilisation des clés Solana pour l'authentification
- **Rôles utilisateur** : admin, client
- **Validation des transactions** : Vérification des signatures et paiements
- **API sécurisée** : Headers CORS, rate limiting, HTTPS requis en production

### Protection des Données

- **Clés privées** : Stockage sécurisé hors du système principal
- **Variables d'environnement** : Aucune clé sensible dans le code
- **Redis sécurisé** : Connection avec authentification
- **Logs** : Pas d'exposition de données sensibles

### Sécurité Docker

- **Multi-stage builds** : Réduction de la surface d'attaque
- **Utilisateurs non-root** : Tous les services utilisent des utilisateurs à privilèges limités
- **Réseaux isolés** : Communication interne uniquement
- **Volumes read-only** : Limitation des accès en écriture

## 💰 Modèle de Licence

### Paiements Acceptés

- **Carte bancaire** : Via Stripe (validations instantanées)
- **Solana (SOL)** : Via Phantom Wallet
- **Prix** : XX SOL ou YY€ pour l'accès (à définir)

### Taxation Automatique

- **Commission créateur** : 3% automatique sur les profits
- **Exclusion** : Pas de taxe pour le créateur lui-même
- **Minimum** : Pas de taxe sur des profits < 0.001 SOL
- **Transparence** : Transaction de taxe visible sur-chain

### Activation/Désactivation

- **Validation des paiements** :
  - Stripe : Webhook de confirmation
  - Solana : Vérification on-chain
- **Système de licences** : Base Redis sécurisée
- **Contrôle d'accès** : bloque le bot si wallet non validé

## 📜 Légal & Compliance

### RGPD

- **Données collectées** :
  - Adresse wallet (nécessaire pour l'activation)
  - Historique de transactions (pour la taxe)
  - Logs d'utilisation (anonymisés)
- **Conservation** : Données supprimées après inactivité de 12 mois
- **Accès** : Utilisateur peut demander ses données via /api/me
- **Suppression** : Sur demande à support@cubilizer.com

### Conditions d'utilisation

- **Service éducatif** : Pas un conseil en investissement
- **Risques** : L'utilisateur est responsable des trades
- **Performances** : Pas de garantie de profit
- **Modifications** : Se réserve le droit d'adapter les termes

### Code de conduite

- **Utilisation légitime** : Interdit d'utiliser pour la manipulation de marché
- **Anti-spam** : Pas d'abus du système
- **Respect des lois** : Ne pas violer les régulations locales

## 🛡️ Pratiques de Sécurité

### Checklist avant production

1. **Environnement** :
   - [ ] .env séparé pour prod (jamais committé)
   - [ ] HTTPS/SSL activé
   - [ ] CORS limité aux domaines autorisés
   - [ ] Rate limiting configuré

2. **Secrets** :
   - [ ] Clés wallet chiffrées
   - [ ] Accès Redis protégé
   - [ ] Tokens Stripe en environnement séparé
   - [ ] JWT secrets générés aléatoirement

3. **Code** :
   - [ ] Dependencies sécurisées (npm audit)
   - [ ] Code review complet
   - [ ] Tests de sécurité automatisés
   - [ ] Pas de console.log en production

4. **Infrastructure** :
   - [ ] Firewall configuré
   - [ ] Backup automatisé
   - [ ] Monitoring actif
   - [ ] Plan de reprise d'activité

### Rapports de vulnérabilité

- **Contact** : security@cubilizer.com
- **Bug bounty** : Disponible pour les failles majeures
- **Confidentialité** : Rapport responsable exigé

## 📊 Conformité Blockchain

### Smart Contracts

- **Aucun contrat** : Pure interaction avec Jupiter/Solana
- **Taxation** : Par transaction standard Solana
- **Sécurité** : Utilisation des SDK officiels

### Audit Trail

- **Redis logs** : Traces de toutes les transactions
- **Timestamping** : Horodatage sécurisé
- **Immutabilité** : Références on-chain

---

**Dernière mise à jour**: 2025-05-05  
**Version**: 1.0.0  
**Responsable sécurité**: @cubilizer