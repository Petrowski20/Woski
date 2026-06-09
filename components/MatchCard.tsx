'use client';

import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, Users } from 'lucide-react';
import { toast } from 'sonner';
import { savePredictionAction, getPublicMatchPredictions } from '@/app/(main)/actions';
import type { PublicMatchPredictionsResult } from '@/app/(main)/actions';
import { getFlagUrl } from '@/utils/getFlagUrl';
import { useLang } from '@/contexts/LangContext';

interface Team {
  name: string;
  flag_emoji: string;
  iso_code?: string;
}

interface MatchCardProps {
  id: number;
  home: Team;
  away: Team;
  homeTeamId: number;
  awayTeamId: number;
  group: string;
  matchStage: string;
  date: string;
  status: 'PENDING' | 'PREDICTED' | 'FINISHED';
  pointsEarned?: number;
  homePrediction?: number;
  awayPrediction?: number;
  predAdvancingTeamId?: number | null;
  realAdvancingTeamId?: number | null;
  homeRealResult?: number;
  awayRealResult?: number;
  isLocked?: boolean;
  stadium?: string | null;
  referee?: string | null;
  activeLeagueId?: number | null;
  onPendingChange?: (matchId: number, draft: { homeGoals: number | null; awayGoals: number | null; advancingTeamId: number | null } | null) => void;
}

function FlagImg({ flagEmoji, name, isoCode }: { flagEmoji: string; name: string; isoCode?: string }) {
  const url = getFlagUrl(flagEmoji, isoCode);
  if (!url) {
    return (
      <span className="text-2xl leading-none select-none" role="img" aria-label={name}>
        {flagEmoji || '🏳'}
      </span>
    );
  }
  return <img src={url} alt={name} className="w-10 h-7 object-cover rounded-sm shadow-sm" />;
}

