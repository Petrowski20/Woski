'use client';

import MatchCard from './MatchCard';

export default function MatchGrid({ matches }: { matches: any[] }) {
  return (
    <div className="flex flex-col gap-4">
      {matches.map((match) => {
        const formattedDate = new Intl.DateTimeFormat('es-ES', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        }).format(new Date(match.match_date));

        let status: 'PENDING' | 'PREDICTED' | 'FINISHED' = 'PENDING';
        if (match.status === 'FINISHED') status = 'FINISHED';
        else if (match.myPred) status = 'PREDICTED';

        const isLocked = new Date(match.match_date).getTime() - Date.now() < 3600000;

        return (
          <MatchCard
            key={match.id}
            id={match.id}
            home={match.home_team}
            away={match.away_team}
            group={match.group_letter ?? '?'}
            matchStage={match.stage ?? 'GROUP'}
            date={formattedDate}
            status={status}
            isLocked={isLocked || match.status === 'FINISHED'}
            homePrediction={match.myPred?.pred_home_goals}
            awayPrediction={match.myPred?.pred_away_goals}
            homeRealResult={match.home_goals}
            awayRealResult={match.away_goals}
            pointsEarned={match.myPred?.points_earned ?? 0}
            stadium={match.stadium}
            referee={match.referee}
          />
        );
      })}
    </div>
  );
}
