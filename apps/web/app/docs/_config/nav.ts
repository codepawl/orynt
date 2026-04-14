export interface DocNavItem {
  title: string;
  slug: string;
  children?: DocNavItem[];
}

const docsNav: DocNavItem[] = [
  { title: "Introduction", slug: "" },
  {
    title: "Community",
    slug: "community",
    children: [{ title: "Overview", slug: "community" }],
  },
  {
    title: "Papers",
    slug: "papers",
    children: [{ title: "Overview", slug: "papers" }],
  },
  {
    title: "Challenges",
    slug: "challenges",
    children: [{ title: "Overview", slug: "challenges" }],
  },
  {
    title: "Projects",
    slug: "projects",
    children: [{ title: "Overview", slug: "projects" }],
  },
  {
    title: "Shared Package",
    slug: "shared",
    children: [{ title: "Overview", slug: "shared" }],
  },
];

export default docsNav;
