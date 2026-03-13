import { MetadataRoute } from "next";
import { getBlogPostsMetadata } from "./lib/posts";
import { metaData } from "./config";

const BaseUrl = metaData.baseUrl.endsWith("/")
  ? metaData.baseUrl
  : `${metaData.baseUrl}/`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let blogs = getBlogPostsMetadata().map((post) => ({
    url: `${BaseUrl}blog/${post.slug}`,
    lastModified: post.metadata.publishedAt,
  }));

  let routes = ["", "blog", "projects", "profile"].map((route) => ({
    url: `${BaseUrl}${route}`,
    lastModified: new Date().toISOString().split("T")[0],
  }));

  return [...routes, ...blogs];
}
