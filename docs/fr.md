# Withings

Cette intégration amène dans Gladys les données de vos appareils **Withings** :
poids et composition corporelle d'une balance, tension artérielle, pouls,
température, pas et sommeil d'une montre ou d'un Sleep Analyzer.

Les données viennent du **cloud Withings** (les mêmes que dans l'application
Withings) : l'intégration ne parle pas aux appareils sur votre réseau.

## Ce que vous obtenez

| Dans Gladys                       | Ce qu'il contient                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Appareil **Withings health**      | Vos mesures (poids, masse grasse, muscles, tension, pouls, SpO2, température…), l'activité du jour, la dernière nuit, l'état « au lit » |
| Un appareil par appareil Withings | « Batterie faible » (balances, tensiomètres, montres, thermomètres)                                                                     |
| 5 déclencheurs de scène           | Nouvelle mesure, couché, levé, résumé de la nuit disponible, objectif de pas atteint                                                    |
| 2 actions de scène                | Actualiser les données Withings, lire la dernière valeur Withings                                                                       |
| 2 widgets de tableau de bord      | Santé Withings (résumé), Évolution du poids (graphique)                                                                                 |

Les fonctionnalités de l'appareil **Withings health** suivent ce que votre
compte mesure vraiment : un tensiomètre donne la tension, pas vingt
fonctionnalités de composition corporelle vides. Quand un nouveau type de
mesure apparaît, l'appareil affiche un bouton **Mettre à jour** dans l'onglet
Découverte.

Les mesures gardent **leur propre date** : une pesée synchronisée une heure
plus tard est enregistrée à l'heure où vous êtes monté sur la balance.

## Avant de commencer

- Un compte Withings, avec vos appareils installés dans l'**application
  Withings** (Health Mate) et synchronisés.
- Gladys **5.1** ou plus récent.
- En option : **Gladys Plus**, pour les notifications en temps réel (voir plus
  bas).

## 1. Créer une application développeur Withings

Withings demande de déclarer chaque application qui lit ses données. C'est
gratuit et cela prend cinq minutes.

1. Allez sur [developer.withings.com](https://developer.withings.com/dashboard/)
   et connectez-vous avec votre compte Withings.
2. Créez une application, de type **Public API integration**.
3. Donnez-lui un nom (par exemple « Mon Gladys ») et une description.
4. **Callback URL** : mettez une adresse provisoire pour l'instant, par exemple
   `https://localhost/`. Vous ajouterez la vraie à l'étape 3 plus bas.
5. Enregistrez. Withings affiche le **Client ID** et le **Client secret** de
   l'application.

## 2. Configurer l'intégration

Dans Gladys, ouvrez **Intégrations → Withings → Configuration** :

| Champ                                  | Que mettre                                                                |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Client ID                              | Le Client ID de votre application Withings                                |
| Client secret                          | Le Client secret de votre application Withings                            |
| Intervalle de rafraîchissement (min)   | Fréquence de lecture de Withings. 30 minutes par défaut (5 à 1440)        |
| Objectif de pas quotidien              | Utilisé par le déclencheur « Objectif de pas atteint ». 10 000 par défaut |
| Notifications temps réel (Gladys Plus) | Activé par défaut. Ne marche qu'avec Gladys Plus                          |

Enregistrez.

## 3. Connecter votre compte Withings

1. Cliquez sur **Connecter** (champ « Compte Withings »).
2. La première fois, Withings répond que l'adresse de retour n'est pas
   autorisée (`redirect_uri`). C'est normal : Withings n'accepte que les
   adresses déclarées dans votre application.
3. De retour dans Gladys, cliquez sur **Tester la connexion** : le message
   affiche l'**URL de rappel** utilisée par Gladys. Elle est aussi dans les
   journaux de l'intégration (« Callback URL to declare in your Withings
   app »).
4. Sur developer.withings.com, modifiez votre application et ajoutez cette
   adresse aux callback URLs. Enregistrez.
5. Cliquez à nouveau sur **Connecter**, identifiez-vous chez Withings et
   acceptez.

Le statut passe à **Connecté**, l'intégration lit un an de mesures (seule la
dernière valeur de chacune est mise dans Gladys), et les appareils
apparaissent dans **Découverte**. Créez-les comme n'importe quel appareil.

> L'URL de rappel dépend de l'adresse avec laquelle vous ouvrez Gladys.
> Cliquez toujours sur Connecter depuis la même adresse (celle que vous avez
> déclarée).

## Notifications temps réel (Gladys Plus)

Sans Gladys Plus, l'intégration lit Withings à l'intervalle de
rafraîchissement : une pesée arrive dans Gladys en moins de 30 minutes (par
défaut).

Avec **Gladys Plus**, Withings prévient Gladys dès qu'une donnée arrive :

1. Dans l'écran de configuration de l'intégration, remplissez le bloc
   **Webhooks Gladys Plus** avec votre clé Open API Gladys Plus.
2. Laissez **Notifications temps réel** activé.

