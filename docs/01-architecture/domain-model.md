# Domain Model

## Purpose

This document defines the business domain of Woski.

It describes the core concepts of the platform and the relationships between them without considering implementation details such as databases, APIs or frontend components.

The goal is to establish a common language that will be used across the entire project.

---

# Domain Overview

```
Sport
│
├── Competition
│     │
│     ├── Edition
│     │      │
│     │      ├── Phase
│     │      │      │
│     │      │      └── Match
│     │      │              │
│     │      │              └── Game (optional)
│     │      │
│     │      └── Teams
│     │
│     └── Ruleset
│
└── Community Pool
        │
        ├── Members
        ├── Predictions
        └── Rankings
```

---

# Domain Concepts

## Sport

A sport represents the highest-level category supported by Woski.

Examples:

- Football
- League of Legends
- VALORANT

A Sport defines common behaviour shared across its competitions.

Examples:

- Match format
- Default scoring system
- Supported prediction types

---

## Competition

A competition is a recurring tournament or league.

Examples:

- FIFA World Cup
- UEFA Euro
- Worlds
- MSI
- LEC

A competition exists independently of any particular year.

---

## Edition

An edition represents one occurrence of a competition.

Examples:

- FIFA World Cup 2030
- Worlds 2026
- LEC 2027 Season

Each edition has:

- Start date
- End date
- Participating teams
- Match schedule

---

## Phase

A phase divides an edition into logical sections.

Examples:

Football

- Group Stage
- Round of 16
- Quarter Finals

League of Legends

- Swiss Stage
- Playoffs
- Spring Split
- Summer Split

The exact phases depend on the competition.

---

## Match

A match is the unit on which users make predictions.

Examples:

Spain vs France

T1 vs Gen.G

A match belongs to exactly one phase.

---

## Game

Some matches are composed of multiple games.

Example:

T1 vs Gen.G

Game 1

Game 2

Game 3

Football matches usually consist of a single game and therefore do not require this entity.

---

## Team

Represents a competing team.

Examples:

Spain

France

T1

Fnatic

A team may participate in many competition editions.

---

## Community Pool

A Community Pool is a group where users compete against each other.

Members join a pool rather than a competition directly.

A pool may follow one or more competitions depending on future product evolution.

---

## Prediction

A prediction represents a user's forecast for a match.

Initially Woski supports only match result predictions.

Future versions may introduce additional prediction types.

---

## Ruleset

A Ruleset defines how points are awarded.

Examples:

Classic Football

Winner Only

Best of Five

Each competition edition references one Ruleset.

---

# Relationships

One Sport contains many Competitions.

One Competition contains many Editions.

One Edition contains many Phases.

One Phase contains many Matches.

One Match may contain multiple Games.

Users join Community Pools.

Community Pools contain Predictions.

Predictions belong to Matches.

Rulesets determine how Predictions are scored.

---

# Open Questions

The following topics still require design decisions.

- Should Community Pools support multiple competitions?
- Should teams be global or edition-specific?
- Should phases support nested phases?
- How should custom Rulesets inherit from sport defaults?
- Should predictions support future prediction types beyond match results?
