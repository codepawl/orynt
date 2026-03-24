import fs from "fs";
import path from "path";
import { cache } from "react";

type Metadata = {
  title: string;
  publishedAt: string;
  summary: string;
  tags: string;
  image?: string;
};

function parseFrontmatter(fileContent: string) {
  const frontmatterRegex = /---\s*([\s\S]*?)\s*---/;
  const match = frontmatterRegex.exec(fileContent);
  const frontMatterBlock = match![1];
  const content = fileContent.replace(frontmatterRegex, "").trim();
  const frontMatterLines = frontMatterBlock.trim().split("\n");
  const metadata: Partial<Metadata> = {};

  frontMatterLines.forEach((line) => {
    const [key, ...valueArr] = line.split(": ");
    let value = valueArr.join(": ").trim();
    value = value.replace(/^['"](.*)['"]$/, "$1");
    metadata[key.trim() as keyof Metadata] = value;
  });

  return { metadata: metadata as Metadata, content };
}

function parseFrontmatterOnly(fileContent: string) {
  const frontmatterRegex = /---\s*([\s\S]*?)\s*---/;
  const match = frontmatterRegex.exec(fileContent);
  if (!match) return null;
  
  const frontMatterBlock = match[1];
  const frontMatterLines = frontMatterBlock.trim().split("\n");
  const metadata: Partial<Metadata> = {};

  frontMatterLines.forEach((line) => {
    const [key, ...valueArr] = line.split(": ");
    let value = valueArr.join(": ").trim();
    value = value.replace(/^['"](.*)['"]$/, "$1");
    metadata[key.trim() as keyof Metadata] = value;
  });

  return { metadata: metadata as Metadata };
}

const getMDXFiles = cache((dir: string) => {
  return fs.readdirSync(dir).filter((file) => path.extname(file) === ".mdx");
});

const readMDXFile = cache((filePath: string) => {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  return parseFrontmatter(rawContent);
});

const readMDXFileMetadata = cache((filePath: string) => {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  return parseFrontmatterOnly(rawContent);
});

const CONTENT_DIR = path.join(process.cwd(), "content");

const getMDXData = cache(() => {
  const mdxFiles = getMDXFiles(CONTENT_DIR);
  return mdxFiles.map((file) => {
    const { metadata, content } = readMDXFile(path.join(CONTENT_DIR, file));
    const slug = path.basename(file, path.extname(file));

    return {
      metadata,
      slug,
      content,
    };
  });
});

const getMDXDataMetadata = cache(() => {
  const mdxFiles = getMDXFiles(CONTENT_DIR);
  return mdxFiles.map((file) => {
    const filePath = path.join(CONTENT_DIR, file);
    const result = readMDXFileMetadata(filePath);
    if (!result) {
      throw new Error(`Failed to parse frontmatter for ${file}`);
    }
    const slug = path.basename(file, path.extname(file));

    return {
      metadata: result.metadata,
      slug,
    };
  });
});

export function getBlogPosts() {
  return getMDXData();
}

export function getBlogPostsMetadata() {
  return getMDXDataMetadata();
}


