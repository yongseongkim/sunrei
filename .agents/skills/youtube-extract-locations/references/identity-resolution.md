# Resolve Identity Before Google Places

Use in Phase 4. Web research to identify a destination is different from a
Places Text Search to attach coordinates. Google web search can be part of
identity research; a top Maps business result cannot fill an identity gap.

## Make a Decision for Each Candidate

| Decision | Required evidence | Next action |
| --- | --- | --- |
| Ready for lookup | A source-backed venue name/alias and enough region or premises detail to distinguish the visit | Resolve its creator pin or search that named target, then verify the result |
| Needs research | A real destination, but an uncertain name, branch, address, or relationship between sources | Research the missing fact from source clues; no speculative Places query |
| Held | Research/access limits leave a material identity conflict unresolved | Preserve the candidate, alternatives, and evidence needed to resume |
| Excluded | The content does not introduce a destination within the requested scope | Keep the reason; do not create a map match |

These labels are local review decisions. They do not replace DB video or
candidate statuses. Needs research is an in-progress routing state; a worker
that exits without resolving it returns held with the missing fact. The final
identity handoff uses ready/held/excluded only. Being ready for lookup is not
a verified map match.

## The Gate

Before Places Text Search, answer all three questions:

1. **Which place?** Its venue, building, street or natural-feature name is
   present in the content or supported by research tied to this visit. Preserve source
   spellings and confirmed aliases. A dish, address fragment, product brand,
   generic category, or plausible ASR reconstruction is not a resolved name.
2. **Which premises?** Region, branch, exact address, or other visit-specific
   evidence distinguishes it from competing locations. A unique independent
   venue plus city can suffice; a chain with several possible branches cannot.
3. **What remains contradictory?** No unresolved name/branch/region conflict
   would send the visitor to another destination. Record spelling differences
   that were resolved and the evidence that resolved them.

A direct creator link can reveal the target identity without a name search.
Resolve that specific link and read its listing as source evidence; compare
it with the visit before declaring the identity ready. If it identifies a
different branch or today's moved listing, keep the conflict open.

A genuine number-leading business name remains intact. A query guard's
rejection is a tool limitation, not evidence that the name is an address.
Check the source name, then make a direct named lookup when the gate passes.

## Research the Missing Fact

Start with the title's theme, description/creator venue block, spoken or
visible name, location tag, menu, chef, phone, street/building, neighboring
signs, show/episode, and relevant dates. Search combinations of observed
clues; do not add a guessed business name and then treat matching pages as
independent evidence for that guess.

Confirm native spellings against the source or a page tied to the visit.
Use official business/branch information and regional maps/reviews. In Korea,
Naver/Kakao can clarify branches or address history; in Japan, native-name
business pages and local review sites can resolve romanizations. Read pages
beyond snippets. Keep URLs, relevant dates, and the claim each supports.
Several copies of the same creator post are one underlying source.

For a branch/address conflict, ask what would distinguish the alternatives:
a branch sign, matching phone, dated location notice, visit-specific menu,
or neighboring facade. Use local full-frame OCR before selective image review
when useful; follow [visual and historical review](visual-and-historical-review.md).
Do not manufacture an image observation from transcript or OCR text.

If the location remains unnamed or several branches remain plausible, hold
it. Source unavailability and search absence do not prove a venue does not
exist. A generic chain-wide product review need not produce any branch.

## Historical Identity

Separate filming/visit date, upload date, source publication/visit date, and
research date. A later comment or map address may describe a move; it may
also describe another branch or contain a copied error. Verify that relation.
An upload after a closure does not establish the filming date.

Keep filmed and current premises separate and apply the user's established
mapping choice. If the choice would send visitors to different places and
has not been settled, hold the mapping and present both. A successor tenant
at the old address is not the filmed venue. Confirmed closed filming places
remain historical records under the project's closure rules.
