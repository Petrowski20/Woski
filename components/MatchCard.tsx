'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { savePredictionAction } from '@/app/(main)/actions';
import { getFlagUrl } from '@/utils/getFlagUrl';

interface Team {
  name: string;
  flag_emoji: string;
}

interface MatchCardProps {
  id: number;
  home: Team;
  away: Team;
  group: string;
  matchStage: string;
  date: string;
  status: 'PENDING' | 'PREDICTED' | 'FINISHED';
  pointsEarned?: number;
  homePrediction?: number;
  awayPrediction?: number;
  homeRealResult?: number;
  awayRealResult?: number;
  isLocked?: boolean;
  stadium?: string | null;
  referee?: string | null;
}

function formatStageLabel(matchStage: string, group: string, isFinished: boolean): string {
  if (isFinished) return 'FINALIZADO';
  const map: Record<string, string> = {
    GROUP:        `GRUPO ${group}`,
    ROUND_OF_16:  'OCTAVOS',
    QUARTER_FINAL:'CUARTOS',
    SEMI_FINAL:   'SEMIFINAL',
    THIRD_PLACE:  '3.er PUESTO',
    FINAL:        'GRAN FINAL',
  };
  return map[matchStage] ?? matchStage;
}

function PointsBadge({ pts }: { pts: number }) {
  if (pts === 0)
    return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/25 dark:text-red-300 dark:border-red-500/30">0 pts</span>;
  if (pts === 1)
    return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-orange-500/25 dark:text-orange-300 dark:border-orange-500/30">+1 pt</span>;
  if (pts === 2)
    return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-yellow-500/25 dark:text-yellow-300 dark:border-yellow-500/30">+2 pts</span>;
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 dark:bg-emerald-400/25 dark:text-emerald-300 dark:border-emerald-400/30">+{pts} pts</span>;
}

