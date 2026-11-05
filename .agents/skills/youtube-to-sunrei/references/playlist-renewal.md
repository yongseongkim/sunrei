# Playlist Renewal

Registered playlists, their videos, collected texts, and extraction runs live
in the Sunrei DB behind `/admin/youtube/*`. A renewal run compares each
playlist with YouTube, records new videos as `PENDING`, and runs the evidence
and extraction steps for `PENDING` and `FAILED` videos without checkpoints.
Instead of creating spots, it leaves candidates for admin review. The
operator's view, with state transitions, credentials, and scheduling, is in
`.claude/scripts/youtube/AUTOMATION.md`.

## Which Command When

Register a playlist once, with the Sunrei that approved places go to:

```bash
uv run python .claude/scripts/youtube/youtube_playlists.py add PLAYLIST_ID --sunrei SUNREI_ID [--baseline all|none] [--disabled]
```

- `--baseline all` (default) records the current videos as `SKIPPED`, so only
  videos added later are processed. Use `--baseline none` when the whole
  playlist should be processed.
- `--disabled` keeps the playlist out of scheduled runs. `syncEnabled` only
  selects the playlists a run without `--playlist` processes; it starts
  nothing by itself.

Change the Sunrei or the sync flag, and list what is registered:

```bash
uv run python .claude/scripts/youtube/youtube_playlists.py update PLAYLIST_ID [--sunrei SUNREI_ID] [--enable | --disable]
uv run python .claude/scripts/youtube/youtube_playlists.py list
```

See what a run would do, without changing anything:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py [--playlist PLAYLIST_ID]
```

Run one playlist now. An explicit `--playlist` also runs a playlist whose sync
is disabled, so do not toggle `syncEnabled` for a one-off run:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py --commit --playlist PLAYLIST_ID [--max-videos N]
```

Run every playlist with `syncEnabled`, as a schedule does:

```bash
uv run python .claude/scripts/youtube/renew_playlists.py --commit [--max-videos N]
```

Run only one renewal at a time, on a machine YouTube does not block.

## Playlist Cover Storage

Registration and committed renewal copy the playlist resource's own cover
through `POST /admin/images/upload-url`. The server downloads one large cover,
resizes it while preserving its aspect ratio, and stores the variants in S3.
Save the returned `MultiSizeImageDTO` as one group in `Sunrei.images`; use the
returned URLs, widths and heights rather than the YouTube URLs.

Empty covers and an existing single cover group whose URLs match the current
YouTube playlist cover are eligible. Keep already stored S3 covers and custom
images. Upload failure leaves the previous cover intact; inspect a successful
upload or uncertain write before retrying. This does not change spots or
publication status. Source avatars and individual video covers keep their
current behavior.

To migrate existing registered playlist covers without collecting videos or
extracting places:

```bash
uv run python .claude/scripts/youtube/playlist_covers.py [--playlist PLAYLIST_ID]
uv run python .claude/scripts/youtube/playlist_covers.py [--playlist PLAYLIST_ID] --commit
```

The first command only previews eligibility: no download, upload or content
write. `SUNREI_API_URL` selects the server (production by default). Run the
commit only for the user's requested scope, then verify the saved image URLs
and dimensions. Directly customized covers and mismatched Sunrei links are
left unchanged. A cover edited during upload is reported as `kept_changed`.

## Results

- A processed video ends as `REVIEW_PENDING`, or `COMPLETED` when no
  candidate was found.
- A failed video becomes `FAILED` with its stage and error, and the next run
  retries it.
- A members-only video becomes `SKIPPED` and is not retried.
- Candidates wait as `PENDING` until an admin approves or rejects them with
  `PATCH /admin/youtube/extracted-places/{id}`. Approval adds the spot to the
  playlist's Sunrei; the collector changes only the eligible cover, never spots.
- The agents receive the metadata and one timeline window at a time, never
  the video, the raw media, or credentials.

## Reviewing Candidates

The renewal does no web research, and the extractor never guesses a name.
A venue the video doesn't name stays "상호 미확인" with no place.
- Apply the identity, branch, and approval checks in
  [geocoding and review](../../youtube-extract-locations/references/geocoding-and-review.md).
  No warning is not proof of a correct match. Research missing or conflicting
  identities, and pass the verified place in the approval.
- Show the user what you found, with YouTube links at the scene as plain URLs,
  and approve only what they accept.
- When an approved spot turns out wrong, follow
  [the existing-Sunrei update rules](../../youtube-create-sunrei/references/admin-operations.md#edit-an-existing-sunrei)
  for the complete spot list, backups, and verification before sending a PUT.
