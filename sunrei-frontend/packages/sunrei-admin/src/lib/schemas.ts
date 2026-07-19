import { z } from 'zod';

// Shared image schema (matches MultiSizeImageDTO).
export const imageSchema = z.object({
  images: z
    .array(
      z.object({
        url: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
    )
    .min(1),
});
export type ImageFormValue = z.infer<typeof imageSchema>;

// A place input for a spot (Google Maps result). Fields are nullish to match the
// generated PlaceInput/PlaceDTO shapes (address/googleMapsId may be absent or null).
export const placeInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  address: z.string().nullish(),
  latitude: z.number(),
  longitude: z.number(),
  googleMapsId: z.string().nullish(),
});
export type PlaceInputFormValue = z.infer<typeof placeInputSchema>;

// ===== Sunrei form =====
export const spotSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Spot title is required'),
  description: z.string().optional(),
  context: z.string().optional(),
  youtubeLink: z.string().url().or(z.literal('')).optional(),
  place: placeInputSchema.nullable(),
  tagIds: z.array(z.string()),
  tagLabels: z.array(z.string()),
  images: z.array(imageSchema).max(5),
  delete: z.boolean().optional(),
});
export type SpotFormValue = z.infer<typeof spotSchema>;

export const sunreiSchema = z.object({
  sourceId: z.string().min(1, 'Source is required'),
  published: z.boolean(),
  title: z.string().min(1, 'Title is required'),
  summary: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(),
  images: z.array(imageSchema).max(10),
  spots: z.array(spotSchema),
});
export type SunreiFormValue = z.infer<typeof sunreiSchema>;

// ===== Source form =====
export const sourceSchema = z
  .object({
    type: z.enum(['YOUTUBE', 'TV', 'ANIME', 'OTHER']),
    name: z.string().min(1, 'Name is required'),
    nameEn: z.string().optional(),
    nameKo: z.string().optional(),
    synopsis: z.string().optional(),
    externalUrl: z.string().optional(),
    posterImage: imageSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'YOUTUBE' && !v.externalUrl) {
      ctx.addIssue({
        path: ['externalUrl'],
        code: z.ZodIssueCode.custom,
        message: 'YouTube sources require an external URL',
      });
    }
  });
export type SourceFormValue = z.infer<typeof sourceSchema>;
