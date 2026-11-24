# ENGIE Headless

Frontend autonome Next.js App Router / React pour un site editorial de
demonstration alimente par AEM et editable dans Adobe Universal Editor (UE).
Pas de souscription, de compte client ou de service metier ENGIE connecte.
Les textes commerciaux, la marque, l'accessibilite et les mentions legales
restent a valider avant production.

Ce depot contient uniquement le frontend. Le backend Java, les composants AEM,
les modeles Content Fragments, les contenus, Dispatcher et le mapping UE sont
maintenus et deployes depuis le depot AEM separe. Aucun build Maven ni package AEM
n'est fourni ici. Aucun contenu local de secours ne remplace AEM.

## Demarrer en local

Node.js >= 22.18 est requis ; Node.js 24 LTS est recommande et utilise par le
Dockerfile. npm et l'acces reseau sortant a l'origine AEM sont necessaires.

```sh
npm ci
cp .env.example .env.local
```

Configurer les variables **serveur** dans `.env.local` :

```dotenv
AEM_MODE=author
AEM_ORIGIN=https://author-p144258-e1701952.adobeaemcloud.com
```

```sh
npm run dev
# Pour un front local HTTPS accepte par le navigateur et UE :
npm run dev:https
```

Le front auteur refuse de lire le contenu sans le `login-token` du contributeur :
ouvrir depuis AEM Sites avec le mapping UE configure. Une page ouverte directement
sans jeton n'est pas une preuve de panne de la connexion. Le certificat HTTPS local
doit etre accepte par le navigateur ; les certificats et clefs restent hors Git.

Les valeurs `AEM_MODE=author|publish` et `AEM_ORIGIN` sont obligatoires. L'origine
doit etre HTTPS, sans chemin, identifiants, query string ou fragment ; seul
`http://localhost:port` est permis pour un SDK local. Ne pas utiliser de variable
`NEXT_PUBLIC_*` pour cette configuration. Ne jamais deduire l'origine AEM d'une
requete entrante.

## Quickstart Vercel : front auteur

1. Importer ce depot GitHub prive dans Vercel avec un compte disposant de l'acces
   au depot. Choisir **Framework Preset : Next.js**, **Root Directory : `.`**,
   **Install Command : `npm ci`**, **Build Command : `npm run build`**.
   Conserver l'Output Directory gere par le preset Next.js : ne pas selectionner
   `.next/standalone`, `out` ou un export statique.
2. Selectionner **Node.js 24.x** dans les parametres du projet. Le champ
   `engines.node` du package autorise aussi d'autres versions compatibles et
   peut influer sur la selection Vercel : verifier la version effective dans
   les logs de build. Le Dockerfile n'est pas utilise par le preset Next.js.
3. Ajouter `AEM_MODE=author` et
   `AEM_ORIGIN=https://author-p144258-e1701952.adobeaemcloud.com` aux
   environnements Vercel effectivement utilises (Production et, si souhaite,
   Preview/Development). Ne pas ajouter de compte technique ni de jeton persistant.
   Redeployer apres tout changement de variables.
4. Lancer le deploiement et recuperer son **URL HTTPS reelle**, de preference le
   domaine stable du projet pour le front contributeur. Aucune URL Vercel n'est
   predefinie dans ce depot ; importer le projet ne valide pas la connexion AEM.
5. Dans Cloud Manager, configurer la variable de l'environnement **Author**
   `ENGIE_AUTHOR_HOST` avec le **hostname du front Vercel**, sans `https://`,
   chemin ni slash final. Ce n'est **pas** le hostname de l'instance AEM.
   Faire appliquer/deployer le mapping UE depuis le depot AEM separe.
6. Dans AEM Sites, ouvrir une page sous `/content/engie/fr/particuliers` avec
   **Modifier**. Verifier l'ouverture du bon domaine dans UE, la lecture de la
   vraie page, les images DAM et l'enregistrement des modifications.

Le rendu est serveur et dynamique, les lectures AEM utilisent `cache: "no-store"`.
Ne pas configurer d'ISR, de cache CDN ou de regle de cache par-dessus les pages
auteur et `/api/media`. Conserver `Cache-Control` prive/sans stockage et
`Referrer-Policy: no-referrer`.

### Iframe, protection de deploiement et sessions

Le front doit etre joignable en HTTPS par le navigateur du contributeur dans
l'iframe Universal Editor. La CSP fournie autorise les ancetres
`https://experience.adobe.com` et `https://*.adobeaemcloud.com`.
Ne pas ajouter `X-Frame-Options: DENY` ou `SAMEORIGIN` au niveau hebergeur/proxy.

Verifier **Deployment Protection** sur le domaine reel choisi : une page de
connexion Vercel ou un challenge dans l'iframe peut bloquer UE, meme si le build
est reussi. Configurer un acces compatible avec UE selon les regles de
l'organisation ; ne pas supposer qu'une preview protegee fonctionnera ni ajouter
de secret de contournement au code ou au mapping. Toute exemption approuvee de
protection Vercel ne dispense jamais du `login-token` AEM.

Le mapping AEM ajoute `login-token=${token}` en conservant `${path}`.
`${token}` est genere par AEM via `QueryTokenAuthenticationHandler` a l'ouverture,
au nom du contributeur. Il est distinct de l'authentification Adobe IMS utilisee
pour les **ecritures** UE. Le front ne transmet le jeton qu'a son origine Author
fixe. Si le query-token manque ou n'est pas disponible, faire corriger la
configuration avec l'administrateur AEM/Adobe : aucun acces public ni compte
technique de remplacement.

