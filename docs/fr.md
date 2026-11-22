# NESO Demand Flexibility

Les événements du **Demand Flexibility Service** (DFS) de NESO, le
gestionnaire du système électrique britannique : des demi-heures où les foyers
et entreprises inscrits par leur fournisseur (« Saving Sessions » d'Octopus,
entre autres) sont rémunérés pour modifier leur consommation. Les données
viennent du [portail de données ouvertes de NESO](https://www.neso.energy/data-portal/demand-flexibility).
Cette intégration est sans lien avec NESO ni avec aucun fournisseur.

## Présentation

NESO publie deux types d'événements, chacun suivi par un appareil :

- **réduction** (« réduire ») : consommer moins pendant l'événement — les plus
  courants, derrière les « saving sessions » ;
- **augmentation** (« augmenter ») : consommer plus, quand le réseau a trop
  d'électricité (plus rares).

Les événements sont annoncés le jour même, en général entre 10 h et 13 h, pour
l'après-midi et la soirée (par exemple 16:00–20:00). Chaque appareil indique si
un événement est en cours, le prochain et le nombre annoncé. Un widget, trois
déclencheurs de scène et une action de scène aident à décaler la machine à
laver, la recharge de la voiture ou le chauffage.

Être payé dépend de **votre** fournisseur et de votre inscription à
l'événement chez lui : l'intégration dit seulement ce que NESO a demandé.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Gladys doit joindre `api.neso.energy` sur Internet. Ni compte ni clé : les
  données sont ouvertes, sous NESO Open Data Licence.
- Le service couvre la Grande-Bretagne (Angleterre, Écosse, pays de Galles).

## Configuration

1. Installez l'intégration (**Intégrations → Installer depuis GitHub**, puis
   `https://github.com/guim31/gladys-demand-flexibility`).
2. Dans son onglet **Configuration** :
   - **Langue des noms** : langue des noms d'appareils et de fonctionnalités
     (figés à l'ajout d'un appareil) et des textes envoyés aux scènes ;
   - **Événements pour consommer moins** : activé par défaut ;
   - **Événements pour consommer plus** : désactivé par défaut.
3. Enregistrez, puis ajoutez les appareils depuis l'onglet **Découverte**.

### Bouton « Tester la connexion »

Lit tout de suite le portail de NESO et affiche le nombre d'événements
annoncés et le prochain, ou l'erreur en rouge.

## Appareils

### Flexibilité DFS (un par type d'événement)

| Fonctionnalité              | Valeur                                                           |
| --------------------------- | ---------------------------------------------------------------- |
| Événement en cours          | 1 pendant un événement, 0 sinon                                  |
| Événements à venir          | événements annoncés et pas encore commencés                      |
| Début du prochain événement | jour et heure, par exemple `sam. 21/11 16:00`, ou « aucun »      |
| Fin du prochain événement   | heure, par exemple `20:00`                                       |
| Prix garanti (£/MWh)        | le prix d'acceptation garanti fixé par NESO, 0 s'il n'y en a pas |

Le « prochain événement » est l'événement en cours, sinon le suivant. NESO fixe
rarement un prix garanti ; ce que verse votre fournisseur n'est pas publié.

## Widget

**Prochain événement DFS** montre, pour le type choisi dans ses réglages (le
premier par défaut) : l'événement en cours et sa fin, ou le prochain et le
temps avant son début, le prix garanti s'il existe, les autres événements à
venir et le dernier événement terminé. Deux réglages masquent les événements à
venir et le dernier.

## Scènes

### Nouvel événement annoncé (déclencheur)

Se déclenche quand NESO publie un événement jamais vu. Filtre : le type
d'événement. Variables : `day`, `start_time`, `end_time`, `duration_minutes`,
`minutes_until`, `price`. Les événements déjà publiés au tout premier
démarrage de l'intégration ne le déclenchent pas.

### Événement imminent (déclencheur)

Se déclenche une fois par événement et par délai choisi : 5, 15, 30 minutes,
1 ou 2 heures avant son début. Un événement annoncé tard déclenche d'un coup
les délais déjà dépassés. Filtres : le type d'événement, les délais.
Variables : `start_time`, `end_time`, `duration_minutes`, `minutes_until`,
`price`.

### Événement terminé (déclencheur)

Se déclenche une fois à la fin de chaque événement (dans les deux heures).
Filtre : le type d'événement. Variables : `start_time`, `end_time`,
`duration_minutes`.

### Lire le prochain événement (action)

Renvoie l'événement en cours ou le prochain pour les actions suivantes :
`day`, `start_time`, `end_time`, `minutes_until`, `duration_minutes`,
`in_progress` (1 ou 0) et `price`. Échoue, en rouge, si aucun événement n'est
annoncé.

## Exemples de scènes

- **Nouvel événement annoncé** → s'envoyer « Saving session aujourd'hui : »
  suivi de `start_time` et `end_time`, choisis dans la liste des variables.
- **Événement imminent** (30 minutes) → couper le chauffe-eau et baisser la
  consigne du chauffage ; **Événement terminé** → les rétablir.
- **Événement imminent** sur les événements d'augmentation → lancer la
  recharge de la voiture électrique.

## Limites

- L'intégration lit le portail toutes les 10 minutes (une petite requête),
  seulement si un appareil est ajouté ou si le widget est affiché. NESO demande
  au plus 1 requête par seconde à son API et 2 par minute à son datastore :
  très loin de cet usage.
- NESO publie les événements prévus ; il peut en annuler ou en modifier un, ce
  que montre la lecture suivante.
- Si le portail est injoignable, les appareils gardent les derniers événements
  lus (un événement commence et finit quand même à l'heure), et l'écran de
  configuration le signale.
- Les heures sont affichées dans le fuseau de Gladys.
- Développée et testée contre le vrai portail de NESO, pas encore chez un
  foyer participant au service : vos retours sont les bienvenus.

## Dépannage

- **Aucun appareil dans Découverte** : aucun type d'événement n'est suivi ;
  cochez-en un dans la configuration.
- **« Le portail de données de NESO est injoignable »** : vérifiez l'accès à
  Internet de Gladys, puis utilisez **Tester la connexion**.
- **Aucun événement depuis des jours** : NESO n'en lance que quand le réseau en
  a besoin ; le widget montre le dernier.
- Journaux : l'intégration note son démarrage, les nouveaux événements et les
  échecs. Pour plus de détails, définissez la variable d'environnement
  `LOG_LEVEL=debug`.

## Crédits

Données : portail de données de NESO, jeu « Demand Flexibility Service »,
NESO Open Data Licence — « Supported by National Energy System Operator open
data ». Cette intégration est sans lien avec NESO.
