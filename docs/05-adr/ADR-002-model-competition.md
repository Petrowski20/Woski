# ADR-002: Model competitions independently from their organizers

**Status:** Accepted

**Date:** 2026-07-21

---

## Context

During the design of the generic domain model, several competition structures were analysed.

Traditional sports, esports and future competitions use different organizational hierarchies.

Examples include:

FIFA → World Cup
UEFA → Champions League
Riot Games → Worlds / MSI / LEC
Valorant Champions Tour → EMEA / Pacific / Americas

An initial idea was to model these hierarchies explicitly.

However, doing so would introduce additional entities and relationships without providing any benefit to the prediction platform.

---

## Decision

Woski models every prediction-capable competition as an independent Competition.

Examples:

Organizer Competition
FIFA World Cup
UEFA Champions League
Riot Worlds
Riot LEC
Riot MSI
Riot LCK
Riot LPL
Riot LCS
Riot LTA
Riot LCP
Riot First Stand
Riot EWC
Riot VALORANT Champions
Riot VCT EMEA
Riot VCT Pacific
Riot VCT Americas

## The organizer is considered metadata rather than part of the domain model.

## Rationale

Users do not predict tournaments because of their organizational hierarchy. They predict competitions.

- Simpler domain model.
- Simpler API.
- Simpler frontend.
- Easier navigation.
- Easier filtering.
- Easier onboarding.

---

## Consequences

### Positive

- Fewer entities.
- Lower complexity.
- Easier queries.
- Easier migrations.
- Easier expansion.

### Negative

- Competition hierarchies are not explicitly represented.
- Organizers are informational rather than structural.
- Future grouping features may require additional metadata.

---

## Alternatives Considered

## Model organizers explicitly

FIFA
↓
World Cup

Rejected.

## Generic hierarchy

Organization

↓

Series

↓

Competition

↓

Edition

Rejected.

Too abstract for current requirements.

## Competition as root entity

Accepted.

---

## Future Considerations

Formula 1 and other non-match-based competitions are intentionally out of scope for this decision.
If future requirements demand explicit competition hierarchies, this decision may be revisited through a new ADR.

## Examples

Football

Competition
└── FIFA World Cup

Edition
└── 2030
League of Legends

Competition
└── Worlds

Edition
└── 2027
League of Legends

Competition
└── LEC

Edition
└── Spring 2027
VALORANT

Competition
└── VCT EMEA

Edition
└── 2027
