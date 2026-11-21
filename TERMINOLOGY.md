# Terminology and evidence

Effective 21 November 2026. Use recognized scientific and engineering terms
for mechanisms, followed by the specific function and its evidence status.
Product names and creative identities remain useful identifiers.

## Naming rules

- Give each concept one preferred description, a plain definition and a scope.
  Retain older names as search aliases, qualified by source when ambiguous.
- Keep separate implementations and owners separate. Similar names or related
  functions do not establish that two components are interchangeable.
- Preserve exact repository paths, API names, serialized fields, database keys,
  artifact identifiers and quoted source text. A public identifier change needs
  a compatibility migration with consumer checks, not a global text replacement.
- Preserve historical manuscripts, imported originals, checksums and recorded
  results. Update active explanations and record corrections with their sources.
- Use the producer's declared type at an integration boundary. Translate legacy
  fields in one adapter and test that the consumer preserves their meaning.

## Evidence rules

Report implementation state, mathematical evidence, empirical evidence and
verification freshness separately. State the revision, inputs, assumptions,
method and observed result. Distinguish tests executed now from inherited results.
A receipt records an action or observation; its existence does not prove the
substantive claim. Proposal acceptance does not grant execution authority.

Use “optimal” only with a stated objective and proof, or say “best observed in
this comparison.” Identify a deadline for “real time.” Distinguish declared
dependencies from causal inference, replay from prediction, and simulated
results from physical measurements. A renamed component gains no new capability
or validation status. Existing review, security and release rules still apply.

## Maintaining this vocabulary

When terminology changes, update the owning definition, active documentation,
affected interfaces and relevant regression checks together. Record ambiguous
aliases and unresolved ownership explicitly. Introduce an implementation or
performance change only when supported by a concrete defect or measured need.
