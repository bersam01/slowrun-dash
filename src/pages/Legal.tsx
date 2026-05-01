import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const Legal = () => {
  return (
    <main className="min-h-screen px-4 py-10">
      <div className="container max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/login"><ArrowLeft className="mr-1 h-4 w-4" /> Retour</Link>
          </Button>
        </div>

        <article className="prose prose-invert max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
          <header>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Mentions légales</h1>
            <p className="mt-2">Dernière mise à jour : 1er mai 2026</p>
          </header>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Éditeur du site</h2>
            <p>
              Le site <strong>SlowRun</strong> (slowrun.app, dashboard.slowrun.app) est édité à
              titre personnel. Pour toute demande, contactez-nous via Discord ou à l'adresse
              indiquée sur la page de contact.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Hébergement</h2>
            <p>
              Le site est hébergé par <strong>Lovable</strong> (https://lovable.dev) et son
              infrastructure backend repose sur <strong>Supabase</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Données personnelles</h2>
            <p>
              Lors de la connexion via Discord, nous collectons votre identifiant Discord,
              votre pseudo et votre avatar publics, dans le seul but de gérer votre compte et
              vos quotas. Aucune donnée n'est revendue à des tiers.
            </p>
            <p>
              Conformément au RGPD, vous pouvez demander à tout moment la suppression de
              votre compte et des données associées en nous contactant.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Cookies</h2>
            <p>
              SlowRun utilise uniquement des cookies techniques nécessaires à la session
              d'authentification. Aucun cookie publicitaire ou de tracking tiers n'est déposé.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Paiements</h2>
            <p>
              Les paiements sont opérés par <strong>Stripe</strong>. Aucune donnée bancaire
              n'est stockée sur nos serveurs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Propriété intellectuelle</h2>
            <p>
              L'ensemble du contenu du site (textes, logos, interface) est protégé. Toute
              reproduction sans autorisation est interdite.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Responsabilité</h2>
            <p>
              SlowRun est fourni « tel quel ». Nous ne saurions être tenus responsables d'une
              indisponibilité temporaire du service ou d'une utilisation non conforme.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
};

export default Legal;
