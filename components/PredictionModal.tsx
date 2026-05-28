'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { savePredictionAction } from '@/app/(main)/actions';


export default function PredictionModal({ isOpen, onClose, match }: any) {
  const [homeGoals, setHomeGoals] = useState<string>('');
  const [awayGoals, setAwayGoals] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cargamos los datos previos si el usuario ya había votado
  useEffect(() => {
    if (isOpen && match) {
      setHomeGoals(match.myPred?.pred_home_goals?.toString() ?? '');
      setAwayGoals(match.myPred?.pred_away_goals?.toString() ?? '');
    }
  }, [isOpen, match]);

  if (!isOpen || !match) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (homeGoals === '' || awayGoals === '') {
      toast.error('⚠️ Introduce ambos resultados');
      return;
    }

    setIsSubmitting(true);
    const res = await savePredictionAction(match.id, parseInt(homeGoals), parseInt(awayGoals));
    setIsSubmitting(false);

    if (res.error) {
      toast.error('Error: ' + res.error);
      return;
    }
    toast.success('¡Predicción guardada! ⚽');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Cabecera del Modal */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Predecir Resultado</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold px-2"
          >
            ×
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <form onSubmit={handleSave} className="p-6">
          <div className="flex items-center justify-between gap-4 mb-8">
            
            {/* Equipo Local */}
            <div className="flex flex-col items-center flex-1">
              <span className="text-4xl mb-2">{match.home_team.flag_emoji}</span>
              <span className="text-sm font-semibold text-gray-700 truncate w-full text-center">{match.home_team.name}</span>
              <input
                type="number"
                min="0"
                value={homeGoals}
                onChange={(e) => setHomeGoals(e.target.value)}
                className="mt-3 w-16 h-16 text-center text-2xl font-bold text-gray-900 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="-"
                autoFocus
              />
            </div>

            <span className="text-2xl font-bold text-gray-300 mt-8">-</span>

            {/* Equipo Visitante */}
            <div className="flex flex-col items-center flex-1">
              <span className="text-4xl mb-2">{match.away_team.flag_emoji}</span>
              <span className="text-sm font-semibold text-gray-700 truncate w-full text-center">{match.away_team.name}</span>
              <input
                type="number"
                min="0"
                value={awayGoals}
                onChange={(e) => setAwayGoals(e.target.value)}
                className="mt-3 w-16 h-16 text-center text-2xl font-bold text-gray-900 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="-"
              />
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            >
              {isSubmitting ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}