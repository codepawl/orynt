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
    title: "TurboQuant Torch",
    year: 2026,
    description:
      "PyTorch implementation of TurboQuant. Near-optimal vector quantization for KV cache compression and vector search. 3-bit with zero accuracy loss.",
    url: "https://github.com/codepawl/turboquant-torch",
    slug: "turboquant-torch",
    quickStart: {
      install: "pip install turboquant-torch",
      example: `from turboquant import quantize

model = YourModel()
quantized = quantize(model, precision="int8")
quantized.save("model_int8.pt")`,
    },
    docsUrl: null,
    packageUrl: "https://pypi.org/project/turboquant-torch/",
  },
  {
    title: "Loclean",
    year: 2025,
    description:
      "An AI Data Cleaning Library. Privacy-first, zero-cost data cleaning using local small language models (SLMs) like Phi-3, Qwen, and Gemma. No GPU or API keys required.",
    url: "https://github.com/codepawl/loclean",
    slug: "loclean",
    quickStart: {
      install: "pip install loclean",
      example: `from loclean import Cleaner

cleaner = Cleaner()
result = cleaner.clean(df, column="address")
print(result.head())`,
    },
    docsUrl: "https://github.com/codepawl/loclean#readme",
    packageUrl: "https://pypi.org/project/loclean/",
  },
  {
    title: "OpenPawl",
    year: 2026,
    description:
      "Terminal-native AI workspace. You are the conductor.",
    url: "https://github.com/codepawl/openpawl",
    slug: "openpawl",
    quickStart: { install: "", example: "" },
    docsUrl: "https://github.com/codepawl/openpawl#readme",
    packageUrl: null,
  },
  {
    title: "Yeastbook",
    year: 2026,
    description:
      "Standalone. Polyglot. High-performance.",
    url: "https://github.com/codepawl/yeastbook",
    slug: "yeastbook",
    quickStart: { install: "", example: "" },
    docsUrl: "https://github.com/codepawl/yeastbook#readme",
    packageUrl: null,
  },
  {
    title: "Hypedar",
    year: 2026,
    description:
      "Catch the wave before everyone else. Build the first implementation.",
    url: "https://github.com/codepawl/hypedar",
    slug: "hypedar",
    quickStart: { install: "", example: "" },
    docsUrl: "https://github.com/codepawl/hypedar#readme",
    packageUrl: null,
  },
  {
    title: "FeatCat",
    year: 2026,
    description:
      "AI-Powered Feature Catalog for teams.",
    url: "https://github.com/codepawl/featcat",
    slug: "featcat",
    quickStart: { install: "", example: "" },
    docsUrl: "https://github.com/codepawl/featcat#readme",
    packageUrl: null,
  },
  {
    title: "HebbMem",
    year: 2026,
    description:
      "Hebbian memory for AI agents.",
    url: "https://github.com/codepawl/hebbmem",
    slug: "hebbmem",
    quickStart: { install: "", example: "" },
    docsUrl: "https://github.com/codepawl/hebbmem#readme",
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
