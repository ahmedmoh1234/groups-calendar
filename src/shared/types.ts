import z from "zod";

export const HolidayEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  source_text: z.string().min(1),
});

export const HolidayFeedSchema = z.object({
  last_updated: z.string().datetime({ offset: true }),
  holidays: z.array(HolidayEntrySchema),
});

export type HolidayEntry = z.infer<typeof HolidayEntrySchema>;
export type HolidayFeed = z.infer<typeof HolidayFeedSchema>;
