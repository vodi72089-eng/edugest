'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEduGestStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, ArrowLeft, Crown } from 'lucide-react';
import { Suspense } from 'react';

function SubscriptionRequiredContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userData, setCurrentView } = useEduGestStore();

  const feature = searchParams.get('feature') || 'cette fonctionnalité';
  const requiredTier = searchParams.get('requiredTier') || 'STANDARD';
  const currentTier = userData?.subscriptionTier || (userData as { school?: { subscriptionTier?: string } } | undefined)?.school?.subscriptionTier || 'FREEMIUM';

  // Réinitialise la vue sur le dashboard AVANT de revenir dans l'app,
  // sinon la restauration de session rouvre la vue bloquée et re-déclenche
  // la redirection vers cette page (boucle infinie).
  const handleBackToApp = () => {
    setCurrentView('dashboard');
    router.push('/');
  };

  // Ouvre la vue « Mon Abonnement » de l'application pour demander une upgrade
  const handleUpgrade = () => {
    setCurrentView('my-subscription');
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-muted rounded-full w-fit">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Fonctionnalité non disponible</CardTitle>
          <CardDescription>
            Cette fonctionnalité n&apos;est pas incluse dans votre forfait actuel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Votre forfait</span>
            <Badge variant="outline">{currentTier}</Badge>
          </div>

          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Fonctionnalité demandée</span>
            <span className="font-medium">{feature}</span>
          </div>

          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Forfait minimum requis</span>
            <Badge variant="default">{requiredTier}</Badge>
          </div>

          <Button
            variant="outline"
            className="w-full border-[oklch(72%_0.15_65)] text-[oklch(45%_0.13_175)] hover:bg-[oklch(95%_0.04_65)] hover:text-[oklch(45%_0.13_175)]"
            onClick={handleUpgrade}
          >
            Passer à un forfait supérieur
            <Crown className="ml-2 h-4 w-4" />
          </Button>

          <Button className="w-full" onClick={handleBackToApp}>
            Retour à l&apos;application
            <ArrowLeft className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Comparez les forfaits dans « Mon Abonnement » et envoyez une demande d&apos;upgrade à l&apos;administrateur.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SubscriptionRequiredPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Chargement...</div>}>
      <SubscriptionRequiredContent />
    </Suspense>
  );
}
