import { Feed } from "feed";
import { getBlogPosts } from "app/lib/posts";
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

  const allPosts = await getBlogPosts();

  allPosts.forEach((post) => {
    const postUrl = `${BaseUrl}blog/${post.slug}`;
    const categories = post.metadata.tags
      ? post.metadata.tags.split(",").map((tag) => tag.trim())
      : [];
    
    const postImage = post.metadata.image
      ? `${BaseUrl}${post.metadata.image.startsWith("/") ? post.metadata.image.slice(1) : post.metadata.image}`
      : `${BaseUrl}${metaData.ogImage.startsWith("/") ? metaData.ogImage.slice(1) : metaData.ogImage}`;
    
    const publishedDate = new Date(post.metadata.publishedAt);

    const feedItem: any = {
      title: post.metadata.title,
      id: postUrl,
      link: postUrl,
      description: post.metadata.summary,
      content: post.metadata.summary,
      author: [
        {
          name: metaData.name,
          email: "nxan2911@gmail.com",
        },
      ],
      date: publishedDate,
      published: publishedDate,
      updated: publishedDate,
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