export default function MatchCard({
  id,
  home,
  away,
  group,
  matchStage,
  date,
  status,
  pointsEarned = 0,
  homePrediction,
  awayPrediction,
  homeRealResult,
  awayRealResult,
  isLocked = false,
  stadium,
  referee,
}: MatchCardProps) {
  const initHome = homePrediction?.toString() ?? '';
  const initAway = awayPrediction?.toString() ?? '';

  const [localHome, setLocalHome] = useState(initHome);
  const [localAway, setLocalAway] = useState(initAway);
  // Track saved baseline so hasChanged resets after save without full re-render
  const [savedHome, setSavedHome] = useState(initHome);
  const [savedAway, setSavedAway] = useState(initAway);
  const [isSaving, setIsSaving] = useState(false);

  const isFinished = status === 'FINISHED';
  const hasChanged = localHome !== savedHome || localAway !== savedAway;
  const centerLabel = formatStageLabel(matchStage, group, isFinished);

  const handleSave = async () => {
    if (localHome === '' || localAway === '') {
      toast.error('Rellena ambos goles');
      return;
    }
    setIsSaving(true);
    const res = await savePredictionAction(id, parseInt(localHome), parseInt(localAway));
    setIsSaving(false);
    if (res.error) {
      toast.error('Error: ' + res.error);
    } else {
      toast.success('¡Predicción guardada! ⚽');
      setSavedHome(localHome);
      setSavedAway(localAway);
    }
  };

  return (
    <div className="bg-gradient-to-b from-[#FFD6D1] to-[#F9ECE5] dark:from-slate-800 dark:to-slate-900 rounded-xl shadow-md overflow-hidden relative border border-[#FFD6D1] dark:border-slate-700 text-gray-900 dark:text-white">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="bg-white/40 dark:bg-black/20 px-4 py-1.5 grid grid-cols-3 items-center gap-2">
        <span className="text-[10px] text-red-900/70 dark:text-slate-300 uppercase font-bold tracking-wider truncate">
          {referee || 'Árbitro por asignar'}
        </span>
        <span className="text-[11px] text-gray-900 dark:text-white font-bold uppercase tracking-widest text-center whitespace-nowrap">
          {centerLabel}
        </span>
        <span className="text-[10px] text-red-900/70 dark:text-slate-300 uppercase font-bold tracking-wider text-right truncate">
          {stadium || 'Estadio por definir'}
        </span>
      </div>

      {/* ── Body: Equipo · Marcador · Equipo ─────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-5 gap-3">

        {/* Local */}
        <div className="flex flex-col items-center gap-2 min-w-0">
          <div className="w-14 h-14 bg-white/60 dark:bg-white/10 rounded-full flex items-center justify-center border border-white dark:border-white/20 shadow-inner">
            <img src={getFlagUrl(home.flag_emoji)} alt={home.name} className="w-10 h-7 object-cover rounded-sm shadow-sm" />
          </div>
          <span className="text-xs font-semibold text-gray-800 dark:text-white/90 text-center leading-tight max-w-[80px] line-clamp-2">
            {home.name}
          </span>
        </div>

        {/* Marcador central */}
        <div className="flex-shrink-0">
          {isFinished ? (
            /* Resultado oficial */
            <div className="flex flex-col items-center gap-1">
              <div className="bg-white rounded-xl shadow-inner px-4 py-2 flex items-center gap-2">
                <span className="text-3xl font-black text-slate-900 w-8 text-center tabular-nums">
                  {homeRealResult ?? '?'}
                </span>
                <span className="text-slate-400 font-black text-2xl">-</span>
                <span className="text-3xl font-black text-slate-900 w-8 text-center tabular-nums">
                  {awayRealResult ?? '?'}
                </span>
              </div>
              {homePrediction !== undefined && (
                <span className="text-[10px] text-gray-500 dark:text-emerald-300/70 tracking-wide">
                  Tu pred: {homePrediction}-{awayPrediction}
                </span>
              )}
              <PointsBadge pts={pointsEarned} />
            </div>
          ) : isLocked ? (
            /* Bloqueado */
            <div className="flex flex-col items-center gap-1">
              <div className="bg-white/50 dark:bg-white/10 rounded-xl px-4 py-2 flex items-center gap-2 border border-gray-200 dark:border-white/20">
                <span className="text-2xl font-black text-gray-500 dark:text-white/60 w-7 text-center tabular-nums">
                  {savedHome || '?'}
                </span>
                <span className="text-gray-400 dark:text-white/40 font-black text-xl">-</span>
                <span className="text-2xl font-black text-gray-500 dark:text-white/60 w-7 text-center tabular-nums">
                  {savedAway || '?'}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 dark:text-emerald-300/60 tracking-wider">🔒 Bloqueado</span>
            </div>
          ) : (
            /* Inputs editables */
            <div className="bg-white dark:bg-slate-950 rounded-lg shadow-sm border border-white/50 dark:border-slate-800 px-2 py-2 flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={99}
                value={localHome}
                onChange={(e) => setLocalHome(e.target.value)}
                onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }}
                onInput={(e) => { if (e.currentTarget.value.length > 2) e.currentTarget.value = e.currentTarget.value.slice(0, 2); }}
                disabled={isSaving}
                placeholder="–"
                className="w-12 h-12 text-2xl font-black text-center text-slate-900 dark:text-white bg-transparent outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-slate-400 dark:text-slate-500 font-black text-xl px-0.5">-</span>
              <input
                type="number"
                min={0}
                max={99}
                value={localAway}
                onChange={(e) => setLocalAway(e.target.value)}
                onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }}
                onInput={(e) => { if (e.currentTarget.value.length > 2) e.currentTarget.value = e.currentTarget.value.slice(0, 2); }}
                disabled={isSaving}
                placeholder="–"
                className="w-12 h-12 text-2xl font-black text-center text-slate-900 dark:text-white bg-transparent outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          )}
        </div>

        {/* Visitante */}
        <div className="flex flex-col items-center gap-2 min-w-0">
          <div className="w-14 h-14 bg-white/60 dark:bg-white/10 rounded-full flex items-center justify-center border border-white dark:border-white/20 shadow-inner">
            <img src={getFlagUrl(away.flag_emoji)} alt={away.name} className="w-10 h-7 object-cover rounded-sm shadow-sm" />
          </div>
          <span className="text-xs font-semibold text-gray-800 dark:text-white/90 text-center leading-tight max-w-[80px] line-clamp-2">
            {away.name}
          </span>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <div className="bg-white/40 dark:bg-black/20 px-4 py-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-600 dark:text-emerald-300/60 tracking-wide">{date}</span>

        {!isFinished && !isLocked && (
          hasChanged ? (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="text-[11px] font-bold bg-emerald-400 hover:bg-emerald-300 text-emerald-950 px-3 py-1 rounded-full transition-colors disabled:opacity-60 flex items-center gap-1"
            >
              {isSaving ? '⏳ Guardando…' : '💾 Guardar'}
            </button>
          ) : savedHome !== '' ? (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              ✓ Guardado
            </span>
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-emerald-300/50 italic">Sin predicción</span>
          )
        )}

        {isFinished && (
          <span className="text-[10px] text-gray-500 dark:text-emerald-300/60">Partido finalizado</span>
        )}
        {!isFinished && isLocked && (
          <span className="text-[10px] text-gray-400 dark:text-emerald-300/50">Predicciones cerradas</span>
        )}
      </div>

    </div>
  );
}
