import { Feed } from "feed";
import { fetchBlogPosts } from "app/lib/blog";
import { metaData } from "app/config";
import { NextResponse } from "next/server";

export async function generateStaticParams() {
  return [
    { format: "rss.xml" },
    { format: "atom.xml" },
    { format: "feed.json" },
  ];
}

export async function GET(_: Request, props: { params: Promise<{ format: string }> }) {
  const params = await props.params;
  const { format } = params;
  const validFormats = ["rss.xml", "atom.xml", "feed.json"];

  if (!validFormats.includes(format)) {
    return NextResponse.json(
      { error: "Unsupported feed format" },
      { status: 404 }
    );
  }

  const BaseUrl = metaData.baseUrl.endsWith("/")
    ? metaData.baseUrl
    : `${metaData.baseUrl}/`;

  const feed = new Feed({
    title: metaData.title,
    description: metaData.description,
    id: BaseUrl,
    link: BaseUrl,
    language: "en",
    copyright: `All rights reserved ${new Date().getFullYear()}, ${
      metaData.title
    }`,
    generator: "Feed for Node.js",
    author: {
      name: metaData.name,
      email: "nxan2911@gmail.com",
    },
    feedLinks: {
      json: `${BaseUrl}feed.json`,
      atom: `${BaseUrl}atom.xml`,
      rss: `${BaseUrl}rss.xml`,
    },
  });

  const blogData = await fetchBlogPosts(1);
  const allPosts = blogData?.posts ?? [];

  allPosts.forEach((post) => {
    const postUrl = `${BaseUrl}blog/${post.slug}`;
    const categories = post.tags
      ? post.tags.split(",").map((tag) => tag.trim())
      : [];

    const postImage = post.cover_image_url
      ? post.cover_image_url
      : `${BaseUrl}${metaData.ogImage.startsWith("/") ? metaData.ogImage.slice(1) : metaData.ogImage}`;

    const publishedDate = post.published_at
      ? new Date(post.published_at)
      : new Date(post.created_at);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feedItem: any = {
      title: post.title,
      id: postUrl,
      link: postUrl,
      description: post.summary ?? "",
      content: post.summary ?? "",
      author: [
        {
          name: post.author.display_name ?? post.author.username,
          email: "nxan2911@gmail.com",
        },
      ],
      date: publishedDate,
      published: publishedDate,
      updated: new Date(post.updated_at),
      image: postImage,
    };

    if (categories.length > 0) {
      feedItem.category = categories.map((tag) => ({
        name: tag,
        term: tag,
      }));
    }

    feed.addItem(feedItem);
  });

  const responseMap: Record<string, { content: string; contentType: string }> =
    {
      "rss.xml": { content: feed.rss2(), contentType: "application/xml" },
      "atom.xml": { content: feed.atom1(), contentType: "application/xml" },
      "feed.json": { content: feed.json1(), contentType: "application/json" },
    };

  const response = responseMap[format];

  return new NextResponse(response.content, {
    headers: {
      "Content-Type": response.contentType,
    },
  });
}
