import { defineCollection, z } from "astro:content";

const log = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.date(),
    tag: z.enum(["build", "ship", "decision", "thinking"]),
  }),
});

export const collections = { log };
