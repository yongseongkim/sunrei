# Visual Evidence and Historical Locations

Use this when text does not identify the venue, a pin conflicts with the
filmed premises, or an old video differs from today's web and map results.
It applies to YouTube and Instagram. Escalate the uncertain scenes rather
than running every optional vision method on every video.

## Review the scene

The YouTube renewal OCR helper samples the lower 30% of the image. The
Instagram reel helper reads the full frame. Headless extraction receives text
events and metadata. For an unresolved venue, branch, or action, give the
image-capable reviewer the original media, source times and question.
Use the installed `video-analysis` skill's frame inspection instructions
to inspect the scene and preserve the actual timestamp, including the offset
of any excerpt. When a logo or a chain sign recurs, compare the entrance,
menu, or address with adjacent frames before identifying the premises.

If image review is available, inspect the actual frames together with timed
speech and OCR. Record visible details separately from inferred premises or
branch identity. A visible brand does not establish which facility was filmed.
Do not use a text-only model's imagined image description as an observation.
See the [worked cases](../examples/place-resolution.md) for branch decisions.

Save the finding and reuse it rather than resending unchanged images. Add
images only when a specific missing view could resolve the question; keep
the candidate unresolved when further images would add no useful evidence.
Record image count and actual token usage when available; OCR runtime alone
does not establish LLM cost.

Check program logos and neighboring signs before accepting an OCR name
match, and retain aliases actually observed in the content. Fixed-text
filtering can discard a real venue sign along with watermarks.
Revisit frames when the remaining OCR lacks the name. Instagram's OCR helper
can merge repeated text across separated appearances: its start/end range
does not establish continuous presence or the correct visit's start time.

Use object detection when finding the useful crop is a demonstrated
bottleneck. Check whether the chosen model actually supports signs, menus,
or the desired regions; generic object labels and food categories do not
identify a venue. Open-vocabulary detection can propose regions, but its
labels still need inspection. Benchmark useful clues retained, wrong-place
matches, unresolved cases, review time, and compute cost against contact-sheet
review before making a detector a required pipeline stage.

## Reconstruct the Place at the Time of Filming

Keep four dates separate: filming/visit date, upload date, a web source's
publication or described visit date, and the date you checked it. An upload
date is not automatically the filming date, and a newly updated page can
describe an old visit. Leave unknown dates unknown or record an evidenced
range; do not manufacture a precise date.

Build candidate identities from the content's clues: the sign and aliases,
branch, chef, phone number, menu, street/building, nearby businesses, and
episode reference. Search in the region's language, combining those clues
with the show/episode and, where useful, year, previous address, relocation,
closure, or renaming terms. An unnamed venue first needs identity research;
do not geocode a descriptive category and accept Google's nearest business.

Use sources to answer the questions they can establish:

| Question | Useful evidence |
| --- | --- |
| Which premises does the video show? | Its frames and speech, creator's episode details, contemporary visit reports tied to that episode |
| Was the business moved, renamed, closed, or operating another branch? | Dated owner notices, official business pages, dated visit reports and photos that connect the old and new identities |
| Where is it operating now? | Recent owner information and the correct branch's current map listing, checked against its address |

Read the source pages beyond search snippets. For each useful claim, keep its
URL, the relevant date, and what fact it supports or contradicts. Several
pages copying one program summary are not independent confirmations. A recent
map listing proves neither that the video visited it nor that a different
branch moved there. Search-result absence alone does not establish closure.

Compare the video with reference photos from the relevant period. A different
interior today may reflect renovation or relocation; a visual mismatch alone
does not settle identity. A shared brand name does not merge a production
facility, tasting room, shop, and restaurant. Phone numbers and chefs help
connect candidates but can persist after a move or across branches.

For a known Google place ID, a targeted Place Details (New) check can request
`id,displayName,formattedAddress,location,businessStatus,movedPlace,movedPlaceId`.
The Details field mask uses these names without a `places.` prefix. A moved
listing can be marked `CLOSED_PERMANENTLY` while linking to its next location;
follow that link when needed and stop on a cycle or conflicting identity.
Missing move data is not proof that no move happened. Keep this evidence
separate from the decision about where the historical scene should be pinned.

## Decide and Record the Mapping

Distinguish the filmed location from the business's current destination.
Record whether the evidence supports the same premises, relocation, another
branch, renaming, closure, or unresolved identity. Keep competing candidates
and the reason each was accepted or held.

Apply the user's established mapping choice. When no choice exists and
filming-site versus current-business mapping would send visitors to different
places, present both with the evidence and resolve that choice before changing
the pin. A new address is not an automatic correction to a filming location.
Keep closed filming places as historical records under the project's closure
rules; a successor business at the old address is not the filmed venue.

Save a review record keyed by content ID and scene or post, including:

- Observed visual/text clues and timestamps; inferred claims kept distinct.
- Filming date or range, upload date, and each web source's relevant dates.
- Filmed and current names/addresses, branch relationship, and conflicting evidence.
- Source URLs and the claim each supports, plus alternative candidates.
- Chosen pin and Google ID, the user's mapping decision, unresolved questions,
  and the specific evidence needed to revisit a hold.

These are review metadata, not new fields to send blindly to the Sunrei API.
Keep them in the review workspace and consult them when reprocessing the
content. Put verified relocation or closure facts useful to visitors in the
public context, while search conflicts and reasoning stay in review notes.
Use the existing geocoding and save rules for the verified pin. Preserve
publication state and do not approve unresolved candidates merely to finish
a batch. Keep textual findings and source references; remove temporary
inspection media after recording the result unless the user asks to keep it.

## Technical References

- [PySceneDetect detectors](https://www.scenedetect.com/docs/latest/api/detectors.html): shot proposals from content, adaptive, histogram, or hash comparisons.
- [OpenCV histogram comparison](https://docs.opencv.org/4.x/d8/dc8/tutorial_histogram_comparison.html): frame-content similarity measures.
- [OpenCV perspective transforms](https://docs.opencv.org/4.x/da/d6e/tutorial_py_geometric_transformations.html): rectifying planar crops.
- [OpenCV matching and homography](https://docs.opencv.org/4.x/d1/de0/tutorial_py_feature_homography.html): geometric verification of candidate image matches.
- [Object-detector outputs](https://docs.ultralytics.com/tasks/detect/), [Grounding DINO](https://github.com/IDEA-Research/GroundingDINO): box/class predictions and text-conditioned region proposals.
- [Google moved-place details](https://developers.google.com/maps/documentation/places/web-service/place-details#get_place_details_for_a_moved_place): interpreting closure and relocation links.
