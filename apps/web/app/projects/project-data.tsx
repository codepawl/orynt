export interface ProjectQuickStart {
  install: string;
  example: string;
}

export interface Project {
  title: string;
  year: number;
  description: string;
  url: string;
  slug: string;
  quickStart: ProjectQuickStart;
  docsUrl: string | null;
  packageUrl: string | null;
}

export interface ApiProjectStats {
  stars: number;
  forks: number;
  language: string | null;
  lastCommitDate: string | null;
  lastCommitMessage: string | null;
  latestRelease: string | null;
  latestReleaseDate: string | null;
  openIssues: number;
}

export interface EnrichedProject extends Project {
  stats?: ApiProjectStats;
  isLive: boolean;
}

export const projects: Project[] = [
  {
    title: "Loclean",
    year: 2025,
    description:
      "The All-in-One Local AI Data Cleaning Library. Privacy-first, zero-cost data cleaning using local small language models (SLMs) like Phi-3, Qwen, and Gemma. No GPU or API keys required.",
    url: "https://github.com/nxank4/loclean",
    slug: "loclean",
    quickStart: {
      install: "pip install loclean",
      example: `from loclean import Cleaner

cleaner = Cleaner()
result = cleaner.clean(df, column="address")
print(result.head())`,
    },
    docsUrl: "https://github.com/nxank4/loclean#readme",
    packageUrl: "https://pypi.org/project/loclean/",
  },
  {
    title: "ChromaFusion",
    year: 2024,
    description:
      "An AI-driven application for recoloring grayscale and faded images, enhancing visual quality with precision and a user-friendly interface.",
    url: "https://github.com/lunovian/ChromaFusion",
    slug: "chromafusion",
    quickStart: {
      install: `git clone https://github.com/lunovian/ChromaFusion.git
cd ChromaFusion
pip install -r requirements.txt`,
      example: `python main.py --input grayscale.jpg --output colorized.jpg`,
    },
    docsUrl: "https://github.com/lunovian/ChromaFusion#readme",
    packageUrl: null,
  },
  {
    title: "ANAug",
    year: 2024,
    description:
      "A Python-based data augmentation library for specialized domains like medical imaging, improving model robustness and performance in niche applications.",
    url: "https://github.com/lunovian/an-augment",
    slug: "anaug",
    quickStart: {
      install: "pip install an-augment",
      example: `from anaug import Augmentor

aug = Augmentor(domain="medical")
augmented = aug.transform(image)`,
    },
    docsUrl: "https://github.com/lunovian/an-augment#readme",
    packageUrl: "https://pypi.org/project/an-augment/",
  },
  {
    title: "AI Tool for Room Decoration",
    year: 2023,
    description:
      "An AI-powered assistant that provides tailored recommendations for furniture, color schemes, and room arrangements based on preferences and layout.",
    url: "https://github.com/Ekanara/AI-Tool-for-Room-Decoration",
    slug: "room-decoration",
    quickStart: {
      install: `git clone https://github.com/Ekanara/AI-Tool-for-Room-Decoration.git
cd AI-Tool-for-Room-Decoration
pip install -r requirements.txt`,
      example: `python app.py
# Open http://localhost:5000 in your browser`,
    },
    docsUrl: "https://github.com/Ekanara/AI-Tool-for-Room-Decoration#readme",
    packageUrl: null,
  },
];

/** Get all project slugs for static generation */
export function getProjectSlugs(): string[] {
  return projects.map((p) => p.slug);
}

/** Find a project by its slug */
export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}