Les URL auteur contiennent un jeton de session. Exclure les query strings des
logs, traces, analytics et outils de monitoring de l'hebergeur. Ne pas copier ces
URL dans des tickets. Aucun analytics n'est fourni ; ne pas ajouter de script
tiers au front auteur sans revue des risques de fuite de session.

### Front public, dans un second projet

Creer plus tard un **autre projet Vercel**, avec le meme depot et les memes
reglages Next.js, mais `AEM_MODE=publish` et `AEM_ORIGIN` contenant la **vraie
origine Publish**. Cette origine n'est pas encore renseignee ici : ne pas
l'inventer ni reutiliser l'Author pour simuler un Publish.

Le front public lit anonymement le contenu publie, sans jeton technique ni
instrumentation UE. Les pages, fragments, modeles et assets doivent etre publies
et leur lecture autorisee par AEM/Dispatcher. Les fetchs serveur-a-serveur
n'exigent pas de CORS navigateur global.

## Production locale et Docker

```sh
npm run build
npm start
```

Le build local produit `.next/standalone`. Le `postbuild` y copie `public` et les
assets `.next/static`, afin que `npm start` fonctionne sans le CLI Next.
Sur un build gere tel que Vercel, si aucun serveur standalone n'est genere,
le script l'indique et ne tente pas cette copie ; une vraie erreur de copie
sur un build standalone reste bloquante.

```sh
docker build -t engie-headless .
docker run --rm -p 3000:3000 --env-file .env.local engie-headless
```

Le conteneur utilise Node.js 24, demarre sous l'utilisateur non-root `node` et
recoit les variables a l'execution. Ne pas embarquer de fichier `.env` reel,
de certificats ou de clefs dans une image ou un commit.

## Contrat AEM et fichiers du frontend

| Fichier / repertoire | Responsabilite |
| --- | --- |
| `app/[[...slug]]/page.tsx` | Routage et rendu serveur dynamique |
| `lib/aem.ts` | Lecture authentifiee Author ou anonyme Publish |
| `lib/content.ts` | Validation de la projection et des liens/chemins |
| `components/Composition.tsx` | Rendu des huit types de blocs et instrumentation UE |
| `components/EditorRefresh.tsx` | Relecture apres les evenements officiels UE |
| `app/api/media/route.ts` | Relais des images Author authentifiees, sans cache |
| `public/component-*.json` | Definitions, modeles et filtres UE |

Le backend requis expose `{pagePath}/jcr:content.engie.json` : le servlet Sling
cible le resourceType de `jcr:content`, pas le noeud `cq:Page`. C'est un contrat
specifique au projet, pas une API Adobe native. Il renvoie `path`, `title`, `rootPath` et les
composants ordonnes de `jcr:content/root`, avec les fragments resolus. Une reponse
incompatible ou inaccessible produit une erreur, jamais une fausse page locale.

Les ressources restent celles du backend existant :

- pages : `/content/engie/fr/particuliers` et descendants ;
- medias et Content Fragments : `/content/dam/engie` ;
- configuration/modeles : `/conf/engie` ;
- types : `adobedemoemea145program/components/engie/*`.

Ne pas renommer ces URI pour les aligner sur le nom de ce depot. Les composants
sont section, banniere, texte brut, offre CF, conseil CF, FAQ, appel a l'action
et image DAM. Les textes sont echappes par React ; le HTML arbitraire n'est pas
interprete. Les images Author sont limitees au DAM ENGIE et aux formats
JPEG/PNG/WebP/AVIF/GIF ; les images publiques utilisent directement le DAM Publish.

Les routes `/`, `/offres`, `/conseils`, `/demenagement`, `/contact`,
`/mentions-legales`, `/page-blanche` et les descendants nouveaux correspondent
aux pages sous la racine AEM. Les chemins AEM complets sont aussi acceptes.
Les liens editoriaux internes doivent utiliser ces chemins complets sans
extension `.html` afin de conserver la session auteur. Les noms techniques
acceptent lettres/chiffres ASCII, tirets et underscores.

## Contribution et verification

```sh
npm test
npm run typecheck
npm run build
npm run test:integration
```

Les tests unitaires couvrent routes, liens, perimetre DAM, contrats UE et
preparation standalone. Les **deux tests HTTP** demarrent le vrai serveur de
production `.next/standalone/server.js`, un en mode Publish et un en mode Author,
avec un **double de test du backend AEM**. Ils couvrent SSR, jeton, medias,
cache, assets, pages nouvelles et 404. Ils ne valident ni une connexion AEM Cloud,
ni IMS, ni un deploiement Vercel.

La recette Cloud reste a effectuer apres deploiement des deux parties :
creation d'une page blanche, ajout des huit types, choix/modification d'un CF
de chaque modele, deplacement/suppression de blocs, images DAM, rechargement
et publication avec leurs references. Les comptes, droits contributeur,
modeles, template, servlet, Dispatcher et mapping UE se gerent dans AEM et son
depot separe.

## Documentation Vercel

- [Next.js sur Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Reglages de build](https://vercel.com/docs/builds)
- [Versions Node.js et priorite de engines](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Deployment Protection](https://vercel.com/docs/deployment-protection)
