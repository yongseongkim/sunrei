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

## Results

- A processed video ends as `REVIEW_PENDING`, or `COMPLETED` when no
  candidate was found.
- A failed video becomes `FAILED` with its stage and error, and the next run
  retries it.
- A members-only video becomes `SKIPPED` and is not retried.
- Candidates wait as `PENDING` until an admin approves or rejects them with
  `PATCH /admin/youtube/extracted-places/{id}`. Approval adds the spot to the
  playlist's Sunrei; the collector itself never changes a Sunrei.
- The agents receive the metadata and one timeline window at a time, never
  the video, the raw media, or credentials.

## Reviewing Candidates

The renewal does no web research, and the extractor never guesses a name.
A venue the video doesn't name stays "상호 미확인" with no place.
- Bulk-approve only candidates that have a place and no `geocodeWarning`.
- Research the rest on the web before approving, following "Web Research for
  Review" in `youtube-extract-locations/references/geocoding-and-review.md`.
  Pass the found place in the approval.
- Show the user what you found, with YouTube links at the scene as plain URLs,
  and approve only what they accept.
- When an approved spot turns out wrong, repoint it with `PUT /admin/sunreis/{id}`:
  send every spot as `{id, title}` (omitted spots are deleted) and add `place`
  only to the one being fixed.
