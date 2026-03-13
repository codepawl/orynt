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
  let frontmatterRegex = /---\s*([\s\S]*?)\s*---/;
  let match = frontmatterRegex.exec(fileContent);
  let frontMatterBlock = match![1];
  let content = fileContent.replace(frontmatterRegex, "").trim();
  let frontMatterLines = frontMatterBlock.trim().split("\n");
  let metadata: Partial<Metadata> = {};

  frontMatterLines.forEach((line) => {
    let [key, ...valueArr] = line.split(": ");
    let value = valueArr.join(": ").trim();
    value = value.replace(/^['"](.*)['"]$/, "$1");
    metadata[key.trim() as keyof Metadata] = value;
  });

  return { metadata: metadata as Metadata, content };
}

function parseFrontmatterOnly(fileContent: string) {
  let frontmatterRegex = /---\s*([\s\S]*?)\s*---/;
  let match = frontmatterRegex.exec(fileContent);
  if (!match) return null;
  
  let frontMatterBlock = match[1];
  let frontMatterLines = frontMatterBlock.trim().split("\n");
  let metadata: Partial<Metadata> = {};

  frontMatterLines.forEach((line) => {
    let [key, ...valueArr] = line.split(": ");
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
  let rawContent = fs.readFileSync(filePath, "utf-8");
  return parseFrontmatter(rawContent);
});

const readMDXFileMetadata = cache((filePath: string) => {
  let rawContent = fs.readFileSync(filePath, "utf-8");
  return parseFrontmatterOnly(rawContent);
});

const CONTENT_DIR = path.join(process.cwd(), "content");

const getMDXData = cache(() => {
  let mdxFiles = getMDXFiles(CONTENT_DIR);
  return mdxFiles.map((file) => {
    let { metadata, content } = readMDXFile(path.join(CONTENT_DIR, file));
    let slug = path.basename(file, path.extname(file));

    return {
      metadata,
      slug,
      content,
    };
  });
});

const getMDXDataMetadata = cache(() => {
  let mdxFiles = getMDXFiles(CONTENT_DIR);
  return mdxFiles.map((file) => {
    let filePath = path.join(CONTENT_DIR, file);
    let result = readMDXFileMetadata(filePath);
    if (!result) {
      throw new Error(`Failed to parse frontmatter for ${file}`);
    }
    let slug = path.basename(file, path.extname(file));

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