function SmallFlag({ flagEmoji, name, isoCode }: { flagEmoji: string; name: string; isoCode?: string }) {
  const url = getFlagUrl(flagEmoji, isoCode);
  if (!url) return <span className="text-sm leading-none">{flagEmoji || '🏳'}</span>;
  return <img src={url} alt={name} className="w-4 h-3 object-cover rounded-sm shrink-0" />;
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

export interface MatchCardHandle {
  confirmSaved: () => void;
}

const MatchCard = forwardRef<MatchCardHandle, MatchCardProps>(function MatchCard({
  id,
  home,
  away,
  homeTeamId,
  awayTeamId,
  group,
  matchStage,
  date,
  status,
  pointsEarned = 0,
  homePrediction,
  awayPrediction,
  predAdvancingTeamId = null,
  realAdvancingTeamId = null,
  homeRealResult,
  awayRealResult,
  isLocked = false,
  stadium,
  referee,
  activeLeagueId = null,
  onPendingChange,
}: MatchCardProps, ref) {
  const { t } = useLang();

  const initHome = homePrediction?.toString() ?? '';
  const initAway = awayPrediction?.toString() ?? '';

  const [localHome, setLocalHome]               = useState(initHome);
  const [localAway, setLocalAway]               = useState(initAway);
  const [savedHome, setSavedHome]               = useState(initHome);
  const [savedAway, setSavedAway]               = useState(initAway);
  const [localAdvancingId, setLocalAdvancingId] = useState<number | null>(predAdvancingTeamId);
  const [savedAdvancingId, setSavedAdvancingId] = useState<number | null>(predAdvancingTeamId);
  const [isSaving, setIsSaving]                 = useState(false);

  // Accordion state
  const [showAccordion, setShowAccordion]         = useState(false);
  const [accordionLoaded, setAccordionLoaded]     = useState(false);
  const [accordionLoading, setAccordionLoading]   = useState(false);
  const [accordionData, setAccordionData]         = useState<PublicMatchPredictionsResult | null>(null);

  const isKnockout = matchStage !== 'GROUP';
  const isFinished = status === 'FINISHED';

  useImperativeHandle(ref, () => ({
    confirmSaved: () => {
      setSavedHome(localHome);
      setSavedAway(localAway);
      setSavedAdvancingId(localAdvancingId);
    },
  }), [localHome, localAway, localAdvancingId]);

  const onPendingChangeRef = useRef(onPendingChange);
  useEffect(() => { onPendingChangeRef.current = onPendingChange; }, [onPendingChange]);

  useEffect(() => {
    setSavedHome(homePrediction?.toString() ?? '');
    setSavedAway(awayPrediction?.toString() ?? '');
    setSavedAdvancingId(predAdvancingTeamId ?? null);
  }, [homePrediction, awayPrediction, predAdvancingTeamId]);

  useEffect(() => {
    if (!isKnockout) return;
    const h = parseInt(localHome, 10);
    const a = parseInt(localAway, 10);
    if (!isNaN(h) && !isNaN(a) && h !== a) setLocalAdvancingId(null);
  }, [localHome, localAway, isKnockout]);

  const isTied         = localHome !== '' && localAway !== '' && localHome === localAway;
  const needsAdvancing = isKnockout && isTied;
  const isPartial      = (localHome === '') !== (localAway === '');
  const hasChanged     =
    localHome !== savedHome ||
    localAway !== savedAway ||
    (isKnockout && localAdvancingId !== savedAdvancingId);
  const canSave = hasChanged && !isPartial && !(needsAdvancing && localAdvancingId === null);

  useEffect(() => {
    if (!canSave || isLocked || isFinished) {
      onPendingChangeRef.current?.(id, null);
      return;
    }
    const bothEmpty = localHome === '' && localAway === '';
    if (bothEmpty) {
      onPendingChangeRef.current?.(id, { homeGoals: null, awayGoals: null, advancingTeamId: null });
      return;
    }
    const h = parseInt(localHome, 10);
    const a = parseInt(localAway, 10);
    if (!isNaN(h) && !isNaN(a) && h >= 0 && a >= 0) {
      onPendingChangeRef.current?.(id, { homeGoals: h, awayGoals: a, advancingTeamId: isKnockout ? localAdvancingId : null });
    } else {
      onPendingChangeRef.current?.(id, null);
    }
  }, [canSave, localHome, localAway, localAdvancingId, id, isKnockout, isLocked, isFinished]);

  const stageMap: Record<string, string> = {
    GROUP:        t('matchCard.stages.group', { group }),
    ROUND_OF_16:  t('matchCard.stages.round16'),
    QUARTER_FINAL: t('matchCard.stages.quarter'),
    SEMI_FINAL:   t('matchCard.stages.semi'),
    THIRD_PLACE:  t('matchCard.stages.third'),
    FINAL:        t('matchCard.stages.final'),
  };
  const centerLabel = isFinished
    ? t('matchCard.stages.finished')
    : (stageMap[matchStage] ?? matchStage);

  const handleClear = () => {
    setLocalHome('');
    setLocalAway('');
    setLocalAdvancingId(null);
  };

  const handleSave = async () => {
    const bothEmpty = localHome === '' && localAway === '';
    if (!bothEmpty && needsAdvancing && localAdvancingId === null) {
      toast.error(t('matchCard.errors.seleccionapenaltis'));
      return;
    }
    setIsSaving(true);
    const res = await savePredictionAction(
      id,
      bothEmpty ? null : parseInt(localHome),
      bothEmpty ? null : parseInt(localAway),
      bothEmpty ? null : (isKnockout ? localAdvancingId : null),
    );
    setIsSaving(false);
    if (res.error) {
      toast.error(t('matchCard.errors.errorPrefix') + res.error);
    } else if (bothEmpty) {
      toast.success(t('matchCard.cleared'));
      setSavedHome('');
      setSavedAway('');
      setSavedAdvancingId(null);
    } else {
      toast.success(t('matchCard.success'));
      setSavedHome(localHome);
      setSavedAway(localAway);
      setSavedAdvancingId(localAdvancingId);
    }
  };

  const handleToggleAccordion = async () => {
    if (!showAccordion && !accordionLoaded) {
      setShowAccordion(true);
      setAccordionLoading(true);
      const result = await getPublicMatchPredictions(id, activeLeagueId);
      setAccordionData(result);
      setAccordionLoaded(true);
      setAccordionLoading(false);
    } else {
      setShowAccordion(prev => !prev);
    }
  };

  const accordionTotal = accordionData && !('error' in accordionData)
    ? accordionData.type === 'global'
      ? accordionData.data.total
      : accordionData.data.length
    : 0;

  return (
    <div className="bg-gradient-to-b from-[#FFD6D1] to-[#F9ECE5] dark:from-slate-800 dark:to-slate-900 rounded-xl shadow-md overflow-hidden relative border border-[#FFD6D1] dark:border-slate-700 text-gray-900 dark:text-white">

      {/* Header */}
      <div className="bg-white/40 dark:bg-black/20 px-4 py-1.5 grid grid-cols-3 items-center gap-2">
        <span className="text-[10px] text-red-900/70 dark:text-slate-300 uppercase font-bold tracking-wider truncate">
          {referee || t('matchCard.referee')}
        </span>
        <span className="text-[11px] text-gray-900 dark:text-white font-bold uppercase tracking-widest text-center whitespace-nowrap">
          {centerLabel}
        </span>
        <span className="text-[10px] text-red-900/70 dark:text-slate-300 uppercase font-bold tracking-wider text-right truncate">
          {stadium || t('matchCard.stadium')}
        </span>
      </div>

      {/* Body */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-5 gap-3">

        {/* Local */}
        <div className="flex flex-col items-center gap-2 min-w-0">
          <div className="w-14 h-14 bg-white/60 dark:bg-white/10 rounded-full flex items-center justify-center border border-white dark:border-white/20 shadow-inner">
            <FlagImg flagEmoji={home.flag_emoji} name={home.name} isoCode={home.iso_code} />
          </div>
          <span className="text-xs font-semibold text-gray-800 dark:text-white/90 text-center leading-tight max-w-[80px] line-clamp-2">
            {home.name}
          </span>
        </div>

        {/* Marcador central */}
        <div className="flex-shrink-0">
          {isFinished ? (
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

              {isKnockout && homeRealResult === awayRealResult && realAdvancingTeamId !== null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 tracking-wide">
                  🏆 Pen.: {realAdvancingTeamId === homeTeamId ? home.name : away.name}
                </span>
              )}

              {homePrediction !== undefined && (
                <span className="text-[10px] text-gray-500 dark:text-emerald-300/70 tracking-wide">
                  {t('matchCard.tuPred')} {homePrediction}-{awayPrediction}
                  {predAdvancingTeamId !== null && (
                    <> · {t('matchCard.pasa')} {predAdvancingTeamId === homeTeamId ? home.name : away.name}</>
                  )}
                </span>
              )}
              <PointsBadge pts={pointsEarned} />
            </div>
          ) : isLocked ? (
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
              {isKnockout && savedHome === savedAway && savedHome !== '' && savedAdvancingId !== null && (
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 tracking-wide">
                  {t('matchCard.pasa')} {savedAdvancingId === homeTeamId ? home.name : away.name}
                </span>
              )}
              <span className="text-[10px] text-gray-500 dark:text-emerald-300/60 tracking-wider">
                {t('matchCard.bloqueado')}
              </span>
            </div>
          ) : (
            <div className="group relative flex flex-col items-center gap-2">
              {(localHome !== '' || localAway !== '') && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isSaving}
                  className="absolute -right-5 top-2 opacity-100 text-gray-400 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-500 transition-colors z-10"
                  aria-label="Borrar predicción"
                >
                  <X size={14} />
                </button>
              )}
              <div className="bg-white dark:bg-slate-950 rounded-lg shadow-sm border border-white/50 dark:border-slate-800 px-2 py-2 flex items-center gap-1">
                <input
                  type="number" min={0} max={99} value={localHome}
                  onChange={(e) => setLocalHome(e.target.value)}
                  onKeyDown={(e) => { if (['e','E','+','-','.',','].includes(e.key)) e.preventDefault(); }}
                  onInput={(e) => { if (e.currentTarget.value.length > 2) e.currentTarget.value = e.currentTarget.value.slice(0, 2); }}
                  disabled={isSaving} placeholder="–"
                  className="w-12 h-12 text-2xl font-black text-center text-slate-900 dark:text-white bg-transparent outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-slate-400 dark:text-slate-500 font-black text-xl px-0.5">-</span>
                <input
                  type="number" min={0} max={99} value={localAway}
                  onChange={(e) => setLocalAway(e.target.value)}
                  onKeyDown={(e) => { if (['e','E','+','-','.',','].includes(e.key)) e.preventDefault(); }}
                  onInput={(e) => { if (e.currentTarget.value.length > 2) e.currentTarget.value = e.currentTarget.value.slice(0, 2); }}
                  disabled={isSaving} placeholder="–"
                  className="w-12 h-12 text-2xl font-black text-center text-slate-900 dark:text-white bg-transparent outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {needsAdvancing && (
                <div className="flex flex-col items-center gap-1.5">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 dark:text-slate-500">
                    {t('matchCard.penaltis')}
                  </p>
                  <div className="flex gap-2">
                    {([
                      { teamId: homeTeamId, team: home },
                      { teamId: awayTeamId, team: away },
                    ] as const).map(({ teamId, team }) => (
                      <button
                        key={teamId}
                        onClick={() => setLocalAdvancingId(teamId)}
                        disabled={isSaving}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-semibold border-2 transition-all ${
                          localAdvancingId === teamId
                            ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                            : 'border-gray-200 dark:border-slate-600 bg-white/60 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600'
                        }`}
                      >
                        <SmallFlag flagEmoji={team.flag_emoji} name={team.name} isoCode={team.iso_code} />
                        {team.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visitante */}
        <div className="flex flex-col items-center gap-2 min-w-0">
          <div className="w-14 h-14 bg-white/60 dark:bg-white/10 rounded-full flex items-center justify-center border border-white dark:border-white/20 shadow-inner">
            <FlagImg flagEmoji={away.flag_emoji} name={away.name} isoCode={away.iso_code} />
          </div>
          <span className="text-xs font-semibold text-gray-800 dark:text-white/90 text-center leading-tight max-w-[80px] line-clamp-2">
            {away.name}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white/40 dark:bg-black/20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600 dark:text-emerald-300/60 tracking-wide">{date}</span>
          <button
            type="button"
            onClick={handleToggleAccordion}
            disabled={accordionLoading}
            className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors disabled:opacity-50"
          >
            <Users size={10} />
            <span>{showAccordion ? t('matchCard.ocultarApuestas') : t('matchCard.verApuestas')}</span>
          </button>
        </div>

        {!isFinished && !isLocked && (
          isPartial ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold italic">
              {t('matchCard.errors.rellenagoles')}
            </span>
          ) : canSave ? (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="text-[11px] font-bold bg-emerald-400 hover:bg-emerald-300 text-emerald-950 px-3 py-1 rounded-full transition-colors disabled:opacity-60 flex items-center gap-1"
            >
              {isSaving ? t('matchCard.guardando') : t('matchCard.guardar')}
            </button>
          ) : needsAdvancing && localAdvancingId === null ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold italic">
              {t('matchCard.seleccionaClasificado')}
            </span>
          ) : savedHome !== '' ? (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              {t('matchCard.guardado')}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-emerald-300/50 italic">
              {t('matchCard.sinPrediccion')}
            </span>
          )
        )}

        {isFinished && (
          <span className="text-[10px] text-gray-500 dark:text-emerald-300/60">
            {t('matchCard.partidoFinalizado')}
          </span>
        )}
        {!isFinished && isLocked && (
          <span className="text-[10px] text-gray-400 dark:text-emerald-300/50">
            {t('matchCard.prediccionesCerradas')}
          </span>
        )}
      </div>

      {/* Acordeón de predicciones */}
      {showAccordion && (
        <div className="bg-slate-100/60 dark:bg-slate-800/50 border-t border-black/5 dark:border-white/5 px-4 py-3">
          {accordionLoading ? (
            <p className="text-xs text-center text-gray-400 dark:text-slate-500 py-1">
              {t('matchCard.accordion.cargando')}
            </p>
          ) : !accordionData ? null : 'error' in accordionData ? (
            <p className="text-xs text-center text-red-500 dark:text-red-400 py-1">{accordionData.error}</p>
          ) : accordionData.type === 'global' ? (
            /* ── Vista global: barras de porcentaje ── */
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500 mb-1">
                {t('matchCard.accordion.globalTitle')}
                {accordionData.data.total > 0 && (
                  <span className="ml-1 normal-case font-normal">
                    · {accordionData.data.total} {accordionData.data.total === 1 ? 'apuesta' : 'apuestas'}
                  </span>
                )}
              </p>
              {accordionData.data.total === 0 ? (
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-1">
                  {t('matchCard.accordion.sinApuestas')}
                </p>
              ) : (
                [
                  { label: home.name, pct: accordionData.data.homeWinPct, color: 'bg-blue-500' },
                  { label: t('matchCard.accordion.empate'), pct: accordionData.data.drawPct, color: 'bg-gray-400 dark:bg-slate-500' },
                  { label: away.name, pct: accordionData.data.awayWinPct, color: 'bg-rose-500' },
                ].map(({ label, pct, color }) => (
                  <div key={label} className="flex items-center gap-2 text-[11px]">
                    <span className="w-14 text-right text-gray-600 dark:text-gray-400 truncate text-[10px]">{label}</span>
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-7 font-bold text-gray-700 dark:text-gray-300 text-right">{pct}%</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* ── Vista liga: lista de usuarios ── */
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500 mb-1.5">
                {t('matchCard.accordion.ligaTitle')}
                {accordionData.data.length > 0 && (
                  <span className="ml-1 normal-case font-normal">
                    · {accordionData.data.length} {accordionData.data.length === 1 ? 'apuesta' : 'apuestas'}
                  </span>
                )}
              </p>
              {accordionData.data.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-1">
                  {t('matchCard.accordion.sinApuestas')}
                </p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {accordionData.data.map((pred, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between text-[11px] py-1 border-b border-black/5 dark:border-white/5 last:border-0"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {pred.avatarUrl ? (
                          <img
                            src={pred.avatarUrl}
                            alt={pred.nickname}
                            className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[8px] font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                            {pred.nickname.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate text-gray-700 dark:text-gray-300 font-medium">{pred.nickname}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">
                          {pred.homeGoals} – {pred.awayGoals}
                        </span>
                        {pred.advancingTeamId !== null && (
                          <span className="text-[9px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1 rounded">
                            {pred.advancingTeamId === homeTeamId ? home.name : away.name}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
});

export default MatchCard;
