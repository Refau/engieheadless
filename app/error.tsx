"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="blank" role="alert">
    <h1>Le contenu AEM est indisponible</h1>
    <p>Vérifiez la configuration AEM, la publication et les droits. Pour contribuer, ouvrez la page depuis AEM Sites avec une session valide.</p>
    <button className="button" onClick={reset}>Réessayer</button>
  </main>;
}
