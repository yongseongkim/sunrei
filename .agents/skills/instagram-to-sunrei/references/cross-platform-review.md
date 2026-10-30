# Cross-Platform Place Review

Use this when comparing Instagram posts with YouTube or consolidating their
existing Sunrei spots. Keep the requested accounts, series, dates, exclusions,
and source preference explicit. Prefer YouTube over Instagram only when that
is the user's chosen policy.

## Find the Content Before Deciding It Is Missing

Existing Sunrei spots are an index of saved places, not all available videos.
Check the channel's uploads and relevant playlist contents as well. An upload
can be missing from its expected playlist, and a series can have episodes on
another official or collaborating channel. Follow the post's own episode,
creator, and series links to look there.

Record which uploads, playlists, and external channels were checked. Say
"not found in the checked sources" when the search is bounded. Do not claim
that no YouTube video exists because the DB has no spot for it. Do not invent
playlist membership for a verified upload that is absent from the playlist;
adding its spot directly to an existing Sunrei is a separate reviewed change.

## Match the Place and the Content

Distinguish a full episode, a reposted Short or reel, a compilation, a teaser,
and a talk clip that only mentions the venue. Similar titles or dishes alone
do not establish that the same venue or branch is visited. Use episode
references, signs, the named people, addresses, or distinctive scenes to tie
the content to the place. An Instagram location tag can corroborate a branch
but a neighborhood tag supplies only area context.

For compilations, review each venue separately. Under an individual-video
preference, keep the compilation as the source for venues with no verified
individual introduction. Do not replace all its places with one video's
venue. A teaser or passing mention does not prove a filmed visit.

Verify the exact filmed premises and any relocation using
[geocoding and review](../../youtube-extract-locations/references/geocoding-and-review.md#filmed-premises-moves-and-missing-listings).
Keep each place's food, activities, and comments within its own scene when
consolidating sources.

Confirm each saved YouTube scene link against timed evidence or frames. A
metadata evidence time of zero, a keyword-search hit, or a matching comment
does not supply the scene's start time. Inspect a short excerpt if needed;
keep the textual finding and remove temporary inspection media afterwards.

## Save Only the Reviewed Changes

Create a change list identifying the target Sunreis, additions, repoints,
duplicate removals, and items held. Apply existing explicit decisions without
asking for them again. Leave uncertain branches and other pending candidates
out of the write batch.

When replacing Instagram with YouTube under the agreed preference, save and
verify the YouTube spot first, then remove only its approved duplicates.
Keep exclusions in the review record so a later extraction does not silently
restore them. Preserve original post records and the pre-edit spot payloads.
Use the [admin update rules](../../youtube-create-sunrei/references/admin-operations.md)
for backups, full-list PUTs, retries, and verification.

## Report the Actual State

Separate these outcomes: evidence collected, candidates extracted, locations
reviewed, spots saved, and Sunreis published. Give counts for the completed
batch and list unresolved locations, unprocessed posts or playlists, and any
source migration left undone. Include full source URLs in review material and
the admin links for saved changes. Preserve evidence and upload backups in
the project workspace rather than an expiring temporary directory.
