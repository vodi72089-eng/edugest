'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEduGestStore } from '@/lib/store';
import { authFetch } from '@/lib/store';
import { getTierLimits, getMinTierForFeature, TierLimits } from '@/lib/subscription';
import {
  Users, GraduationCap, School, CreditCard, MessageSquare, Shield,
  Activity, AlertTriangle, CheckCircle, ArrowUpRight, TrendingUp,
  Clock, HeartPulse
} from 'lucide-react';
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants';

export default function SchoolAdminDashboard() {
  const { userData, setCurrentView } = useEduGestStore();
  const [stats, setStats] = useState<any>({
    studentsCount: 0,
    classesCount: 0,
    teachersCount: 0,
    totalRevenue: 0,
    pendingDebt: 0,
    todayVisitsCount: 0,
  });
  const [waQuota, setWaQuota] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const tier = userData?.subscriptionTier || 'FREEMIUM';
  const limits: TierLimits = getTierLimits(tier);

  const router = useRouter();

  const requestFeature = (feature: string, requiredTier: string) => {
    router.push(`/subscription-required?feature=${encodeURIComponent(feature)}&requiredTier=${requiredTier}`);
  };

  const hasPersonnelAccess = tier !== 'FREEMIUM';
  const hasGatewayAccess = limits.canConfigPayments;

  useEffect(() => {
    if (!userData?.schoolId) return;

    async function loadDashboardData() {
      try {
        setLoading(true);
        // Stats école — la carte « visites du jour » n'a de sens que si le
        // forfait inclut le module médical (sinon 403 inutile dans la console).
        const [statsRes, waRes, medicalRes] = await Promise.all([
          authFetch(`/api/stats?schoolId=${userData?.schoolId}`).catch(() => null),
          authFetch(`/api/whatsapp-config/custom?schoolId=${userData?.schoolId}`).catch(() => null),
          limits.medicalAccess
            ? authFetch(`/api/medical/visits?schoolId=${userData?.schoolId}`).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (statsRes?.ok) {
          const statsJson = await statsRes.json();
          setStats((prev: any) => ({
            ...prev,
            studentsCount: statsJson.data?.studentCount ?? statsJson.data?.totalStudents ?? 0,
            classesCount: statsJson.data?.classCount ?? 0,
            teachersCount: statsJson.data?.teacherCount ?? 0,
            totalRevenue: statsJson.data?.totalCollected ?? 0,
            pendingDebt: statsJson.data?.totalDebt ?? 0,
          }));
        }

        if (waRes?.ok) {
          const waJson = await waRes.json();
          setWaQuota(waJson.data);
        }

        if (medicalRes?.ok) {
          const medJson = await medicalRes.json();
          if (Array.isArray(medJson.data)) {
            const today = new Date().toISOString().split('T')[0];
            const todayVisits = medJson.data.filter((v: any) => v.visitDate?.startsWith(today));
            setStats((prev: any) => ({ ...prev, todayVisitsCount: todayVisits.length }));
          }
        }
      } catch (err) {
        console.error('Erreur chargement dashboard admin école:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [userData?.schoolId]);

  const studentPercent = Math.min(100, Math.round((stats.studentsCount / (limits.maxStudents || 1)) * 100));
  const waPercent = waQuota?.percentUsed || 0;
  const isCustomWa = waQuota?.customEnabled;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      {/* En-tête simple, même design que l'interface admin globale */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>
              Bonjour, {userData?.name || 'Administrateur'}
            </h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>
            Direction Principale • {userData?.schoolName || 'Mon Établissement'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCurrentView('my-subscription')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition hover:shadow-sm"
            style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY, background: 'white' }}
          >
            Forfait : <span className="font-bold" style={{ color: GOLD }}>{tier}</span>
            <ArrowUpRight size={13} />
          </button>
          <button
            onClick={() => setCurrentView('students')}
            className="edu-gold-cta px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            + Inscrire un élève
          </button>
        </div>
      </div>

      {/* Cartes de Quotas & Limites de l'Abonnement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Jauge Élèves */}
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={15} className="text-amber-600" />
              Effectif Élèves ({tier})
            </span>
            <span className="text-xs font-bold text-slate-700">
              {stats.studentsCount} / {limits.maxStudents >= 99999 ? 'Illimité' : limits.maxStudents}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden my-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                studentPercent > 90 ? 'bg-rose-500' : studentPercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${studentPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {limits.maxStudents - stats.studentsCount > 0 && limits.maxStudents < 99999
              ? `Il vous reste ${limits.maxStudents - stats.studentsCount} places disponibles sur ce forfait.`
              : limits.maxStudents >= 99999
              ? 'Aucune limite sur ce palier.'
              : 'Limite atteinte. Mettez à niveau pour inscrire plus d\'élèves.'}
          </p>
        </div>

        {/* Jauge WhatsApp */}
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={15} className="text-emerald-600" />
              Messages WhatsApp ce mois
            </span>
            <span className="text-xs font-bold text-slate-700">
              {isCustomWa
                ? 'Propre API (Illimité)'
                : `${waQuota?.used || 0} / ${limits.whatsappMonthly >= 999999 ? 'Illimité' : limits.whatsappMonthly}`}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden my-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCustomWa
                  ? 'bg-emerald-400'
                  : waPercent > 90
                  ? 'bg-rose-500'
                  : waPercent > 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: isCustomWa ? '100%' : `${waPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>
              {isCustomWa
                ? '🚀 Connecté avec votre propre passerelle WhatsApp'
                : `Restant : ${waQuota?.remaining ?? '0'} message(s)`}
            </span>
            <button
              onClick={() => hasGatewayAccess ? setCurrentView('payment-config') : requestFeature('WhatsApp API & passerelle de paiement', 'STANDARD')}
              className="text-amber-700 hover:underline font-medium text-[11px]"
            >
              Gérer WhatsApp API →
            </button>
          </div>
        </div>
      </div>

      {/* Cartes Métriques Clés */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Classes</span>
            <School size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.classesCount}</div>
          <span className="text-[11px] text-slate-500">Salles actives</span>
        </div>

        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Enseignants</span>
            <GraduationCap size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {stats.teachersCount} / {limits.maxTeachers >= 999 ? 'Illimité' : limits.maxTeachers}
          </div>
          <span className="text-[11px] text-slate-500">Corps professoral</span>
        </div>

        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Recouvrement</span>
            <CreditCard size={16} className="text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
            {stats.totalRevenue.toLocaleString('fr-FR')} CDF
          </div>
          <span className="text-[11px] text-emerald-700 flex items-center gap-1">
            <CheckCircle size={11} />
            Total encaissé
          </span>
        </div>

        <div
          onClick={() => limits.medicalAccess ? setCurrentView('medical') : requestFeature('Service médical (infirmerie & santé)', getMinTierForFeature('medical'))}
          className={`border rounded-2xl p-4 shadow-sm transition cursor-pointer ${
            limits.medicalAccess
              ? 'bg-rose-50/50 border-rose-200 hover:border-rose-400'
              : 'bg-slate-50 border-dashed border-slate-300 opacity-80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium uppercase tracking-wider text-rose-800 flex items-center gap-1">
              <HeartPulse size={15} className="text-rose-600" />
              Santé Scolaire
            </span>
            {!limits.medicalAccess && (
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                PRO requis
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {limits.medicalAccess ? stats.todayVisitsCount : 'Verrouillé'}
          </div>
          <span className="text-[11px] text-slate-500">
            {limits.medicalAccess ? 'Visites infirmerie aujourd\'hui' : 'Disponible dès Professionnel'}
          </span>
        </div>
      </div>

      {/* Raccourcis Directs & Actions Rapides */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
          Actions Rapides d'Administration
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => setCurrentView('students')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition text-left group"
          >
            <Users size={18} className="text-amber-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-slate-800">Gestion Élèves</div>
            <div className="text-[10px] text-slate-500">Inscriptions & Fiches</div>
          </button>

          <button
            onClick={() => hasPersonnelAccess ? setCurrentView('personnel') : requestFeature('Personnel (profs & staff)', 'ESSENTIEL')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition text-left group"
          >
            <GraduationCap size={18} className="text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-slate-800">Personnel</div>
            <div className="text-[10px] text-slate-500">Profs & Staff</div>
          </button>

          <button
            onClick={() => setCurrentView('payments')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition text-left group"
          >
            <CreditCard size={18} className="text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-slate-800">Finances</div>
            <div className="text-[10px] text-slate-500">Caisse & Reçus</div>
          </button>

          <button
            onClick={() => hasGatewayAccess ? setCurrentView('payment-config') : requestFeature('WhatsApp API & passerelle de paiement', 'STANDARD')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition text-left group"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" className="text-[#25D366] mb-2 group-hover:scale-110 transition-transform">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            <div className="text-xs font-bold text-slate-800">WhatsApp API</div>
            <div className="text-[10px] text-slate-500">Quotas & Passerelle</div>
          </button>

          <button
            onClick={() => limits.medicalAccess ? setCurrentView('medical') : requestFeature('Service médical (infirmerie & santé)', getMinTierForFeature('medical'))}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-rose-400 hover:bg-rose-50/40 transition text-left group"
          >
            <HeartPulse size={18} className="text-rose-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-slate-800">Service Médical</div>
            <div className="text-[10px] text-slate-500">
              {limits.medicalAccess ? 'Infirmerie & Santé' : 'Offre Pro'}
            </div>
          </button>

          <button
            onClick={() => setCurrentView('settings')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition text-left group"
          >
            <Shield size={18} className="text-slate-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-slate-800">Paramètres</div>
            <div className="text-[10px] text-slate-500">École & Année</div>
          </button>
        </div>
      </div>
    </div>
  );
}
