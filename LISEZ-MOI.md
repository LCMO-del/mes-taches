# Mes tâches — MVP (formule Essentiel)

Application installable (PWA) : dictée vocale, liste triée, report en un geste, projets/machines, sauvegarde par fichier, fonctionnement hors réseau.
Réalisée par LC Management Office.

## Contenu du dossier
- `index.html`, `app.js`, `parser.js`, `style.css` : l'application (aucune dépendance, aucune police externe)
- `sw.js` : fonctionnement hors réseau (changer `VERSION` à chaque mise à jour)
- `manifest.webmanifest`, `icons/` : installation sur l'écran d'accueil

## Adresse en ligne
https://lcmo-del.github.io/mes-taches/ (GitHub Pages, dépôt LCMO-del/mes-taches). Version 1.0.1.
Pour passer plus tard sur `taches.lcmanagementoffice.be` : ajouter un fichier `CNAME` contenant ce nom, et chez OVH un enregistrement CNAME `taches` → `lcmo-del.github.io`.

## Tests automatiques
`node tests/parser.test.js` (55 phrases d'ingénieur, dates, heures, urgence). Le dossier `tests/` n'est pas mis en cache par l'appli.

## Mise en ligne (obligatoire : HTTPS)
Déposer **tout le contenu du dossier** à la racine d'un hébergement HTTPS, par exemple :
- sous-domaine `taches.lcmanagementoffice.be` (OVH, dossier dédié) ;
- GitHub Pages ou Netlify (gratuit).
Ne pas ouvrir `index.html` directement depuis le disque : le mode hors réseau et l'installation ne fonctionnent qu'en HTTPS.

## Installation chez le client
- iPhone : Safari → Partager → « Sur l'écran d'accueil ».
- Android : Chrome → ⋮ → « Installer l'application ».
Ouvrir l'appli **une première fois avec du réseau**, puis elle fonctionne sans.

## Mise à jour
Modifier les fichiers, changer `VERSION` dans `sw.js`, republier. L'application affiche « Une nouvelle version est prête » ; le client touche « Mettre à jour ». Les tâches sont conservées.

## À tester sur le téléphone du client AVANT de promettre quoi que ce soit
1. Dictée intégrée EN LIGNE : touche micro → parler → texte → « Préparer les tâches ».
2. Dictée intégrée HORS RÉSEAU (mode avion) : sur Chrome Android récent le français local peut fonctionner si le pack vocal est installé ; sur iPhone, ne pas compter dessus. Repli prévu : micro du clavier (🎤) dans le champ de texte.
3. Installation sur l'écran d'accueil, puis ouverture en mode avion.
4. Téléphone autorisé dans ses zones de travail ? Micro autorisé pour le navigateur ?
5. Sauvegarde : créer un fichier, effacer, restaurer.

## Limites connues (honnêtes)
- Pas de rappels/notifications (formule Terrain : nécessite un serveur).
- Pas de synchronisation avec un ordinateur (option).
- Les données vivent sur le téléphone : sans sauvegarde, un téléphone perdu ou réinitialisé = données perdues. Safari iPhone efface les données d'un site non installé après ~7 jours sans usage : bien installer sur l'écran d'accueil.
- L'analyse des phrases est locale (règles en français) : elle propose, l'utilisateur vérifie.
