import { notFound } from "next/navigation";
import { readPage } from "../../lib/aem";
import { localLink, pagePath, SITE_ROOT } from "../../lib/content";
import Composition from "../../components/Composition";

export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const path = pagePath((await params).slug);
  if (!path) notFound();
  const value = (await searchParams)["login-token"];
  const token = typeof value === "string" ? value : undefined;
  const { page, config } = await readPage(path, token);
  const context = { ...config, token: config.author ? token : undefined };
  const href = (path: string) => localLink(path, context.token, config.publishedPreview);
  return <>
    <a className="skip" href="#contenu">Aller au contenu</a>
    {config.publishedPreview && <p className="editor-notice" role="status">
      Universal Editor : affichage du contenu publié. Les brouillons ne sont pas chargés.
    </p>}
    <div className="topline"><span>Particuliers</span><span>Professionnels</span><span>Une énergie qui nous rassemble</span></div>
    <header className="site-header">
      <a className="brand" href={href(SITE_ROOT)} aria-label="ENGIE — accueil">ENGIE<span>particuliers</span></a>
      <nav aria-label="Navigation principale">
        <a href={href(`${SITE_ROOT}/offres`)}>Électricité & gaz</a>
        <a href={href(`${SITE_ROOT}/conseils`)}>Économies d’énergie</a>
        <a href={href(`${SITE_ROOT}/demenagement`)}>Je déménage</a>
      </nav>
      <a className="contact" href={href(`${SITE_ROOT}/contact`)}>Besoin d’aide ?</a>
    </header>
    <main id="contenu" aria-label={page.title}
      {...(config.author ? {
        "data-aue-resource": `urn:aemconnection:${page.rootPath}`,
        "data-aue-type": "container", "data-aue-filter": "engie-root", "data-aue-label": "Page — ajouter des composants"
      } : {})}>
      <Composition items={page.components} context={context} />
      {config.author && !page.components.length && <div className="blank"><h1>Votre page blanche</h1><p>Sélectionnez ce conteneur puis + pour ajouter une bannière, une section, une offre ou un conseil.</p></div>}
    </main>
    <footer><div className="brand">ENGIE</div><p>L’énergie est notre avenir, économisons-la !</p>
      <p className="disclaimer">Démonstrateur éditorial — offres et parcours illustratifs, sans souscription ni service client connecté.</p>
      <a href={href(`${SITE_ROOT}/mentions-legales`)}>Mentions légales</a>
    </footer>
  </>;
}
