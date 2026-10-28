# Automated Parking — site 3D

Landing page « Automated Parking » animée en 3D : loader avec le robot, rideau
d'entrée, parking automatisé en boucle, sélecteur de couleurs, mode nuit, section
« UHF identification », pages Features / Resources / Enterprise / Pricing,
fenêtre de connexion et défilement section par section.

**[Voir le site en ligne](https://pdha8.github.io/automated-parking-3d/)**

![Démo du site](docs/images/demo.gif)

La 3D est **rendue dans Blender (Cycles, GPU)** puis lue dans le site sous forme
de vidéos en boucle **à 60 images/s** : rendu de qualité « studio » et lecture
fluide sur n'importe quel ordinateur (décodage vidéo matériel), y compris sur les
écrans 120-165 Hz. L'interface (textes, boutons, bulle du robot, curseur…) reste
en HTML/CSS/JS.

## Aperçu

| Jour | Nuit |
| --- | --- |
| ![Parking, mode jour](docs/images/hero.jpg) | ![Parking, mode nuit](docs/images/hero-dark.jpg) |
| ![Section UHF, mode jour](docs/images/uhf.jpg) | ![Section UHF, mode nuit](docs/images/uhf-dark.jpg) |

### Trois couleurs d'accent

Chaque couleur a sa propre vidéo Blender ; le changement est instantané et
l'animation continue sans saut.

![Variantes teal, bleu et vert](docs/images/colors.jpg)

### Mobile

<img src="docs/images/mobile.jpg" alt="Version mobile" width="520">

### Pages du menu

Features, Resources, Enterprise et Pricing : les éléments apparaissent en cascade à
l'arrivée sur la page.

![Pages Features, Resources, Enterprise et Pricing](docs/images/pages.jpg)

### Rendu Blender

Mode nuit : faisceaux des phares, écrans lumineux, ombres douces (Cycles + OptiX).

<img src="docs/images/blender-render.jpg" alt="Rendu Blender, mode nuit" width="620">

## Fonctionnalités

- Loader : le robot flotte, sa visière affiche le pourcentage
- Rideau d'entrée et apparition du titre ligne par ligne
- Parking animé en boucle de 9 s (voitures, scan des plaques, barrières, reçus)
- Bulle du robot synchronisée image par image avec la vidéo (plaque tapée + chrono)
- Couleurs teal / bleu / vert et mode nuit
- Section « UHF identification » avec texte en cascade et bouton « see more »
- Pages du menu : Features (6 fonctionnalités), Resources, Enterprise, Pricing (3 offres)
- Fenêtre « Sign in » (démonstration : rien n'est envoyé)
- Défilement section par section (molette, clavier, tactile), curseur personnalisé
- Voitures arrondies façon jouet modélisées dans Blender (surfaces subdivisées)
- Trajectoires lissées : vitesse continue, virages progressifs, voitures qui entrent
  et sortent hors du cadre
- Ralentisseurs bas et larges : les roues montent dessus et la caisse suit (tangage,
  roulis) au lieu de les traverser
- Boucle vidéo sans raccord visible (roues, robot et écrans reviennent à l'identique)
- Version mobile adaptée

## Lancer le site

Prérequis : Node.js 20.19 ou plus récent.

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir http://localhost:5173

## Version de production

```bash
npm run build
```

Le site final est généré dans `dist/` (fichiers statiques, vidéos comprises) :
il peut être déposé sur n'importe quel hébergement (GitHub Pages, Netlify, Vercel…).
Sur GitHub, le workflow `.github/workflows/deploy.yml` publie automatiquement le
site sur GitHub Pages à chaque push sur `main`.

```bash
npm run preview
```

## Ouvrir les scènes dans Blender

Les scènes prêtes à ouvrir sont dans `blender/scenes/` : `hero_teal.blend`
(parking), `gate_teal.blend` (section « UHF identification ») et leurs versions
nuit (`_dark`). Les écrans et la visière du robot lisent leurs images dans
`blender/work/`. Ce dossier n'est pas inclus dans le dépôt (trop lourd) : il se
recrée avec l'export décrit ci-dessous (étape 1).

## Refaire le rendu 3D avec Blender

Les vidéos sont dans `public/video/`. Pour les régénérer (Blender 5.x requis) :

1. `npm run dev`, puis ouvrir http://localhost:5173/?export : les scènes (géométrie,
   animation image par image à 60 i/s, écrans, visière du robot) sont exportées
   dans `blender/work/`. Pour une seule scène : `?export=hero`, `?export=gate` ou
   `?export=loader`. Le cadre vidéo (1760 x 960 px de maquette) déborde de la
   maquette 1280 x 776 pour remplir les fenêtres larges.
2. Position de la bulle du robot, calculée avec la caméra Blender
   (écrit `src/data/hero-bubble.json`) :

```bash
blender -b --factory-startup -P blender/bubble.py
```

3. Rendre et encoder toutes les variantes :

```bash
bash blender/render_all.sh
```

Variantes : `hero_teal`, `hero_blue`, `hero_green`, `hero_teal_dark` et la même
chose pour `gate_*` (section « UHF identification »). On peut en passer une
partie en argument, par exemple `bash blender/render_all.sh hero_teal`.
Avec une RTX 4060, compter environ 25 min par variante du parking et 35 à 40 min
par variante de la borne (540 images chacune), soit un peu plus de 4 h pour les 8.

4. Images fixes affichées si la lecture automatique est bloquée (première image
   de chaque vidéo) :

```bash
bash blender/posters.sh
```

Le script `blender/render.py` règle la caméra (calculée à partir de la vidéo de
référence), l'éclairage studio, le sol « attrape-ombre », les phares du mode nuit
et rend avec Cycles sur la carte graphique (OptiX). Les carrosseries exportées sont
remplacées par les modèles de `blender/cars.py` (citadine à toit blanc, berline
ancienne, citadine ronde) ; `--old-cars` garde les anciennes.

## Structure

| Élément | Fichier |
| --- | --- |
| Orchestration (chargement, intro, sections, couleurs) | `src/main.js` |
| Vidéos 3D par variante, changement de couleur synchronisé | `src/ui/videoScene.js` |
| Bulle du robot synchronisée image par image | `src/ui/bubble.js` + `src/data/hero-bubble.json` |
| Loader (robot rendu dans Blender + pourcentage) | `src/ui/loader.js` |
| Animation d'entrée du titre / bouton | `src/ui/hero.js` |
| Défilement section par section | `src/ui/sections.js` |
| Pages du menu (apparition en cascade) | `index.html`, `src/styles/pages.css`, `src/ui/reveal.js` |
| Fenêtre de connexion (démo) | `src/ui/signin.js` |
| Trajectoire des voitures du parking | `src/three/heroTrack.js`, `src/three/track.js` |
| Roues et caisse sur les ralentisseurs | `src/three/bumps.js` |
| Texte « UHF identification » + « see more » | `src/ui/uhf.js` |
| Curseur étoile + anneau | `src/ui/cursor.js` |
| Scènes 3D source (Three.js) utilisées pour l'export | `src/three/` |
| Export vers Blender | `src/dev/exporter.js` |
| Rendu Blender | `blender/render.py`, `blender/render_all.sh`, `blender/bubble.py` |
| Carrosseries des voitures (Blender) | `blender/cars.py` |

## Personnaliser

- **Couleurs de l'interface** : `src/core/theme.js` (`ACCENTS`) et `src/styles/main.css` (`:root`)
- **Textes** : `index.html`
- **Scène 3D** (trajets, plaques, lumière) : `src/three/` puis refaire l'export et le rendu

## Outils de mise au point (mode `npm run dev`)

- `?nointro` : saute le loader
- `?section=1` à `?section=5` : ouvre directement une section (1 = UHF, 2 = Features…)
- `?export` : exporte les scènes 3D pour Blender (`?export=gate` : une seule scène)
