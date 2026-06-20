// View-models for the public app (Bb-4). The UI renders directly from the generated
// DTOs; these aliases give the view layer stable, intention-revealing names and a single
// place to diverge from the wire shape if needed.
import type {
  PlaceCardDTO,
  PlaceDTO,
  PlaceMentionDTO,
  SourceDTO,
  SunreiSpotDTO,
} from '@/dto';

export type SourceVM = SourceDTO;
export type MentionVM = PlaceMentionDTO;
export type SpotVM = SunreiSpotDTO;
export type PlaceVM = PlaceDTO;

/** A place feed card: one Place = one marker = one card. */
export type PlaceCardVM = PlaceCardDTO;
