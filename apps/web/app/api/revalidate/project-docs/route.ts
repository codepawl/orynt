import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

interface RevalidateBody {
  projectSlug: string;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const expectedSecret = process.env.ADMIN_REVALIDATE_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RevalidateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.projectSlug || typeof body.projectSlug !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid projectSlug" },
      { status: 400 },
    );
  }

  revalidatePath(`/projects/${body.projectSlug}/docs`, "layout");

  return NextResponse.json({
    revalidated: true,
    projectSlug: body.projectSlug,
  });
}
