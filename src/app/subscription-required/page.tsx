'use client';

import { useSearchParams } from 'next/navigation';
import { useEduGestStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

function SubscriptionRequiredContent() {
  const searchParams = useSearchParams();
  const { userData } = useEduGestStore();
  
  const feature = searchParams.get('feature') || 'cette fonctionnalité';
  const requiredTier = searchParams.get('requiredTier') || 'STANDARD';
  const currentTier = userData?.subscriptionTier || (userData as { school?: { subscriptionTier?: string } } | undefined)?.school?.subscriptionTier || 'FREEMIUM';

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
          
          <Button asChild className="w-full">
            <Link href="/">
              Retour à l&apos;application
              <ArrowLeft className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Consultez et comparez les forfaits depuis le menu « Tarifs » de l&apos;application.
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
