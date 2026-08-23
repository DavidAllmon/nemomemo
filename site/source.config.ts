import { pageSchema } from 'fumadocs-core/source/schema';
import { defineCollections, defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { z } from 'zod';

export const docs = defineDocs({
  dir: 'content/docs',
});

export const blogPosts = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: pageSchema.extend({
    author: z.string(),
    /** ISO date (YYYY-MM-DD) — feeds <time>, BlogPosting JSON-LD, and the RSS feed. */
    date: z.string(),
  }),
});

export default defineConfig({
  mdxOptions: {},
});
