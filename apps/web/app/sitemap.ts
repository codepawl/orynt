import { MetadataRoute } from "next";
import { getBlogPostsMetadata } from "./lib/posts";
import { fetchNews } from "./lib/news";
import { metaData } from "./config";

const BaseUrl = metaData.baseUrl.endsWith("/")
  ? metaData.baseUrl
  : `${metaData.baseUrl}/`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blogs = getBlogPostsMetadata().map((post) => ({
    url: `${BaseUrl}blog/${post.slug}`,
    lastModified: post.metadata.publishedAt,
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
