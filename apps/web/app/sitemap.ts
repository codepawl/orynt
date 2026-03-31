import { MetadataRoute } from "next";
import { fetchBlogPosts } from "./lib/blog";
import { fetchNews } from "./lib/news";
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

  const routes = ["", "blog", "news", "projects", "about"].map((route) => ({
    url: `${BaseUrl}${route}`,
    lastModified: new Date().toISOString().split("T")[0],
  }));

  // Fetch published news articles for sitemap
  let newsUrls: MetadataRoute.Sitemap = [];
  try {
    const newsData = await fetchNews(1);
    if (newsData) {
      newsUrls = newsData.articles.map((article) => ({
        url: `${BaseUrl}news/${article.slug}`,
        lastModified: article.published_at || new Date().toISOString().split("T")[0],
      }));
    }
  } catch {
    // Graceful fallback — skip news articles in sitemap
  }

  return [...routes, ...blogs, ...newsUrls];
}
