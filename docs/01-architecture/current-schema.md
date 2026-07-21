# Current Database Schema

## Purpose

This document describes the current database schema used by the original World Cup MVP.

Its purpose is to identify reusable concepts, football-specific implementations and areas that require redesign before evolving the platform into Woski.

This document reflects the current implementation, not the desired target architecture.

---

## Overview

The current schema was designed specifically for the **2026 FIFA World Cup** MVP.

Its primary objective was to validate the platform with real users during a live tournament rather than provide a generic solution.

The application was successfully used by approximately **25 active users** throughout the competition.

The MVP validated several key aspects of the platform:

- User authentication.
- Private leagues.
- Match predictions.
- Automatic scoring.
- Live rankings.
- Player profiles.
- Historical ranking snapshots.

All entities defined in the schema were used during the tournament.

The current implementation fulfilled the requirements of the MVP and proved that the overall concept is viable.

---

## Existing Entities

| Entity           | Purpose                                      | Reusable                       |
| ---------------- | -------------------------------------------- | ------------------------------ |
| Profiles         | User profiles                                | ✅                             |
| ProfileLeagues   | Membership between users and private leagues | ✅                             |
| Predictions      | User match predictions                       | ✅                             |
| Matches          | Football matches                             | ⚠️ Requires generalization     |
| Teams            | National teams                               | ⚠️ Requires generalization     |
| Players          | Team players                                 | ⚠️ Sport-specific              |
| PrivateLeagues   | User groups                                  | ⚠️ Naming and scope may evolve |
| RankingSnapshots | Historical ranking positions                 | ✅                             |

---

## Football-specific Concepts

Although much of the schema can be reused, several concepts are tightly coupled to football.

Examples include:

- Group letters.
- Goals scored.
- Goal difference.
- FIFA ranking.
- Confederations.
- World Cups won.
- Team managers.
- Knockout advancement.

These concepts are not incorrect.

They simply represent football-specific metadata that should not exist in the generic domain model.

Future versions should isolate sport-specific information without removing support for it.

---

## Reusable Concepts

Several parts of the MVP can be preserved with little or no modification.

These include:

- User authentication.
- User profiles.
- Private leagues (conceptually).
- Predictions.
- Historical rankings.
- Ranking calculations.
- Team information pages (fed by different data sources depending on the sport).

These concepts represent the core of the platform and will remain part of Woski.

---

## Technical Debt

The current schema intentionally prioritizes delivery of a football MVP over long-term flexibility.

Known limitations include:

- Teams contain both permanent information and tournament-specific statistics.
- No concept of Sport exists.
- No concept of Competition exists.
- No concept of Competition Edition exists.
- Match structure assumes football-specific rules.
- Scoring rules are implemented in application logic rather than configurable RuleSets.

During the World Cup, one of the most challenging areas was maintaining live rankings while allowing administrators to manually enter or modify predictions on behalf of users.

This highlighted the need for a more robust scoring and recalculation architecture.

---

## Migration Candidates

### Direct Migration

These entities can be migrated with little or no modification.

- Profiles
- ProfileLeagues
- Predictions
- RankingSnapshots

### Requires Transformation

These entities should evolve while preserving existing data.

- Teams
- Matches
- PrivateLeagues

### Requires Redesign

These concepts should be redesigned before supporting additional sports.

- Players
- Competition-specific metadata

---

## Open Questions

- Should private leagues evolve into a more generic concept?
- How should sport-specific metadata be represented?
- Should teams exist independently from competition editions?
- How should competitions spanning different calendar formats be modeled?
- Should rankings become event-driven instead of recalculated?

---

## Related Documents

- domain-model.md
- target-schema.md
- ADR-001-evolve-pollamundialista-into-woski.md
