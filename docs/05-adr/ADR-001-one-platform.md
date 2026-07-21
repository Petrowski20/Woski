# ADR-001: Evolve PollaMundialista into Woski

**Status:** Accepted

**Date:** 2026-07-20

---

## Context

PollaMundialista was originally developed as a Minimum Viable Product (MVP) during the 2026 FIFA World Cup.

Although it solved a real problem for a group of friends, its primary purpose was to validate the core concept behind a much larger project.

The World Cup was chosen because it naturally attracted more participants than our usual League of Legends prediction games, making it an ideal environment to test:

- User adoption.
- Private leagues.
- Authentication.
- Prediction workflow.
- Scoring system.
- Platform stability under a larger number of users.

Once the tournament ended, the MVP had successfully achieved its goal.

The next question was whether to build separate applications for League of Legends, VALORANT and future competitions, or evolve the existing application into a more generic platform.

The World Cup was intentionally chosen as the first implementation because it represented the largest expected audience, making it the best opportunity to validate the platform under real-world conditions.

---

## Decision

The existing application will evolve into **Woski**, a single platform capable of supporting multiple sports and esports competitions.

Rather than creating independent applications, the current codebase will be progressively generalized and expanded.

The original World Cup implementation becomes the first supported competition within the platform.

---

## Rationale

The MVP demonstrated that the core concept works.

Building separate applications would duplicate infrastructure, authentication, user management, prediction logic and deployment.

A single platform provides a better long-term architecture while allowing the existing implementation to be reused.

This approach also establishes Woski as a product instead of a single-event application.

---

## Consequences

### Positive

- Reuse of the existing codebase.
- Single authentication system.
- Single deployment.
- Shared infrastructure.
- Consistent user experience.
- Easier maintenance.
- Foundation for future competitions.

### Negative

- The current data model must become more generic.
- Existing football-specific concepts need to be redesigned.
- The migration requires careful planning to avoid unnecessary rewrites.

---

## Alternatives Considered

### Build a new application for each competition

Rejected because it would duplicate development effort, maintenance and infrastructure.

### Rewrite everything from scratch

Rejected because the existing MVP already proved the concept and contains valuable, reusable code.

### Keep PollaMundialista as a football-only application

Rejected because it limits the long-term vision of the project and prevents code reuse across competitions.

---

## Future Considerations

This decision influences the future design of:

- Domain model.
- Database schema.
- Frontend navigation.
- Competition system.
- Scoring engine.
- Public APIs.
