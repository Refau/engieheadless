import type { Component, LinkCarry } from "../lib/content";
import { damImage, localLink } from "../lib/content";

type Context = { author: boolean; origin: string; carry?: LinkCarry; publishedPreview?: boolean };
const labels = {
  section: "Section", hero: "Bannière", text: "Texte", offer: "Offre",
  article: "Conseil", faq: "Question fréquente", cta: "Appel à l'action", image: "Image"
};
function editable(author: boolean, prop: string, resource?: string) {
  return author ? {
    "data-aue-prop": prop, "data-aue-type": "text",
    ...(resource ? { "data-aue-resource": `urn:aemconnection:${resource}` } : {})
  } : {};
}
function Action({ label, link, context }: { label: string; link: string; context: Context }) {
  const href = localLink(link, context.carry);
  if (!label && !link) return null;
  if (!label || !href) return <p role="alert" className="content-error">
    {context.author ? "Lien incomplet ou invalide : renseignez un libellé et un chemin de page ou une URL HTTPS." : "Lien temporairement indisponible."}
  </p>;
  return <a className="button" href={href}>{label}<span aria-hidden="true"> ↗</span></a>;
}

export default function Composition({ items, context }: { items: Component[]; context: Context }) {
  return items.map(item => <Block key={item.path} item={item} context={context} />);
}
function Block({ item, context }: { item: Component; context: Context }) {
  const { author, origin } = context;
  const attrs = author ? {
    "data-aue-resource": `urn:aemconnection:${item.path}`,
    "data-aue-type": item.type === "section" ? "container" : "component",
    "data-aue-model": `engie-${item.type}`,
    "data-aue-label": labels[item.type],
    ...(item.type === "section" ? { "data-aue-filter": "engie-section" } : {})
  } : {};
  const theme = ["light", "blue", "mint"].includes(item.theme) ? item.theme : "light";
  const asset = damImage(item.image, origin);
  const image = asset && author && !context.publishedPreview
    ? `/api/media?${new URLSearchParams({ path: item.image, ...(context.carry ? { [context.carry.name]: context.carry.value } : {}) })}`
    : asset;
  switch (item.type) {
    case "section":
      return <section {...attrs} className={`section section-content theme-${theme} ${item.layout === "grid" ? "grid" : ""}`}>
        {item.title && <h2 {...editable(author, "title")}>{item.title}</h2>}
        <Composition items={item.children ?? []} context={context} />
        {author && !item.children?.length && <p className="empty">Section vide — ajoutez un composant avec le bouton +.</p>}
      </section>;
    case "hero":
      return <section {...attrs} className={`hero theme-${theme}`}>
        <div className="hero-copy">
          <p className="eyebrow" {...editable(author, "eyebrow")}>{item.eyebrow}</p>
          <h1 {...editable(author, "title")}>{item.title}</h1>
          <p className="intro" {...editable(author, "text")}>{item.text}</p>
          <Action label={item.linkLabel} link={item.link} context={context} />
        </div>
        <div className="hero-visual">
          {image ? <img src={image} alt={item.imageAlt} {...(author ? { "data-aue-prop": "image", "data-aue-type": "media" } : {})} /> :
            <div className="energy-art" aria-hidden="true"><span>+</span><span>ma maison<br />demain</span><span>☀</span></div>}
        </div>
      </section>;
    case "offer":
    case "article": {
      const cf = item.fragment;
      if (!cf) return <article {...attrs} className="card empty" role={item.fragmentError ? "alert" : undefined}>
        {item.fragmentError && <strong>{item.fragmentError}.</strong>}
        {author ? `Sélectionnez un Content Fragment ${item.type === "offer" ? "Offre" : "Conseil"} dans les propriétés.` : "Ce contenu est indisponible."}
      </article>;
      const resource = `${item.fragmentPath}/jcr:content/data/master`;
      return <article {...attrs} className={`card ${item.type}`}>
        <p className="eyebrow" {...editable(author, "badge", resource)}>{cf.badge}</p>
        <h3 {...editable(author, "title", resource)}>{cf.title}</h3>
        <p {...editable(author, "description", resource)}>{cf.description}</p>
        <Action label={cf.linkLabel} link={cf.link} context={context} />
        {cf.legal && <small {...editable(author, "legal", resource)}>{cf.legal}</small>}
      </article>;
    }
    case "text":
      return <section {...attrs} className="prose">
        <h2 {...editable(author, "title")}>{item.title}</h2>
        <p className="preserve-lines" {...editable(author, "text")}>{item.text}</p>
      </section>;
    case "faq":
      return <details {...attrs} className="faq">
        <summary {...editable(author, "title")}>{item.title}</summary>
        <p {...editable(author, "text")}>{item.text}</p>
      </details>;
    case "cta":
      return <aside {...attrs} className={`callout theme-${theme}`}>
        <div><h2 {...editable(author, "title")}>{item.title}</h2><p {...editable(author, "text")}>{item.text}</p></div>
        <Action label={item.linkLabel} link={item.link} context={context} />
      </aside>;
    case "image":
      return <figure {...attrs} className="picture">
        {image ? <img src={image} alt={item.imageAlt} {...(author ? { "data-aue-prop": "image", "data-aue-type": "media" } : {})} /> :
          <p className="empty">Choisissez une image dans /content/dam/engie.</p>}
        {item.text && <figcaption {...editable(author, "text")}>{item.text}</figcaption>}
      </figure>;
  }
}
