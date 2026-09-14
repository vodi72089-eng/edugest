'use client';

import React, { useEffect, useState } from 'react';
import { useEduGestStore } from '@/lib/store';
import { authFetch } from '@/lib/store';
import { getTierLimits, TierLimits } from '@/lib/subscription';
import {
  Users, GraduationCap, School, CreditCard, MessageSquare, Shield,
  Activity, AlertTriangle, CheckCircle, ArrowUpRight, TrendingUp,
  Clock, HeartPulse, Sparkles
} from 'lucide-react';

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

  useEffect(() => {
    if (!userData?.schoolId) return;

    async function loadDashboardData() {
      try {
        setLoading(true);
        // Stats école
        const [statsRes, waRes, medicalRes] = await Promise.all([
          authFetch(`/api/stats?schoolId=${userData?.schoolId}`).catch(() => null),
          authFetch(`/api/whatsapp-config/custom?schoolId=${userData?.schoolId}`).catch(() => null),
          authFetch(`/api/medical/visits?schoolId=${userData?.schoolId}`).catch(() => null),
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
      {/* Bannière de Bienvenue */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-[oklch(22%_0.03_175)] to-[oklch(18%_0.02_250)] text-white shadow-xl">
        <div className="absolute right-0 top-0 w-96 h-96 bg-[oklch(72%_0.15_65_/_0.15)] rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-amber-300 mb-3 border border-white/10">
              <Sparkles size={13} />
              Direction Principale • {userData?.schoolName || 'Mon Établissement'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Bonjour, {userData?.name || 'Administrateur'} 👋
            </h1>
            <p className="text-white/70 text-sm mt-1 max-w-xl">
              Pilotage centralisé des effectifs, des finances, du corps pédagogique et des communications officielles.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setCurrentView('my-subscription')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition backdrop-blur-sm"
            >
              Forfait : <span className="font-bold text-amber-300">{tier}</span>
              <ArrowUpRight size={14} />
            </button>
            <button
              onClick={() => setCurrentView('students')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition shadow-lg shadow-amber-500/20"
            >
              + Inscrire un élève
            </button>
          </div>
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
              onClick={() => setCurrentView('payment-config')}
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
          onClick={() => limits.medicalAccess ? setCurrentView('medical') : setCurrentView('my-subscription')}
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
            onClick={() => setCurrentView('personnel')}
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
            onClick={() => setCurrentView('payment-config')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition text-left group"
          >
            <MessageSquare size={18} className="text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-slate-800">WhatsApp API</div>
            <div className="text-[10px] text-slate-500">Quotas & Passerelle</div>
          </button>

          <button
            onClick={() => limits.medicalAccess ? setCurrentView('medical') : setCurrentView('my-subscription')}
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
