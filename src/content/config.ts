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

const products = defineCollection({
  type: "content",
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    status: z.enum(["shipping", "alpha", "beta", "planning", "coming"]),
    href: z.string(),
    order: z.number().int(),
  }),
});

export const collections = { log, products };
