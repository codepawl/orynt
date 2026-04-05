import { MetadataRoute } from "next";
import { fetchBlogPosts } from "./lib/blog";
import { metaData } from "./config";

const BaseUrl = metaData.baseUrl.endsWith("/")
  ? metaData.baseUrl
  : `${metaData.baseUrl}/`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blogData = await fetchBlogPosts(1).catch(() => null);
  const blogs = (blogData?.posts ?? []).map((post) => ({
    url: `${BaseUrl}blog/${post.slug}`,
    lastModified: post.published_at ?? post.updated_at,
  }));

  const routes = ["", "blog", "projects", "about"].map((route) => ({
    url: `${BaseUrl}${route}`,
    lastModified: new Date().toISOString().split("T")[0],
  }));

  return [...routes, ...blogs];
}