L'intégration s'abonne alors toute seule aux notifications Withings. Les
nouvelles mesures arrivent en quelques secondes, et un **Sleep Analyzer**
envoie les événements **au lit** / **hors du lit** (ces deux-là n'existent
qu'avec Gladys Plus).

« Tester la connexion » indique si les notifications sont actives.

## Appareils et fonctionnalités

### Withings health

| Fonctionnalité                                                                     | Unité  | Remarques                                |
| ---------------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| Poids, masse grasse, masse maigre, masse musculaire, masse osseuse, eau corporelle | kg     | Balance                                  |
| Taux de masse grasse                                                               | %      | Balance                                  |
| Indice de graisse viscérale                                                        | —      | Body Comp / Body Scan                    |
| Tension systolique / diastolique                                                   | mmHg   | Tensiomètre                              |
| Fréquence cardiaque                                                                | bpm    | Balance, tensiomètre                     |
| Oxygène sanguin (SpO2)                                                             | %      | ScanWatch                                |
| Température corporelle, température cutanée                                        | °C     | Thermo, ScanWatch                        |
| Vitesse de l'onde de pouls, âge vasculaire                                         | m/s, — | Body Cardio, Body Scan                   |
| Pas, distance, dénivelé, calories actives et totales (du jour)                     | —, m   | Montre ou téléphone ; remis à 0 à minuit |
| Durée de sommeil, sommeil profond / léger / paradoxal, score, réveils, pouls       | min, — | Dernière nuit, datée à l'heure du réveil |
| Au lit                                                                             | 0 / 1  | Sleep Analyzer, avec Gladys Plus         |

Gladys n'a pas d'unité kilogramme, bpm ou mmHg : ces fonctionnalités portent
l'unité dans leur nom.

### Un appareil par appareil Withings

Une fonctionnalité **Batterie faible** (1 quand Withings signale une batterie
faible), pour une scène « changer les piles ». Un Sleep Analyzer branché sur
secteur n'en a pas.

## Scènes

### Déclencheurs

| Déclencheur                  | Quand                                                     | Variables                                          |
| ---------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Nouvelle mesure Withings     | Une pesée, une prise de tension… est enregistrée          | Type, date, et chaque valeur de la mesure (poids…) |
| Couché                       | Un Sleep Analyzer détecte quelqu'un qui se couche         | —                                                  |
| Levé                         | Un Sleep Analyzer détecte quelqu'un qui se lève           | —                                                  |
| Résumé de la nuit disponible | Withings a analysé la nuit dernière                       | Durée de sommeil (min), score de sommeil, réveils  |
| Objectif de pas atteint      | Les pas du jour atteignent l'objectif (une fois par jour) | Pas, objectif                                      |

« Nouvelle mesure Withings » peut être filtré sur le type : pesée, tension
artérielle, température, oxygène sanguin, autre. Seules les mesures récentes
(moins de 24 heures) le déclenchent : connecter le compte ne rejoue jamais les
anciennes pesées.

Exemple : _quand une pesée arrive, m'envoyer « Poids : {{triggerEvent.data.weight}} kg »_.

### Actions

| Action                           | Ce qu'elle fait                        | Résultats                             |
| -------------------------------- | -------------------------------------- | ------------------------------------- |
| Actualiser les données Withings  | Lit Withings tout de suite             | Nombre de nouvelles mesures           |
| Lire la dernière valeur Withings | La dernière valeur connue d'une mesure | Connue (oui/non), valeur, unité, date |

## Widgets du tableau de bord

- **Santé Withings** : jusqu'à quatre tuiles en direct (poids, pas, sommeil,
  tension…), la dernière mesure et la dernière synchronisation, les
  notifications, les piles, et un bouton **Actualiser**.
- **Évolution du poids** : le poids actuel et sa courbe sur une semaine, un
  mois, trois mois ou un an (réglage du widget).

## Boutons de l'écran de configuration

- **Tester la connexion** : compte, appareils, dernière synchronisation,
  notifications et URL de rappel à déclarer chez Withings.
- **Synchroniser maintenant** : lit Withings tout de suite.
- **Déconnecter le compte Withings** : oublie les jetons et arrête les
  notifications. Les appareils restent dans Gladys avec leur historique.

## Dépannage

| Message / symptôme                                        | Que faire                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| « Renseignez le Client ID et le Client secret… »          | Remplissez les deux champs, enregistrez                                                           |
| Withings dit que `redirect_uri` est invalide              | Ajoutez à votre application Withings l'URL de rappel donnée par « Tester la connexion » (étape 3) |
| « Withings a refusé la connexion… cliquez sur Connecter » | Accès révoqué, secret changé ou jeton expiré : cliquez à nouveau sur Connecter                    |
| « Withings est injoignable pour le moment »               | Withings ou votre Internet est coupé ; l'intégration réessaie au prochain rafraîchissement        |
| Notifications « inactives (pas de Gladys Plus lié) »      | Remplissez le bloc Webhooks Gladys Plus, ou gardez seulement le minuteur                          |
| Un nouveau type de mesure n'a pas de fonctionnalité       | Découverte → Withings health → **Mettre à jour**                                                  |
| Pas d'événement « au lit »                                | Il faut un Sleep Analyzer **et** Gladys Plus                                                      |

L'intégration écrit ce qu'elle fait dans ses journaux (le conteneur de
l'intégration), jamais un jeton ni le Client secret.

## Vie privée

- Vos données vont du cloud Withings à **votre** Gladys, via **votre**
  application développeur. Rien ne passe par un tiers (Gladys Plus relaie
  seulement les notifications « nouvelle donnée », qui ne contiennent aucune
  mesure).
- Le Client secret et les jetons sont stockés dans la configuration Gladys de
  l'intégration, jamais réaffichés et jamais écrits dans les journaux.
- L'intégration garde un petit fichier dans son volume `/data` (dernière
  lecture, dernières valeurs) pour qu'un redémarrage ne duplique pas les
  mesures et ne relance pas les scènes.
- Un compte Withings par installation de l'intégration.
